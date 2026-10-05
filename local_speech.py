"""Loopback-only Whisper adapter. Audio and transcripts are never persisted."""
from array import array
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
import json
import math
import re
import subprocess
import sys
import tempfile
import threading
import time
import wave

ROOT = Path(__file__).resolve().parent
MAX_AUDIO_BYTES = 2_000_000
MAX_SECONDS = 60
SESSION_ID = re.compile(r"^[a-zA-Z0-9-]{8,80}$")


class SpeechError(Exception):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def inspect_wav(data):
    if len(data) > MAX_AUDIO_BYTES:
        raise SpeechError("too-long", "每次最多读 60 秒。")
    try:
        with wave.open(BytesIO(data), "rb") as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, "NONE"):
                raise ValueError("format")
            count = wav.getnframes()
            if not 4000 <= count <= MAX_SECONDS * 16000:
                raise SpeechError("duration", "录音太短，或超过了 60 秒。请重新读这句。")
            raw = wav.readframes(count)
            if len(raw) != count * 2:
                raise ValueError("truncated")
    except (ValueError, EOFError, wave.Error):
        raise SpeechError("invalid-audio", "录音格式不完整。请重新开始。") from None
    samples = array("h", raw)
    if sys.byteorder != "little":
        samples.byteswap()
    rms = math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768
    # Suppress silence hallucinations; this is an energy check, not speech scoring.
    audible = sum(abs(value) > 150 for value in samples)
    return count / 16000, rms < 0.0008 or audible < 160


@dataclass
class Job:
    cancel: threading.Event = field(default_factory=threading.Event)
    done: threading.Event = field(default_factory=threading.Event)
    process: object = None


class LocalSpeechEngine:
    def __init__(self, root=ROOT):
        self.binary = root / ".local-speech/whisper.cpp/build/bin/whisper-cli"
        preferred = root / ".local-speech/ggml-small-q5_1.bin"
        self.model = preferred if preferred.is_file() else root / ".local-speech/ggml-base.bin"
        self.jobs, self.cancelled = {}, {}
        self.guard, self.inference = threading.Lock(), threading.Lock()

    def status(self):
        size = 190085487 if self.model.name == "ggml-small-q5_1.bin" else 147951465
        ready = self.binary.is_file() and self.model.is_file() and self.model.stat().st_size == size
        return {"ready": ready, "engine": "whisper.cpp", "model": f"{self.model.name.removeprefix('ggml-').removesuffix('.bin')} · 日语", "localOnly": True,
                "maxSeconds": MAX_SECONDS, "message": "本机 Whisper 已就绪" if ready else "本机模型未安装。请先运行 setup_local_speech.py。"}

    def cancel(self, session):
        if not SESSION_ID.fullmatch(session):
            raise SpeechError("invalid-session", "录音会话无效。")
        with self.guard:
            now = time.monotonic()
            self.cancelled = {key: expiry for key, expiry in self.cancelled.items() if expiry > now}
            self.cancelled[session] = now + 120
            job = self.jobs.get(session)
            if job:
                job.cancel.set()
                if job.process and job.process.poll() is None:
                    job.process.kill()
        if job:
            job.done.wait(2)
        return {"cancelled": True}

    def shutdown(self):
        with self.guard:
            sessions = list(self.jobs)
        for session in sessions:
            self.cancel(session)

    def transcribe(self, data, session):
        if not SESSION_ID.fullmatch(session):
            raise SpeechError("invalid-session", "录音会话无效。")
        if not self.status()["ready"]:
            raise SpeechError("not-ready", self.status()["message"], 503)
        duration, silent = inspect_wav(data)
        with self.guard:
            if self.cancelled.get(session, 0) > time.monotonic():
                raise SpeechError("cancelled", "识别已取消。", 409)
            if session in self.jobs:
                raise SpeechError("busy", "正在处理上一段录音，请稍候。", 429)
            job = Job()
            self.jobs[session] = job
        acquired = False
        started = time.monotonic()
        try:
            if silent:
                return {"text": "", "silent": True, "engine": "whisper.cpp", "seconds": duration}
            acquired = self.inference.acquire(blocking=False)
            if not acquired:
                raise SpeechError("busy", "正在处理上一段录音，请稍候。", 429)
            with tempfile.TemporaryDirectory(prefix="sandy-speech-") as directory:
                audio = Path(directory) / "input.wav"
                output = Path(directory) / "result"
                audio.write_bytes(data)
                # Never provide the expected sentence as a prompt: recognition must
                # reflect audio, not be steered toward the answer on the page.
                command = [str(self.binary), "-m", str(self.model), "-f", str(audio),
                           "-l", "ja", "-t", "4", "-ng", "-nt", "-np", "-oj",
                           "-of", str(output), "-bs", "1", "-bo", "1"]
                with self.guard:
                    if job.cancel.is_set():
                        raise SpeechError("cancelled", "识别已取消。", 409)
                    job.process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                while job.process.poll() is None:
                    if job.cancel.wait(0.1):
                        job.process.kill()
                        job.process.wait()
                        raise SpeechError("cancelled", "识别已取消。", 409)
                    if time.monotonic() - started > 90:
                        job.process.kill()
                        job.process.wait()
                        raise SpeechError("timeout", "本机处理超时，录音已删除。请缩短句子后重试。", 504)
                if job.cancel.is_set():
                    raise SpeechError("cancelled", "识别已取消。", 409)
                if job.process.returncode or not output.with_suffix(".json").is_file():
                    raise SpeechError("engine-error", "本机 Whisper 处理失败，不作判定。", 503)
                result = json.loads(output.with_suffix(".json").read_text())
                text = "".join(segment.get("text", "") for segment in result.get("transcription", []))
                text = re.sub(r"\[_[^\]]*\]", "", text).strip()[:2000]
                return {"text": text, "engine": "whisper.cpp", "language": "ja", "seconds": duration,
                        "elapsed": round(time.monotonic() - started, 2)}
        finally:
            if job.process and job.process.poll() is None:
                job.process.kill()
                job.process.wait()
            if acquired:
                self.inference.release()
            with self.guard:
                self.jobs.pop(session, None)
            job.done.set()

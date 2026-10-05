"""Unit/security checks; actual model inference is tested separately with WAV audio."""
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
import http.client
import json
import sys
import threading
import unittest
import uuid
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_speech import LocalSpeechEngine, SpeechError, inspect_wav
from preview import PreviewHandler
from http.server import ThreadingHTTPServer


def wav_bytes(seconds=1, rate=16000, channels=1, sample=0):
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(int(sample).to_bytes(2, "little", signed=True) * int(seconds * rate * channels))
    return buffer.getvalue()


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = LocalSpeechEngine()
        self.engine.status = lambda: {"ready": True}

    def test_audio_validation_and_silence(self):
        self.assertEqual(inspect_wav(wav_bytes()), (1, True))
        self.assertEqual(inspect_wav(wav_bytes(sample=1000)), (1, False))
        for data in [b"invalid", wav_bytes(rate=48000), wav_bytes(channels=2), wav_bytes(.1), wav_bytes(61), wav_bytes()[:-10]]:
            with self.assertRaises(SpeechError):
                inspect_wav(data)
        with patch("local_speech.subprocess.Popen") as process:
            self.assertEqual(self.engine.transcribe(wav_bytes(), str(uuid.uuid4()))["text"], "")
            process.assert_not_called()

    def test_output_and_cleanup_without_answer_prompt(self):
        paths = []
        class Process:
            returncode = 0
            def __init__(self, command, **kwargs):
                paths.append(Path(command[command.index("-f") + 1]).parent)
                self.assertions = command
                self.output = Path(command[command.index("-of") + 1]).with_suffix(".json")
                self.output.write_text(json.dumps({"transcription": [{"text": "今日は"}, {"text": "晴れです。"}]}))
            def poll(self):
                return 0
        with patch("local_speech.subprocess.Popen", Process):
            result = self.engine.transcribe(wav_bytes(sample=1000), str(uuid.uuid4()))
        self.assertEqual(result["text"], "今日は晴れです。")
        self.assertFalse(paths[0].exists(), "delete audio and result files after inference")
        self.assertFalse(self.engine.jobs)
        self.assertTrue(self.engine.inference.acquire(blocking=False))
        self.engine.inference.release()

    def test_failed_process_cleanup_and_cancel_tombstone(self):
        paths = []
        class Process:
            returncode = 1
            def __init__(self, command, **kwargs):
                self.command = command
                paths.append(Path(command[command.index("-f") + 1]).parent)
                assert "--prompt" not in command and "-p" not in command
            def poll(self):
                return 1
        with patch("local_speech.subprocess.Popen", Process):
            with self.assertRaises(SpeechError):
                self.engine.transcribe(wav_bytes(sample=1000), str(uuid.uuid4()))
        self.assertFalse(paths[0].exists())
        session = str(uuid.uuid4())
        self.engine.cancel(session)
        with self.assertRaises(SpeechError) as error:
            self.engine.transcribe(wav_bytes(sample=1000), session)
        self.assertEqual(error.exception.code, "cancelled")

    def test_cancel_running_cpu_job(self):
        launched, finished = threading.Event(), threading.Event()
        paths, errors = [], []
        class Process:
            returncode = None
            def __init__(self, command, **kwargs):
                paths.append(Path(command[command.index("-f") + 1]).parent)
                launched.set()
            def poll(self):
                return self.returncode
            def kill(self):
                self.returncode = -9
            def wait(self):
                return self.returncode
        session = str(uuid.uuid4())
        def run():
            try:
                self.engine.transcribe(wav_bytes(sample=1000), session)
            except SpeechError as error:
                errors.append(error.code)
            finally:
                finished.set()
        with patch("local_speech.subprocess.Popen", Process):
            thread = threading.Thread(target=run)
            thread.start()
            self.assertTrue(launched.wait(2))
            self.engine.cancel(session)
            self.assertTrue(finished.wait(2))
            thread.join()
        self.assertEqual(errors, ["cancelled"])
        self.assertFalse(paths[0].exists())
        self.assertFalse(self.engine.jobs)


class QuietHandler(PreviewHandler):
    def log_message(self, *args):
        pass


class EndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        status, data, response_headers = response.status, response.read(), response.headers
        connection.close()
        self.assertIsNone(response_headers.get("Access-Control-Allow-Origin"))
        return status, data

    def test_fixed_allowlist_and_host(self):
        self.assertEqual(self.request("GET", "/api/speech/status")[0], 200)
        self.assertEqual(self.request("GET", "/api/speech/status", headers={"Host": "evil.example"})[0], 403)
        for path in ["/.git/config", "/local_speech.py", "/.local-speech/ggml-base.bin", "/assets/../preview.py", "/assets/"]:
            self.assertEqual(self.request("GET", path)[0], 404)
        self.assertEqual(self.request("GET", "/assets/mic-worklet.js")[0], 200)

    def test_learning_home_and_original_routes(self):
        status, home = self.request("GET", "/home.html")
        self.assertEqual(status, 200)
        self.assertIn(b'data-page="home"', home)
        self.assertEqual(self.request("GET", "/"), (200, home))
        self.assertEqual(self.request("GET", "/?engine=local-whisper"), (200, home))
        for route in ["index.html", "grammar-quiz.html", "conversations.html", "vocab.html", "grammar.html", "mistakes.html", "shadow-words.html", "tag.html", "textbook.html", "login.html"]:
            self.assertEqual(self.request("GET", "/" + route)[0], 200)

    def test_no_cross_site_audio_and_bounded_requests(self):
        body = json.dumps({"session": str(uuid.uuid4())})
        path = "/api/speech/cancel"
        for origin in [None, "https://evil.example", "null", "http://127.0.0.1:9999"]:
            headers = {"Content-Type": "application/json"}
            if origin:
                headers["Origin"] = origin
            self.assertEqual(self.request("POST", path, body, headers)[0], 403)
        headers = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.port}"}
        self.assertEqual(self.request("POST", path, body, headers)[0], 200)
        self.assertEqual(self.request("POST", path, "x" * 300, headers)[0], 413)
        self.assertEqual(self.request("POST", path, "{}", {**headers, "Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("POST", path, "{}", {**headers, "Sec-Fetch-Site": "cross-site"})[0], 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)

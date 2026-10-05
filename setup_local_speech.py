"""One-time, project-local CPU Whisper installation; no Homebrew or API key."""
from pathlib import Path
import hashlib
import subprocess
import sys
import tarfile
import venv

ROOT = Path(__file__).resolve().parent
LOCAL = ROOT / ".local-speech"
SOURCE_SHA = "927cfce34f31707e17f2bff35c349632fb9e2c3a"
ARCHIVE_SHA256 = "41b664fee09e79176ac277b5237debec34f8d74af3c7d71f333f1ec67989ecde"
MODEL_SHA256 = "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def download(url, target, expected):
    if target.is_file() and digest(target) == expected:
        return
    partial = target.with_suffix(target.suffix + ".part")
    subprocess.run(["curl", "-L", "--fail", "--show-error", "--retry", "2", url, "-o", str(partial)], check=True)
    if digest(partial) != expected:
        partial.unlink(missing_ok=True)
        raise RuntimeError("Download checksum mismatch; installation stopped.")
    partial.replace(target)


def main():
    LOCAL.mkdir(exist_ok=True)
    python = LOCAL / "venv/bin/python"
    if not python.is_file():
        venv.EnvBuilder(with_pip=True).create(LOCAL / "venv")
    subprocess.run([str(python), "-m", "pip", "install", "--no-cache-dir", "cmake==3.31.10"], check=True)
    archive = LOCAL / "whisper-source.tar.gz"
    download(f"https://github.com/ggml-org/whisper.cpp/archive/{SOURCE_SHA}.tar.gz", archive, ARCHIVE_SHA256)
    source = LOCAL / "whisper.cpp"
    if not source.is_dir():
        with tarfile.open(archive) as tar:
            # Python 3.12's data filter rejects path traversal and unsafe links.
            tar.extractall(LOCAL, filter="data")
        (LOCAL / f"whisper.cpp-{SOURCE_SHA}").rename(source)
    cmake = str(LOCAL / "venv/bin/cmake")
    subprocess.run([cmake, "-S", str(source), "-B", str(source / "build"), "-DCMAKE_BUILD_TYPE=Release",
                    "-DGGML_METAL=OFF", "-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_BUILD_SERVER=OFF", "-DBUILD_SHARED_LIBS=OFF",
                    "-DCMAKE_CXX_FLAGS=-include errno.h"], check=True)
    subprocess.run([cmake, "--build", str(source / "build"), "--target", "whisper-cli", "-j", "4"], check=True)
    download("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin", LOCAL / "ggml-small-q5_1.bin", MODEL_SHA256)
    print("Ready. Run preview.py, then open http://127.0.0.1:8765/conversations.html")


if __name__ == "__main__":
    if sys.version_info < (3, 12):
        raise SystemExit("Use Python 3.12 or later (Codex's bundled Python is supported).")
    main()

"""Local preview of the generated site only; no directory listing or private files."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
from local_speech import LocalSpeechEngine, SpeechError, MAX_AUDIO_BYTES
from ipad_access import private_origin as validate_private_origin, read_private_origin

ROOT = Path(__file__).resolve().parent
PAGES = {"home.html", "index.html", "grammar-quiz.html", "vocab.html", "grammar.html", "conversations.html", "mistakes.html", "shadow-words.html", "tag.html", "textbook.html", "login.html"}
ASSETS = {"app.css", "app.js", "mic-worklet.js", "data.js", "vocab.js", "dialogues.js", "traps.js", "sandy-green-eyes.png", "sandy-meow-1.wav", "sandy-purr-1.wav"}
ENGINE = LocalSpeechEngine()


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed(self):
        path = unquote(urlsplit(self.path).path).lstrip("/") or "home.html"
        return path in PAGES or path.startswith("assets/") and path.removeprefix("assets/") in ASSETS

    def local_request(self, write=False):
        # Exact Host + Origin checks prevent a foreign website using this local
        # endpoint through CORS, simple form posts, or DNS rebinding.
        host = self.headers.get("Host", "")
        hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        origins = {"http://" + allowed for allowed in hosts}  # No wildcard origins or CORS.
        private = self.private_origin()
        if private:
            hostname = urlsplit(private).hostname
            hosts.update({hostname, hostname + ":443"})
            origins.add(private)
        if self.headers.get("Tailscale-Funnel-Request"):
            return False
        return host in hosts and (not write or (
            self.headers.get("Origin") in origins and
            self.headers.get("Sec-Fetch-Site", "same-origin") in {"same-origin", "none"}))

    def private_origin(self):
        return validate_private_origin(getattr(self.server, "private_origin", None)) or read_private_origin()

    def respond(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self.local_request():
            self.send_error(403)
            return
        if urlsplit(self.path).path == "/api/speech/status":
            self.respond({**ENGINE.status(), "private_origin": self.private_origin(), "access_version": 1})
            return
        if urlsplit(self.path).path == "/":
            self.path = "/home.html"
        if not self.allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.local_request() or not self.allowed():
            self.send_error(404)
            return
        super().do_HEAD()

    def do_POST(self):
        if not self.local_request(write=True):
            self.respond({"code": "origin", "message": "只接受本机页面或已配置的私人 HTTPS 页面请求。"}, 403)
            return
        path = urlsplit(self.path).path
        try:
            if path not in {"/api/speech/transcribe", "/api/speech/cancel"}:
                raise SpeechError("not-found", "找不到这个本机接口。", 404)
            maximum = MAX_AUDIO_BYTES if path.endswith("transcribe") else 256
            try:
                size = int(self.headers.get("Content-Length", "-1"))
            except ValueError:
                size = -1
            if self.headers.get("Transfer-Encoding") or not 0 < size <= maximum:
                raise SpeechError("size", "录音请求太大或不完整。", 413)
            kind = self.headers.get("Content-Type", "").split(";")[0]
            if kind != ("audio/wav" if path.endswith("transcribe") else "application/json"):
                raise SpeechError("format", "请求格式不正确。", 415)
            self.connection.settimeout(15)
            body = self.rfile.read(size)
            if len(body) != size:
                raise SpeechError("size", "录音未完整接收。")
            if path.endswith("cancel"):
                payload = json.loads(body)
                if not isinstance(payload, dict) or not isinstance(payload.get("session"), str):
                    raise SpeechError("invalid-session", "录音会话无效。")
                data = ENGINE.cancel(payload["session"])
            else:
                data = ENGINE.transcribe(body, self.headers.get("X-Speech-Session", ""))
            self.respond(data)
        except SpeechError as error:
            self.respond({"code": error.code, "message": error.message}, error.status)
        except (ValueError, TimeoutError):
            self.respond({"code": "invalid-request", "message": "请求不完整，请重试。"}, 400)
        except Exception:
            self.respond({"code": "local-error", "message": "本机处理失败，录音不作判定。"}, 500)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "microphone=(self)")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), PreviewHandler)
    print("Business Japanese with Sandy: http://127.0.0.1:8765", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        ENGINE.shutdown()
        server.server_close()

"""Local preview of the generated site only; no directory listing or private files."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent
PAGES = {"index.html", "grammar-quiz.html", "vocab.html", "grammar.html", "conversations.html", "mistakes.html", "tag.html", "textbook.html", "login.html"}
ASSETS = {"app.css", "app.js", "data.js", "vocab.js", "dialogues.js", "traps.js", "sandy-green-eyes.png", "sandy-meow-1.wav", "sandy-purr-1.wav"}


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed(self):
        path = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        return path in PAGES or path.startswith("assets/") and path.removeprefix("assets/") in ASSETS

    def do_GET(self):
        if not self.allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.allowed():
            self.send_error(404)
            return
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), PreviewHandler)
    print("Business Japanese with Sandy: http://127.0.0.1:8765", flush=True)
    server.serve_forever()

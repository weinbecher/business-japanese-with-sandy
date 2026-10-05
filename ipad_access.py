"""Optional private iPad access; never enable Funnel or serve a directory."""
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / ".local-speech/ipad-access.json"
TARGET = "http://127.0.0.1:8765"
HOST_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ts\.net", re.I)


def private_origin(value):
    if not isinstance(value, str):
        return None
    try:
        url = urlsplit(value)
        if (url.scheme == "https" and HOST_PATTERN.fullmatch(url.hostname or "")
                and url.port in (None, 443) and not url.username and not url.password
                and url.path in ("", "/") and not url.query and not url.fragment):
            return "https://" + url.hostname.lower()
    except ValueError:
        pass
    return None


def read_private_origin():
    try:
        data = json.loads(CONFIG.read_text())
        return private_origin(data.get("origin")) if data.get("version") == 1 else None
    except (OSError, ValueError, AttributeError):
        return None


def check_serve_config(config, origin):
    """Do not replace other apps' routes or accept public Funnel/foreground sharing."""
    if not isinstance(config, dict):
        raise ValueError("Cannot verify Tailscale Serve configuration.")
    if any(not isinstance(config.get(name) or {}, dict) for name in ("AllowFunnel", "Foreground", "TCP", "Web")):
        raise ValueError("Unsupported Tailscale Serve configuration; no settings were changed.")
    if any((config.get("AllowFunnel") or {}).values()):
        raise ValueError("Public Funnel is enabled. Disable it before setting up private Sandy access.")
    for foreground in (config.get("Foreground") or {}).values():
        if not isinstance(foreground, dict):
            raise ValueError("Cannot verify an existing foreground sharing session.")
        if (foreground.get("TCP") or {}).get("443") or any((foreground.get("AllowFunnel") or {}).values()):
            raise ValueError("Another foreground sharing session is active; no settings were changed.")
    tcp = (config.get("TCP") or {}).get("443")
    web = {key: value for key, value in (config.get("Web") or {}).items() if key.endswith(":443")}
    if tcp is None and not web:
        return False
    key = urlsplit(origin).hostname + ":443"
    handlers = web.get(key, {}).get("Handlers", {})
    if (set(web) != {key} or set(handlers) != {"/"} or not tcp or not tcp.get("HTTPS")
            or tcp.get("TCPForward") or handlers["/"].get("Proxy", "").rstrip("/") != TARGET):
        raise ValueError("Port 443 already serves another app. Sandy will not overwrite it.")
    return True


def tailscale_binary():
    binary = shutil.which("tailscale")
    app = Path("/Applications/Tailscale.app/Contents/MacOS/Tailscale")
    return binary or (str(app) if app.is_file() else None)


def tailscale_json(binary, *args):
    result = subprocess.run([binary, *args], text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise ValueError("Open Tailscale and sign in, then run this launcher again.")
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise ValueError("Tailscale did not return a valid status; no settings were changed.") from None


def local_server_status():
    try:
        with urllib.request.urlopen(TARGET + "/api/speech/status", timeout=2) as response:
            return json.load(response)
    except (urllib.error.URLError, ValueError, TimeoutError):
        return None


def main():
    binary = tailscale_binary()
    if not binary:
        print("Install Tailscale on this Mac and your iPad, sign in to the same account, then run this launcher again.")
        print("Mac: https://tailscale.com/download/mac   iPad: https://tailscale.com/download/ios")
        return 1
    if not (ROOT / ".local-speech/venv/bin/python").is_file():
        print("Install the local speech model first with setup_local_speech.py.")
        return 1
    device = tailscale_json(binary, "status", "--json")
    origin = private_origin("https://" + device.get("Self", {}).get("DNSName", "").rstrip("."))
    if device.get("BackendState") != "Running" or not origin:
        raise ValueError("Connect this Mac to Tailscale first; its private device name is not ready.")
    config = tailscale_json(binary, "serve", "status", "--json")
    configured = check_serve_config(config, origin)
    active = local_server_status()
    if active and (active.get("engine") != "whisper.cpp" or active.get("access_version") != 1):
        raise ValueError("An older/different server is using port 8765. Close its server window and run this launcher again.")
    if not configured:
        print("Setting up private HTTPS only. If Tailscale asks, allow HTTPS/Serve, not public Funnel.", flush=True)
        subprocess.run([binary, "serve", "--bg", "--https=443", TARGET], check=True, timeout=180)
    if not check_serve_config(tailscale_json(binary, "serve", "status", "--json"), origin):
        raise ValueError("Private HTTPS was not configured. Sandy has not allowed remote recording.")
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps({"version": 1, "origin": origin}) + "\n")
    CONFIG.chmod(0o600)
    print("\nOn your iPad, connect Tailscale and open:\n" + origin + "/conversations.html?speech=whisper", flush=True)
    print("Keep this Mac awake. Your iPad records; Whisper processes on this Mac. This is not a public website.", flush=True)
    webbrowser.open(TARGET + "/conversations.html")
    if active:
        print("Sandy is already running. The existing server has picked up your private address.")
        return 0
    server = subprocess.Popen([sys.executable, str(ROOT / "preview.py")], cwd=ROOT)
    try:
        return server.wait()
    except KeyboardInterrupt:
        server.terminate()
        server.wait(timeout=10)
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print("Setup stopped: " + str(error))
        sys.exit(1)

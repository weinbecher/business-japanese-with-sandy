#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if [[ ! -x .local-speech/venv/bin/python ]]; then
  print 'The local speech model is not installed yet. Ask Codex to run setup_local_speech.py.'
  exit 1
fi
if curl --fail --silent --max-time 1 'http://127.0.0.1:8765/api/speech/status' >/dev/null 2>&1; then
  open 'http://127.0.0.1:8765/home.html'
  exit 0
fi
open 'http://127.0.0.1:8765/home.html'
exec .local-speech/venv/bin/python preview.py

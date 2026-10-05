#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if [[ ! -x .local-speech/venv/bin/python ]]; then
  print 'The local speech model is not installed yet. Ask Codex to run setup_local_speech.py.'
  exit 1
fi
.local-speech/venv/bin/python ipad_access.py
result=$?
if (( result != 0 )); then
  read -r '?Press Return to close this window.'
fi
exit $result

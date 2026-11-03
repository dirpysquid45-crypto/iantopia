# MP3 to TXT

Drag MP3 files onto a web page and get plain-text transcripts back. Runs
locally with [faster-whisper](https://github.com/SYSTRAN/faster-whisper), so no
cloud account or upload to a third party is needed.

This is a local, offline-capable take on the older
[mp3-to-txt](https://github.com/paulaaronfrank/mp3-to-txt) script, which
transcribed through Google Cloud Speech-to-Text (it needed a GCP bucket and
credentials).

## Setup

Requires Python 3.10+ and `ffmpeg` on your PATH (used to decode audio).

```bash
cd mp3-to-text
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:8765, drop your files on the page, and click
**Download .txt** on each result.

## Options

Environment variables:

| Variable        | Default | Notes                                                        |
|-----------------|---------|--------------------------------------------------------------|
| `WHISPER_MODEL` | `base`  | `tiny`, `base`, `small`, `medium`, `large-v3`. Bigger = more accurate and slower. |
| `PORT`          | `8765`  | Port for the local web server.                               |

Example: `WHISPER_MODEL=small python app.py`

The first run downloads the chosen model from Hugging Face (`base` is about 150 MB).
After that it is cached and the app works offline.

## Notes

- Files are processed one at a time, in the order they were dropped.
- Uploads are written to a temp folder and deleted once transcription finishes.
- The server listens on 127.0.0.1 only, so other machines on your network can't reach it.
- Language is auto-detected unless you pick one; picking one is faster and more reliable for short clips.

"""MP3 to TXT - drag audio files onto a page, get plain-text transcripts back.

Runs entirely on your machine using faster-whisper (no cloud account needed).
The first run downloads the chosen Whisper model from Hugging Face; after
that it works offline.

    python app.py            # then open http://127.0.0.1:8765
"""

import os
import shutil
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse

HERE = Path(__file__).resolve().parent
STATIC_INDEX = HERE / "static" / "index.html"

# Model size: tiny, base, small, medium, large-v3. Bigger = more accurate, slower.
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac"}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB per file

app = FastAPI(title="MP3 to TXT")

_model = None
_model_lock = threading.Lock()


def get_model():
    """Load the Whisper model once, on first use."""
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel

            # int8 keeps memory low on ordinary laptops and runs on CPU.
            _model = WhisperModel(MODEL_NAME, device="auto", compute_type="int8")
    return _model


def transcribe_file(path: str, language: str | None) -> dict:
    model = get_model()
    segments, info = model.transcribe(
        path,
        language=language or None,  # None = auto-detect
        vad_filter=True,            # skip long stretches of silence
    )
    text = " ".join(seg.text.strip() for seg in segments if seg.text.strip())
    return {
        "text": text.strip(),
        "language": info.language,
        "duration": round(info.duration, 1),
    }


@app.get("/")
async def index():
    return FileResponse(STATIC_INDEX)


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(""),
):
    name = Path(file.filename or "audio.mp3").name
    suffix = Path(name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Use: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    tmpdir = tempfile.mkdtemp(prefix="mp3tt_")
    try:
        target = Path(tmpdir) / f"input{suffix}"
        written = 0
        with open(target, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File is larger than 500 MB")
                out.write(chunk)

        if written == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        try:
            result = await run_in_threadpool(transcribe_file, str(target), language.strip())
        except Exception as exc:  # decoding errors, model download failures, etc.
            raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}")

        return JSONResponse({"filename": Path(name).stem, **result})
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8765"))
    print(f"MP3 to TXT running at http://127.0.0.1:{port}  (model: {MODEL_NAME})")
    uvicorn.run(app, host="127.0.0.1", port=port)

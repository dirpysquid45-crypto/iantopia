import os
import re
import json
import tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TRANSCRIPTS_DIR = Path("/app/transcripts")
DOWNLOADS_DIR = Path("/app/downloads")
AUDIO_DIR = Path("/app/audio")
PREFERENCES_FILE = TRANSCRIPTS_DIR / "preferences.json"

TRANSCRIPTS_DIR.mkdir(exist_ok=True)
DOWNLOADS_DIR.mkdir(exist_ok=True)
AUDIO_DIR.mkdir(exist_ok=True)

class YouTubeLink(BaseModel):
    url: str
    overwrite: bool = None

class DuplicateAction(BaseModel):
    video_id: str
    action: str
    dont_ask_again: bool = False

def extract_video_id(url: str) -> str:
    pattern = r"(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]{11})"
    match = re.search(pattern, url)
    if not match:
        raise ValueError("Invalid YouTube URL")
    return match.group(1)

def get_video_title(video_id: str) -> str:
    try:
        ydl_opts = {'quiet': True, 'no_warnings': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            return info.get('title', 'Unknown Title')
    except:
        return f"YouTube Video {video_id}"

def get_preferences() -> dict:
    if PREFERENCES_FILE.exists():
        with open(PREFERENCES_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_preferences(prefs: dict):
    with open(PREFERENCES_FILE, 'w') as f:
        json.dump(prefs, f, indent=2)

@app.post("/api/fetch-transcript")
async def fetch_transcript(data: YouTubeLink):
    try:
        video_id = extract_video_id(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    title = get_video_title(video_id)
    filename = f"{title}.txt"
    filepath = TRANSCRIPTS_DIR / filename

    prefs = get_preferences()

    if filepath.exists():
        if video_id in prefs and prefs[video_id].get("dont_ask_again"):
            action = prefs[video_id].get("action", "skip")
            if action == "skip":
                return {
                    "status": "skipped",
                    "message": f"Transcript already exists: {filename}",
                    "filename": filename
                }
        else:
            if data.overwrite is None:
                return {
                    "status": "duplicate_exists",
                    "message": f"Transcript already exists. Overwrite?",
                    "filename": filename,
                    "video_id": video_id
                }

    try:
        # Use yt-dlp to extract subtitles/transcripts
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)

            ydl_opts = {
                'quiet': False,
                'no_warnings': False,
                'skip_download': True,
                'writesubtitles': True,
                'writeautomaticsub': True,
                'subtitlesformat': 'vtt',
                'subtitleslangs': ['en', 'en-US', 'en-GB'],
                'outtmpl': str(tmpdir_path / f"{video_id}"),
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}")

            # Find and read the subtitle file
            vtt_files = list(tmpdir_path.glob("*.vtt"))
            if not vtt_files:
                raise Exception("No subtitles/captions found for this video")

            # Read the first VTT file found
            with open(vtt_files[0], 'r', encoding='utf-8') as f:
                vtt_content = f.read()

            # Parse VTT and extract text
            transcript_text = ""
            for line in vtt_content.split('\n'):
                # Skip VTT header, timestamps, and empty lines
                if line.strip() and not line.startswith('WEBVTT') and '-->' not in line and not line.startswith('NOTE'):
                    transcript_text += line.strip() + "\n"

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(transcript_text)

        return {
            "status": "success",
            "message": f"Transcript saved: {filename}",
            "filename": filename,
            "video_id": video_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch transcript: {str(e)}")

@app.post("/api/handle-duplicate")
async def handle_duplicate(data: DuplicateAction):
    prefs = get_preferences()
    prefs[data.video_id] = {
        "action": data.action,
        "dont_ask_again": data.dont_ask_again
    }
    save_preferences(prefs)

    if data.action == "overwrite":
        return {"status": "ready_to_fetch"}
    return {"status": "skipped"}

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/api/transcripts")
async def list_transcripts():
    try:
        files = list(TRANSCRIPTS_DIR.glob("*.txt"))
        transcripts = []
        for file in files:
            transcripts.append({
                "filename": file.name,
                "size": file.stat().st_size,
                "modified": file.stat().st_mtime
            })
        return {"transcripts": transcripts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{filename}")
async def download_transcript(filename: str):
    try:
        # Sanitize filename to prevent directory traversal
        if ".." in filename or "/" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        filepath = TRANSCRIPTS_DIR / filename

        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=filepath,
            filename=filename,
            media_type="text/plain"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/download-video")
async def download_video(data: YouTubeLink):
    try:
        video_id = extract_video_id(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        ydl_opts = {
            'quiet': False,
            'no_warnings': False,
            'format': 'best[ext=mp4]',
            'outtmpl': str(DOWNLOADS_DIR / f"%(title)s.%(ext)s"),
            'socket_timeout': 30,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}")
            filename = ydl.prepare_filename(info)

        return {
            "status": "success",
            "message": f"Video downloaded: {info.get('title')}",
            "filename": Path(filename).name,
            "video_id": video_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")

@app.get("/api/downloads")
async def list_downloads():
    try:
        files = list(DOWNLOADS_DIR.glob("*"))
        downloads = []
        for file in files:
            if file.is_file():
                size_mb = (file.stat().st_size / (1024 * 1024))
                downloads.append({
                    "filename": file.name,
                    "size": file.stat().st_size,
                    "size_mb": f"{size_mb:.2f}",
                    "modified": file.stat().st_mtime
                })
        return {"downloads": sorted(downloads, key=lambda x: x['modified'], reverse=True)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download-video/{filename}")
async def download_video_file(filename: str):
    try:
        # Sanitize filename to prevent directory traversal
        if ".." in filename or "/" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        filepath = DOWNLOADS_DIR / filename

        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=filepath,
            filename=filename,
            media_type="video/mp4"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/download-audio")
async def download_audio(data: YouTubeLink):
    try:
        video_id = extract_video_id(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        ydl_opts = {
            'quiet': False,
            'no_warnings': False,
            'format': 'bestaudio/best',
            'outtmpl': str(AUDIO_DIR / f"%(title)s.%(ext)s"),
            'socket_timeout': 30,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}")
            # FFmpegExtractAudio always outputs .mp3 regardless of the
            # source container extension yt-dlp downloaded (e.g. .webm/.m4a),
            # so the post-processed filename differs from prepare_filename().
            raw_filename = ydl.prepare_filename(info)
            filename = Path(raw_filename).with_suffix('.mp3').name

        return {
            "status": "success",
            "message": f"Audio downloaded: {info.get('title')}",
            "filename": filename,
            "video_id": video_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download audio: {str(e)}")

@app.get("/api/audio")
async def list_audio():
    try:
        files = list(AUDIO_DIR.glob("*.mp3"))
        audio_files = []
        for file in files:
            if file.is_file():
                size_mb = (file.stat().st_size / (1024 * 1024))
                audio_files.append({
                    "filename": file.name,
                    "size": file.stat().st_size,
                    "size_mb": f"{size_mb:.2f}",
                    "modified": file.stat().st_mtime
                })
        return {"audio": sorted(audio_files, key=lambda x: x['modified'], reverse=True)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download-audio/{filename}")
async def download_audio_file(filename: str):
    try:
        # Sanitize filename to prevent directory traversal
        if ".." in filename or "/" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        filepath = AUDIO_DIR / filename

        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=filepath,
            filename=filename,
            media_type="audio/mpeg"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

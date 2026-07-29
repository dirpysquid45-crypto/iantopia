import re
import shutil
import tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
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

class YouTubeLink(BaseModel):
    url: str

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

def _cleanup_dir(dirpath: str):
    shutil.rmtree(dirpath, ignore_errors=True)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/fetch-transcript")
async def fetch_transcript(data: YouTubeLink):
    try:
        video_id = extract_video_id(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    title = get_video_title(video_id)
    filename = f"{title}.txt"

    tmpdir = tempfile.mkdtemp(prefix="ytt_")
    try:
        # Use yt-dlp to extract subtitles/transcripts
        ydl_opts = {
            'quiet': False,
            'no_warnings': False,
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitlesformat': 'vtt',
            'subtitleslangs': ['en', 'en-US', 'en-GB'],
            'outtmpl': str(Path(tmpdir) / f"{video_id}"),
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}")

        # Find and read the subtitle file
        vtt_files = list(Path(tmpdir).glob("*.vtt"))
        if not vtt_files:
            raise Exception("No subtitles/captions found for this video")

        with open(vtt_files[0], 'r', encoding='utf-8') as f:
            vtt_content = f.read()

        # Parse VTT and extract text
        transcript_text = ""
        for line in vtt_content.split('\n'):
            # Skip VTT header, timestamps, and empty lines
            if line.strip() and not line.startswith('WEBVTT') and '-->' not in line and not line.startswith('NOTE'):
                transcript_text += line.strip() + "\n"

        out_path = Path(tmpdir) / filename
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(transcript_text)

        return FileResponse(
            path=out_path,
            filename=filename,
            media_type="text/plain",
            background=BackgroundTask(_cleanup_dir, tmpdir),
        )
    except HTTPException:
        raise
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch transcript: {str(e)}")

@app.post("/api/download-video")
async def download_video(data: YouTubeLink):
    try:
        video_id = extract_video_id(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    tmpdir = tempfile.mkdtemp(prefix="ytv_")
    try:
        ydl_opts = {
            'quiet': False,
            'no_warnings': False,
            'format': 'best[ext=mp4]',
            'outtmpl': str(Path(tmpdir) / "%(title)s.%(ext)s"),
            'socket_timeout': 30,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}")
            filepath = Path(ydl.prepare_filename(info))

        if not filepath.exists():
            raise Exception("Conversion did not produce an output file")

        return FileResponse(
            path=filepath,
            filename=filepath.name,
            media_type="video/mp4",
            background=BackgroundTask(_cleanup_dir, tmpdir),
        )
    except HTTPException:
        raise
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")

@app.post("/api/download-audio")
async def download_audio(data: YouTubeLink):
    try:
        video_id = extract_video_id(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    tmpdir = tempfile.mkdtemp(prefix="yta_")
    try:
        ydl_opts = {
            'quiet': False,
            'no_warnings': False,
            'format': 'bestaudio/best',
            'outtmpl': str(Path(tmpdir) / "%(title)s.%(ext)s"),
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
            filepath = Path(raw_filename).with_suffix('.mp3')

        if not filepath.exists():
            raise Exception("Conversion did not produce an output file")

        return FileResponse(
            path=filepath,
            filename=filepath.name,
            media_type="audio/mpeg",
            background=BackgroundTask(_cleanup_dir, tmpdir),
        )
    except HTTPException:
        raise
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to download audio: {str(e)}")

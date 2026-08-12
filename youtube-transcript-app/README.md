# YouTube Transcript Downloader

A web app to fetch YouTube transcripts, video, and audio files. Built with Astro (frontend) + FastAPI (backend) + Docker.

## Architecture

**Streaming-based, no local persistence.** All downloads are ephemeral:

- User requests a transcript/video/audio via the web UI
- Backend streams the file directly to the browser
- No files are stored on the server after the response

```text
Astro Frontend (Cloudflare Tunnel)
       ↓
FastAPI Backend (Docker)
       ↓
    YouTube
```

## Deployment

Deployed to a home server ("Qasim") behind a Cloudflare Tunnel. The tunnel itself
(`cloudflared`) is configured directly on Qasim, not tracked in this repo.

### Prerequisites

- Docker & Docker Compose
- `cloudflared` already configured and running on the host (routes `iantopia.com`
  to this box)

### Deploy

```bash
cd youtube-transcript-app
git pull
docker-compose -f docker-compose.prod.yml build backend   # after backend/app.py changes
docker-compose -f docker-compose.prod.yml up -d
```

This runs:

- **Frontend:** Astro on port 3000 (behind nginx reverse proxy)
- **Backend:** FastAPI on port 8000
- **Nginx:** Reverse proxy on ports 80/443, also serves the main Iantopia site's
  static build (`/home/user/iantopia/dist`) at `/`

### Access the App

Via the Cloudflare Tunnel (`iantopia.com/transcripts/`) or locally at `http://localhost`
if the tunnel isn't running.

## Development

### Local Dev Mode

```bash
cd frontend && npm install && npm run dev    # Astro on :3000
cd backend && python -m venv venv && . venv/bin/activate && pip install -r requirements.txt && uvicorn app:app --reload --port 8000
```

Frontend dev server auto-proxies to `http://localhost:8000` for API requests.

## File Structure

```text
youtube-transcript-app/
├── frontend/                # Astro web UI
├── backend/                 # FastAPI app (app.py)
├── docker-compose.prod.yml  # Production orchestration
└── nginx.conf               # Reverse proxy config (also serves the main site)
```

## Troubleshooting

**Containers won't start?**

```bash
docker-compose -f docker-compose.prod.yml logs
```

**Backend API not responding?**

```bash
curl http://localhost:8000/api/health
```

**Frontend blank or broken?**

- Check nginx logs: `docker-compose -f docker-compose.prod.yml logs yt-transcript-nginx`
- Verify reverse proxy config: `cat nginx.conf`

**Restart everything:**

```bash
docker-compose -f docker-compose.prod.yml down && docker-compose -f docker-compose.prod.yml up -d
```

## API

All endpoints (except health) are POST with a JSON body: `{"url": "<youtube-url>"}`.

### GET `/api/health`

Health check.

**Response:** `{"status": "ok"}`

### POST `/api/fetch-transcript`

Fetch a YouTube video's transcript.

**Response:** Plain text file, streamed (`.txt`)

**Example:**

```bash
curl -X POST http://localhost:8000/api/fetch-transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' -o transcript.txt
```

### POST `/api/download-video`

Download a YouTube video.

**Response:** MP4 file, streamed

### POST `/api/download-audio`

Download a YouTube video's audio track.

**Response:** MP3 file, streamed (re-encoded via ffmpeg)

## Known Gotcha: YouTube SABR Streaming

YouTube periodically rolls out changes that break yt-dlp's default extraction —
most recently "SABR streaming," where the default web client silently returns
formats with no playable URL, producing a 0-byte/0-second output instead of an
error. `backend/app.py` works around this with explicit `extractor_args`
(`player_client: ['android', 'web']`, see `YOUTUBE_EXTRACTOR_ARGS`). If
downloads start silently producing empty files again, this is the first place
to check — it usually means yt-dlp needs a version bump or the client list
needs adjusting, not that the app logic itself is broken. Verify with `file`
and `ffprobe` on the actual output, not just the HTTP status code — a "200 OK"
response can still contain a garbage file.

## Frontend Notes

- **Download history is localStorage-only** (`downloadHistory` key) — nothing
  is stored server-side, matching the ephemeral-streaming architecture above.
  Each entry holds metadata + the original source URL, not the file itself.
- **Redownload button** re-runs the original fetch against that stored URL
  rather than re-serving cached bytes, since there are no cached bytes to
  serve — there's nothing else it could mean given the no-persistence design.
- **Terms of Service** is an in-page modal (`#tos-overlay`), not a separate
  page — a standalone `/transcripts/terms` route existed at one point and
  was removed; don't recreate it as a real route.

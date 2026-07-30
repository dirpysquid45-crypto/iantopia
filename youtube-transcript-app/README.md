# YouTube Transcript Downloader

A web app to fetch YouTube transcripts, video, and audio files. Built with Astro (frontend) + FastAPI (backend) + Docker.

## Architecture

**Streaming-based, no local persistence.** All downloads are ephemeral:

- User requests a transcript/video/audio via the web UI
- Backend streams the file directly to the browser
- No files are stored on the server after the response

```
Astro Frontend (Cloudflare Tunnel)
       ↓
FastAPI Backend (Docker)
       ↓
    YouTube
```

## Deployment

### Prerequisites

- Docker & Docker Compose
- Cloudflare Tunnel configured (see `deploy/` directory)

### Start Services

```bash
docker-compose -f docker-compose.prod.yml up -d
```

This runs:

- **Frontend:** Astro on port 3000 (behind nginx reverse proxy)
- **Backend:** FastAPI on port 8000
- **Nginx:** Reverse proxy on port 80

### Access the App

Via **Cloudflare Tunnel** (public URL, see `deploy/` docs) or locally at `http://localhost` (if Tunnel is not running).

### Validate Deployment

```bash
./deploy-with-validation.sh
```

Checks health endpoint, backend API, frontend, and nginx proxy.

### Deploy to Qasim (Home Server)

See `deploy/` folder for Cloudflare Tunnel setup and deployment scripts.

## Development

### Local Dev Mode

```bash
cd frontend && npm install && npm run dev    # Astro on :3000
cd backend && python -m venv venv && . venv/bin/activate && pip install -r requirements.txt && python main.py  # FastAPI on :8000
```

Frontend dev server auto-proxies to `http://localhost:8000` for API requests.

## File Structure

```
youtube-transcript-app/
├── frontend/              # Astro web UI
├── backend/               # FastAPI app
├── deploy/                # Deployment scripts & configs
├── docker-compose.prod.yml # Production orchestration
├── nginx.conf             # Reverse proxy config
└── deploy-with-validation.sh # Health check script
```

## Troubleshooting

**Containers won't start?**

```bash
docker-compose -f docker-compose.prod.yml logs
```

**Backend API not responding?**

```bash
curl http://localhost:8000/health
```

**Frontend blank or broken?**

- Check nginx logs: `docker-compose -f docker-compose.prod.yml logs yt-transcript-nginx`
- Verify reverse proxy config: `cat nginx.conf`

**Health validation failing?**

```bash
docker ps -a  # Check if containers are running
docker-compose -f docker-compose.prod.yml down && docker-compose -f docker-compose.prod.yml up -d  # Restart
```

## API

### GET `/transcripts`

Fetch a YouTube transcript.

**Query params:**
- `url` (required): YouTube video URL

**Response:** Plain text transcript (streamed)

**Example:**
```bash
curl "http://localhost:8000/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### GET `/video`

Download a YouTube video (MP4).

**Query params:**
- `url` (required): YouTube video URL

**Response:** MP4 file (streamed)

### GET `/audio`

Download a YouTube video as audio (MP3).

**Query params:**
- `url` (required): YouTube video URL

**Response:** MP3 file (streamed)

### GET `/health`

Health check endpoint.

**Response:** `{"status": "ok"}`

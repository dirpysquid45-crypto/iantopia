# YouTube Transcript Downloader

A local web app to fetch YouTube transcripts and save them as text files. Built with Astro + FastAPI + Docker.

## Features

- 🎬 Paste YouTube link → get transcript in seconds
- 💾 Auto-saves with video title as filename
- 🔄 Smart duplicate detection with "don't ask again" option
- 🐳 Docker containerized for persistence
- 🌐 Localhost web interface (no terminal needed)
- 🚀 Auto-starts on Mac boot (optional)

## Quick Start

### Prerequisites
- Docker & Docker Desktop installed
- Mac (launchd support)

### Manual Launch

```bash
cd /Users/solriver/youtube-transcript-app
docker-compose up
```

Then open: **http://localhost:3000**

### Auto-Start on Boot

1. Copy plist to LaunchAgents:
```bash
cp com.youtube-transcript-app.plist ~/Library/LaunchAgents/
```

2. Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.youtube-transcript-app.plist
```

3. Verify it's running:
```bash
launchctl list | grep youtube-transcript
```

4. To unload later:
```bash
launchctl unload ~/Library/LaunchAgents/com.youtube-transcript-app.plist
```

## Usage

1. Go to http://localhost:3000
2. Paste a YouTube URL
3. Click "Fetch"
4. If duplicate exists, choose: Skip or Overwrite
5. Optionally check "Don't ask me again"
6. Transcript saved to `/transcripts/{video-title}.txt`

## Architecture

```
Astro Frontend (port 3000)
        ↓
   FastAPI Backend (port 8000)
        ↓
  Docker Volumes (transcripts/)
```

## File Structure

```
youtube-transcript-app/
├── frontend/          # Astro app
├── backend/           # FastAPI app
├── transcripts/       # Downloaded transcripts
├── docker-compose.yml # Orchestration
└── com.youtube-transcript-app.plist # Auto-start config
```

## Troubleshooting

**App won't start?**
- Make sure Docker Desktop is running
- Check: `docker-compose up --build`

**Transcripts not saving?**
- Check folder permissions: `ls -la transcripts/`
- Docker volume issue: `docker volume ls`

**Want to stop auto-start?**
```bash
launchctl unload ~/Library/LaunchAgents/com.youtube-transcript-app.plist
```

## Logs

Manual run logs appear in terminal. Auto-start logs:
```bash
tail -f /var/log/youtube-transcript-app.log
```

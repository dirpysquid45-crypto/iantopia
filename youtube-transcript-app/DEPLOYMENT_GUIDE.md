# YouTube Transcript App - Deployment Guide

## Overview

This guide covers deploying the YouTube Transcript App to a local Ubuntu server (qasim).

## Table of Contents
1. [Quick Start (Local Only)](#quick-start)
2. [Security Architecture](#security-architecture)
3. [Home Network Access (Recommended)](#home-network-access)
4. [Internet Access (Advanced)](#internet-access)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Clone & Deploy

```bash
# SSH into qasim
ssh user@qasim

# Clone the repository
git clone https://github.com/yourusername/iantopia.git
cd iantopia/youtube-transcript-app

# Run deployment script (will ask for sudo password for Docker)
bash deploy-to-linux.sh
```

### 2. Access Locally

On the qasim server itself:
```bash
# Frontend: http://localhost:3001
# Backend:  http://localhost:8001
curl http://localhost:3001
```

---

## Security Architecture

### Current Setup (docker-compose.linux.yml)

**Network Configuration:**
- Frontend: `127.0.0.1:3001` → Container port 3000
- Backend:  `127.0.0.1:8001` → Container port 8000
- Internal Docker network: `yt-network` (bridge)

**Security Implications:**
- ✅ Only accessible via localhost (server itself)
- ✅ Not exposed to home network or internet
- ✅ Minimal attack surface
- ✅ No firewall configuration needed

**When to use:**
- Local testing and development
- Primary server running only for local users
- Most secure option for home network

---

## Home Network Access

### Option A: SSH Port Forwarding (Recommended)

**Advantages:**
- ✅ Secure (encrypted)
- ✅ No configuration needed
- ✅ No port forwarding
- ✅ Works with existing setup

**From your laptop on home network:**

```bash
# Terminal 1: Create SSH tunnel
ssh -L 3001:localhost:3001 -L 8001:localhost:8001 user@qasim

# Terminal 2: Access the app
# Browser: http://localhost:3001
# API:     http://localhost:8001
```

**Make it persistent (add to ~/.ssh/config):**

```
Host qasim-yt
    HostName qasim
    User your_username
    LocalForward 3001 localhost:3001
    LocalForward 8001 localhost:8001
```

Then use: `ssh qasim-yt`

### Option B: Nginx Reverse Proxy (Advanced)

**Advantages:**
- ✅ Direct access without SSH tunnel
- ✅ SSL/TLS support possible
- ✅ Can restrict to home network only
- ⚠️  Requires more setup

**Setup:**

1. **Install Nginx:**
   ```bash
   sudo apt-get update
   sudo apt-get install -y nginx
   ```

2. **Create config file:**
   ```bash
   sudo nano /etc/nginx/sites-available/yt-transcript
   ```

3. **Paste this configuration:**
   ```nginx
   upstream yt_frontend {
       server localhost:3001;
   }

   upstream yt_backend {
       server localhost:8001;
   }

   server {
       listen 80;
       server_name qasim;
       
       # Restrict to home network only
       allow 192.168.1.0/24;      # Adjust to your home network
       deny all;

       # Frontend
       location / {
           proxy_pass http://yt_frontend;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Backend API
       location /api/ {
           proxy_pass http://yt_backend;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

4. **Enable the site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/yt-transcript /etc/nginx/sites-enabled/
   sudo nginx -t  # Test config
   sudo systemctl restart nginx
   ```

5. **Access from home network:**
   ```
   http://qasim/
   ```

---

## Internet Access

### ⚠️ WARNING: Advanced / Security-Critical

If you want to access the YouTube Transcript App from outside your home network, follow BEST PRACTICES:

### Option A: Cloudflare Tunnel (Recommended for Internet Access)

**Advantages:**
- ✅ No port forwarding
- ✅ Automatic HTTPS
- ✅ DDoS protection
- ✅ No firewall changes needed

**Setup:**

1. **Install Cloudflare Tunnel:**
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   ```

2. **Authenticate:**
   ```bash
   cloudflared tunnel login
   ```

3. **Create tunnel config:**
   ```bash
   mkdir -p ~/.cloudflared
   nano ~/.cloudflared/config.yml
   ```

4. **Paste configuration:**
   ```yaml
   tunnel: yt-transcript
   credentials-file: /home/user/.cloudflared/yt-transcript.json
   
   ingress:
     - hostname: yt-transcript.yourdomain.com
       service: http://localhost:3001
     - hostname: yt-api.yourdomain.com
       service: http://localhost:8001
     - service: http_status:404
   ```

5. **Run tunnel:**
   ```bash
   cloudflared tunnel run yt-transcript
   ```

6. **Access globally:**
   ```
   https://yt-transcript.yourdomain.com
   ```

### Option B: Traditional Port Forwarding (Not Recommended)

**⚠️ Security Risks:**
- Exposes server directly to internet
- Vulnerable to scanning and attacks
- Exposes your home IP
- Consider firewall rules carefully

If you still want to do this:

1. Update docker-compose.linux.yml:
   ```yaml
   ports:
     - "3001:3000"    # Remove 127.0.0.1 binding
     - "8001:8000"
   ```

2. Forward ports in your router:
   - External port 3001 → qasim:3001
   - External port 8001 → qasim:8001

3. Create firewall rules to limit access:
   ```bash
   sudo ufw allow from 0.0.0.0 to any port 3001
   sudo ufw allow from 0.0.0.0 to any port 8001
   ```

4. Consider:
   - Adding authentication (htpasswd in Nginx)
   - Using HTTPS (Let's Encrypt + Nginx)
   - Restricting API to known IPs

---

## Architecture Decision Matrix

| Use Case | Setup | How to Access |
|----------|-------|--------------|
| Local testing | Current default | SSH to server + localhost:3001 |
| Home network | SSH tunnel | `ssh -L` port forward |
| Home network | Nginx | Direct `http://qasim/` |
| Internet access | Cloudflare Tunnel | `https://yt-transcript.yourdomain.com` |
| Internet access | Port forward (risky) | Forward in router + firewall rules |

---

## Data Management

### Backup Transcripts & Downloads

```bash
# SSH into qasim
ssh user@qasim

# Backup data
tar czf yt-transcript-backup.tar.gz \
    ~/iantopia/youtube-transcript-app/transcripts \
    ~/iantopia/youtube-transcript-app/downloads \
    ~/iantopia/youtube-transcript-app/audio

# Transfer to local machine
scp user@qasim:yt-transcript-backup.tar.gz ./
```

### Volume Persistence

The docker-compose.linux.yml uses named volumes that persist on the server:
- Transcripts: `/var/lib/docker/volumes/youtube-transcript-app_transcripts/_data/`
- Downloads:  `/var/lib/docker/volumes/youtube-transcript-app_downloads/_data/`
- Audio:      `/var/lib/docker/volumes/youtube-transcript-app_audio/_data/`

---

## Troubleshooting

### Containers won't start

```bash
# Check logs
docker-compose -f docker-compose.linux.yml logs

# Check if ports are in use
sudo lsof -i :3001
sudo lsof -i :8001

# Kill process if needed
sudo kill -9 <PID>
```

### Can't access from home network

1. **SSH tunnel working?**
   ```bash
   ssh -L 3001:localhost:3001 user@qasim
   # In another terminal:
   curl http://localhost:3001
   ```

2. **Nginx issues?**
   ```bash
   sudo systemctl status nginx
   sudo nginx -t
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Firewall blocking?**
   ```bash
   sudo ufw status
   # If needed:
   sudo ufw allow 3001
   sudo ufw allow 8001
   ```

### Frontend shows blank page

- Check browser console for errors
- Verify backend is reachable: `curl http://localhost:8001/api/transcripts`
- Check API_BASE URL in frontend code
- Inspect docker network: `docker network inspect youtube-transcript-app_yt-network`

---

## Production Considerations

For a production deployment:

1. **Use a proper database** (PostgreSQL) instead of file storage
2. **Set up monitoring** (Prometheus, Grafana)
3. **Enable HTTPS** with proper certificates
4. **Add authentication** for sensitive operations
5. **Regular backups** of all data
6. **Resource limits** in docker-compose
7. **Health checks** for containers
8. **Separate environment config** per deployment

---

## Summary

- **Current setup**: Localhost-only (most secure)
- **Recommended for home network**: SSH port forwarding
- **Recommended for internet**: Cloudflare Tunnel
- **Data persists** in Docker named volumes
- **All transcripts/downloads** stored on server

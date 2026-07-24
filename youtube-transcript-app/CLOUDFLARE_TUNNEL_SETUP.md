# Cloudflare Tunnel Setup for YouTube Transcript App

## Overview

This guide walks through setting up your qasim server to be publicly accessible via **iantopia.com/transcripts** using Cloudflare Tunnel.

**Advantages:**
- ✅ No port forwarding needed
- ✅ Automatic HTTPS/encryption
- ✅ DDoS protection
- ✅ No firewall configuration needed
- ✅ Server IP stays private
- ✅ Cloudflare handles SSL certificates

---

## Prerequisites

- ✅ Cloudflare account (you have Super Admin access to iantopia.com)
- ✅ qasim server with Docker running
- ✅ Nginx running (part of docker-compose.prod.yml)

---

## Step 1: Install Cloudflare Tunnel on qasim

SSH into qasim and run:

```bash
# Download and install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Verify installation
cloudflared --version
```

---

## Step 2: Authenticate cloudflared with Cloudflare

```bash
# This opens a browser window to authenticate
cloudflared tunnel login

# Follow the prompts:
# 1. Browser opens to Cloudflare login
# 2. Select iantopia.com domain
# 3. Click "Authorize" 
# 4. You'll get a cert.pem file in ~/.cloudflared/

# Verify it worked:
ls ~/.cloudflared/cert.pem
```

---

## Step 3: Create Tunnel Configuration

Create tunnel config file on qasim:

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

**Paste this configuration:**

```yaml
tunnel: yt-transcript
credentials-file: /home/USER/.cloudflared/yt-transcript.json

ingress:
  # Frontend (https://transcripts.iantopia.com)
  - hostname: transcripts.iantopia.com
    service: http://localhost
    originRequest:
      httpHostHeader: transcripts.iantopia.com
  
  # Fallback - catch all remaining traffic and close
  - service: http_status:404
```

**Replace `USER` with your actual username** (check with `whoami`)

---

## Step 4: Create the Tunnel

```bash
# Create tunnel named "yt-transcript"
cloudflared tunnel create yt-transcript

# This generates yt-transcript.json credentials file
# Output should show: Tunnel credentials written to ~/.cloudflared/yt-transcript.json
```

---

## Step 5: Add DNS Records to Cloudflare

In Cloudflare Dashboard:

1. Go to **DNS** → **Records**
2. Click **+ Add Record**
3. Add this record:
   - Type: `CNAME`
   - Name: `transcripts`
   - Content: `yt-transcript.cfargotunnel.com`
   - TTL: Auto
   - Proxy status: ✅ Proxied (orange cloud)
4. Click Save

**Result:** `transcripts.iantopia.com` now points to your tunnel

---

## Step 6: Run Tunnel in Background

### Option A: Using systemd (Recommended for Production)

Create systemd service:

```bash
sudo nano /etc/systemd/system/cloudflared.service
```

**Paste:**

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=notify
User=YOUR_USERNAME
ExecStart=/usr/local/bin/cloudflared tunnel --config /home/YOUR_USERNAME/.cloudflared/config.yml run yt-transcript
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

**Replace `YOUR_USERNAME` with your actual username**

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Verify it's running
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

### Option B: Manual (for testing)

```bash
# Run in foreground to test
cloudflared tunnel --config ~/.cloudflared/config.yml run yt-transcript

# Run in background with nohup
nohup cloudflared tunnel --config ~/.cloudflared/config.yml run yt-transcript > ~/.cloudflared/tunnel.log 2>&1 &
```

---

## Step 7: Deploy Docker Containers

SSH into qasim:

```bash
cd ~/yt-transcript-app

# Use production compose file
docker-compose -f docker-compose.prod.yml down || true
docker-compose -f docker-compose.prod.yml up -d --build

# Verify containers are running
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## Step 8: Verify Everything Works

```bash
# On qasim, test locally first
curl http://localhost
curl http://localhost/api/transcripts

# From your Mac, test the public URL
curl https://transcripts.iantopia.com

# Open in browser
open https://transcripts.iantopia.com
```

---

## Troubleshooting

### Tunnel won't start

```bash
# Check cloudflared logs
sudo journalctl -u cloudflared -n 50

# Verify credentials file exists
cat ~/.cloudflared/yt-transcript.json

# Test tunnel manually
cloudflared tunnel --config ~/.cloudflared/config.yml run yt-transcript
```

### DNS not resolving

```bash
# On Mac, test DNS resolution
dig transcripts.iantopia.com

# Should show Cloudflare's IP addresses
# If not, check Cloudflare DNS records
```

### Getting 502 Bad Gateway

1. **Check if Nginx is running:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   docker-compose -f docker-compose.prod.yml logs nginx
   ```

2. **Check if backend is healthy:**
   ```bash
   curl http://localhost:8000/api/transcripts
   ```

3. **Check Nginx configuration:**
   ```bash
   docker exec yt-transcript-nginx nginx -t
   ```

### Frontend shows blank page

1. **Check frontend logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs frontend
   ```

2. **Verify API endpoint in browser console**
3. **Check if backend is accessible from frontend container:**
   ```bash
   docker exec yt-transcript-frontend curl http://backend:8000/api/transcripts
   ```

---

## Monitoring

### View Tunnel Status in Cloudflare Dashboard

1. Go to **Networking** → **Tunnels**
2. Click on **yt-transcript**
3. See:
   - ✅ Connected status
   - 🔄 Ingress routes
   - 📊 Traffic analytics
   - 📈 Health metrics

### Monitor from Command Line

```bash
# View real-time tunnel status
cloudflared tunnel info yt-transcript

# View tunnel routes
cloudflared tunnel route ls yt-transcript
```

---

## Updating DNS Routes

If you need to change where traffic goes, edit config and restart:

```bash
nano ~/.cloudflared/config.yml
# Make changes...
sudo systemctl restart cloudflared
```

---

## Advanced: Multiple Subdomains

Want to add more subdomains? Update config.yml:

```yaml
tunnel: yt-transcript
credentials-file: /home/USER/.cloudflared/yt-transcript.json

ingress:
  # Main app
  - hostname: transcripts.iantopia.com
    service: http://localhost

  # If you had an API on different port
  - hostname: api.iantopia.com
    service: http://localhost:8001

  # Catch-all
  - service: http_status:404
```

Then add DNS records in Cloudflare for each subdomain.

---

## Summary

```
Your Mac (browser)
  ↓ HTTPS
Cloudflare (transcripts.iantopia.com)
  ↓ Encrypted Tunnel
qasim Server (cloudflared daemon)
  ↓
Nginx (reverse proxy, port 80)
  ↓
Docker Containers
  ├─ Frontend (port 3000)
  └─ Backend (port 8000)
```

Everything is encrypted end-to-end, your server IP is hidden, and Cloudflare handles DDoS protection.

---

## Costs

- **Cloudflare Tunnel:** FREE
- **Domain (iantopia.com):** You already own it
- **Server:** Your existing qasim hardware
- **Bandwidth:** FREE with Cloudflare

Total cost: **$0** (using what you already have)

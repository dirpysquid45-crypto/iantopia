# Production Setup: YouTube Transcripts on Internet

## Goal
Host YouTube Transcript App publicly at **https://transcripts.iantopia.com** using your local qasim server.

---

## Architecture

```
User's Browser (worldwide)
        ↓
  https://transcripts.iantopia.com
        ↓
Cloudflare (DDoS protection, caching, SSL)
        ↓
Cloudflare Tunnel (encrypted tunnel)
        ↓
qasim Server (your home machine)
  ├─ cloudflared (tunnel daemon)
  └─ Docker
      ├─ Nginx (reverse proxy, port 80)
      │   ├─ Frontend (port 3000)
      │   └─ Backend (port 8000)
```

**Key Points:**
- No port forwarding needed
- Your server IP stays private
- Cloudflare handles HTTPS/SSL
- Automatic DDoS protection
- Works behind any firewall
- Cost: **FREE** (using what you have)

---

## Step-by-Step Deployment

### Phase 1: Initial Setup (Your Mac)

#### 1.1 Copy files to qasim
```bash
# From your Mac terminal
rsync -avz --delete \
  /Users/solriver/iantopia/youtube-transcript-app/ \
  user@qasim:~/yt-transcript-app/
```

#### 1.2 SSH into qasim
```bash
ssh user@qasim
cd ~/yt-transcript-app
```

### Phase 2: Docker Setup (On qasim)

#### 2.1 Run production deployment script
```bash
bash deploy-prod.sh

# This will:
# - Install Docker & Docker Compose
# - Set up directories
# - Build containers (frontend, backend, nginx)
# - Start all services
```

#### 2.2 Verify containers are running
```bash
docker-compose -f docker-compose.prod.yml ps

# Should show 3 running containers:
# - yt-transcript-backend
# - yt-transcript-frontend  
# - yt-transcript-nginx
```

#### 2.3 Test locally on qasim
```bash
# Test backend API
curl http://localhost:8000/api/transcripts

# Test frontend via Nginx
curl http://localhost

# Should see HTML response
```

### Phase 3: Cloudflare Tunnel Setup (On qasim)

#### 3.1 Authenticate with Cloudflare
```bash
cloudflared tunnel login

# This opens a browser window
# 1. Log in with your Cloudflare account
# 2. Select iantopia.com domain
# 3. Click "Authorize"
# 4. You'll see: "Authorization successful"
# 5. Credentials saved to ~/.cloudflared/cert.pem
```

#### 3.2 Create tunnel configuration
```bash
# Create config file
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

**Paste this:**
```yaml
tunnel: yt-transcript
credentials-file: /home/YOUR_USERNAME/.cloudflared/yt-transcript.json

ingress:
  - hostname: transcripts.iantopia.com
    service: http://localhost
    originRequest:
      httpHostHeader: transcripts.iantopia.com
  
  - service: http_status:404
```

**IMPORTANT:** Replace `YOUR_USERNAME` with output of `whoami` command

#### 3.3 Create the tunnel
```bash
cloudflared tunnel create yt-transcript

# Output: Successfully created tunnel yt-transcript
# This creates: ~/.cloudflared/yt-transcript.json
```

#### 3.4 Set up systemd service (so tunnel auto-starts)
```bash
# Create service file
sudo nano /etc/systemd/system/cloudflared.service
```

**Paste this (replace YOUR_USERNAME):**
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

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Verify it's running
sudo systemctl status cloudflared

# View logs if needed
sudo journalctl -u cloudflared -f
```

### Phase 4: DNS Configuration (Cloudflare Dashboard)

#### 4.1 Open Cloudflare Dashboard
1. Go to https://dash.cloudflare.com
2. Select iantopia.com

#### 4.2 Add DNS record
1. Click **DNS** → **Records**
2. Click **+ Add Record**
3. Configure:
   - Type: `CNAME`
   - Name: `transcripts`
   - Content: `yt-transcript.cfargotunnel.com`
   - TTL: `Auto`
   - Proxy status: **Proxied** (orange cloud - important!)
4. Click **Save**

**Result:** `transcripts.iantopia.com` now points to your tunnel

### Phase 5: Testing

#### 5.1 Test tunnel status
```bash
# On qasim
cloudflared tunnel info yt-transcript

# Should show: "CNAME dns record"
```

#### 5.2 Test from anywhere
```bash
# From your Mac (or any device with internet)
curl https://transcripts.iantopia.com

# Should see HTML (frontend)
curl https://transcripts.iantopia.com/api/transcripts

# Should see JSON (backend)
```

#### 5.3 Open in browser
```bash
# Your Mac
open https://transcripts.iantopia.com

# Should load the YouTube Transcripts app!
```

---

## Verification Checklist

- [ ] Docker containers running: `docker-compose -f docker-compose.prod.yml ps`
- [ ] Backend responds: `curl http://localhost:8000/api/transcripts`
- [ ] Frontend responds: `curl http://localhost`
- [ ] Tunnel created: `cloudflared tunnel list`
- [ ] Tunnel running: `sudo systemctl status cloudflared`
- [ ] DNS record added: Check Cloudflare dashboard
- [ ] Public URL works: `curl https://transcripts.iantopia.com`
- [ ] Browser loads: Open https://transcripts.iantopia.com

---

## Troubleshooting

### "Connection refused" on localhost

```bash
# Containers not running?
docker-compose -f docker-compose.prod.yml up -d

# View errors
docker-compose -f docker-compose.prod.yml logs
```

### "Tunnel not connected" at Cloudflare

```bash
# Check if cloudflared is running
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -n 50

# Restart
sudo systemctl restart cloudflared
```

### "Can't reach transcripts.iantopia.com"

1. **Check DNS is set up:** Go to Cloudflare → DNS → Records
2. **Verify record:**
   - Name: `transcripts`
   - Content: `yt-transcript.cfargotunnel.com`
   - Proxied: `ON` (orange cloud)
3. **Wait 30-60 seconds** for DNS propagation
4. **Test from qasim first:** `curl https://transcripts.iantopia.com`

### Nginx showing 502 Bad Gateway

```bash
# Check if backend is running
docker-compose -f docker-compose.prod.yml ps

# Check Nginx logs
docker-compose -f docker-compose.prod.yml logs nginx

# Test Nginx config
docker exec yt-transcript-nginx nginx -t
```

---

## Monitoring & Maintenance

### Check Cloudflare Tunnel Status
1. Go to https://dash.cloudflare.com
2. Select iantopia.com
3. Go to **Networking** → **Tunnels**
4. Click **yt-transcript**
5. See:
   - Connected status
   - Request counts
   - Bandwidth usage
   - Any errors

### View Real-time Logs
```bash
# Docker containers
docker-compose -f docker-compose.prod.yml logs -f

# Cloudflare Tunnel
sudo journalctl -u cloudflared -f
```

### Restart Everything
```bash
# Restart containers
docker-compose -f docker-compose.prod.yml restart

# Restart tunnel
sudo systemctl restart cloudflared
```

### Stop Services
```bash
# Stop containers
docker-compose -f docker-compose.prod.yml down

# Stop tunnel
sudo systemctl stop cloudflared
```

---

## Advanced: Multiple Subdomains

Want to add another subdomain (like `api.iantopia.com`)?

1. **Update config.yml:**
```bash
sudo nano ~/.cloudflared/config.yml
```

2. **Add to ingress:**
```yaml
ingress:
  - hostname: transcripts.iantopia.com
    service: http://localhost

  - hostname: api.iantopia.com
    service: http://localhost:8001  # Different port if needed

  - service: http_status:404
```

3. **Restart tunnel:**
```bash
sudo systemctl restart cloudflared
```

4. **Add DNS record in Cloudflare** for `api.iantopia.com`

---

## Cost Analysis

| Component | Cost |
|-----------|------|
| qasim server (your hardware) | $0 (already owned) |
| iantopia.com domain | $0 (already own) |
| Cloudflare Tunnel | Free |
| Cloudflare DDoS Protection | Free |
| Bandwidth | Free (Cloudflare) |
| SSL/HTTPS Certificates | Free (Cloudflare) |
| **Total Monthly Cost** | **$0** |

---

## Security Considerations

✅ **What's Secure:**
- HTTPS encryption (Cloudflare managed)
- Server IP hidden
- Cloudflare WAF/DDoS protection
- No port forwarding needed
- Tunnel is encrypted

⚠️ **What to Monitor:**
- Keep qasim server updated (`sudo apt update && sudo apt upgrade`)
- Monitor Cloudflare dashboard for attacks
- Review access logs periodically
- Keep Docker images updated

---

## Production Checklist

- [ ] Docker containers auto-restart on reboot
- [ ] Cloudflare Tunnel runs as systemd service
- [ ] Backups of transcripts/downloads/audio data
- [ ] Monitoring set up (optional)
- [ ] DNS configured with HTTPS
- [ ] Tested from multiple locations
- [ ] Documented setup in case qasim needs reset

---

## Next Steps

1. **Run deployment script:** `bash deploy-prod.sh`
2. **Set up Cloudflare Tunnel:** Follow Phase 3 above
3. **Add DNS record:** Follow Phase 4 above
4. **Test public access:** Follow Phase 5 above
5. **Enable auto-startup:** Configure systemd services

**Result:** App publicly accessible at https://transcripts.iantopia.com 🎉

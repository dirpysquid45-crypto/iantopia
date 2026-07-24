# Quick Deploy to qasim

## 1. Copy repository to qasim

```bash
# From your Mac, copy the repo to the server
scp -r /Users/solriver/iantopia/youtube-transcript-app user@qasim:~/yt-transcript-app

# Or if you prefer using rsync (faster for large files):
rsync -avz --delete /Users/solriver/iantopia/youtube-transcript-app/ user@qasim:~/yt-transcript-app/
```

## 2. Deploy on qasim

```bash
# SSH into qasim (password: period)
ssh user@qasim

# Navigate to app directory
cd ~/yt-transcript-app

# Run deployment script
bash deploy-to-linux.sh

# Follow prompts - may need to enter password for Docker installation
```

## 3. Verify it's running

```bash
# Still on qasim server
docker-compose -f docker-compose.linux.yml ps

# Test locally on server
curl http://localhost:3001
curl http://localhost:8001/api/transcripts
```

## 4. Access from your Mac (choose one)

### Option A: SSH Tunnel (Recommended)
```bash
# In a terminal on your Mac, run:
ssh -L 3001:localhost:3001 -L 8001:localhost:8001 user@qasim

# In another terminal on your Mac, open browser:
open http://localhost:3001
```

### Option B: Add to ~/.ssh/config
```bash
cat >> ~/.ssh/config << 'EOF'
Host qasim-yt
    HostName qasim
    User your_username
    LocalForward 3001 localhost:3001
    LocalForward 8001 localhost:8001
EOF

# Then just use:
ssh qasim-yt

# And in another terminal:
open http://localhost:3001
```

## 5. Stop/Restart containers

```bash
# SSH into qasim first
ssh user@qasim
cd ~/yt-transcript-app

# View logs
docker-compose -f docker-compose.linux.yml logs -f

# Restart containers
docker-compose -f docker-compose.linux.yml restart

# Stop everything
docker-compose -f docker-compose.linux.yml down
```

## 6. Update code on server

```bash
# From your Mac
rsync -avz --delete /Users/solriver/iantopia/youtube-transcript-app/ user@qasim:~/yt-transcript-app/

# Then on qasim
ssh user@qasim
cd ~/yt-transcript-app
docker-compose -f docker-compose.linux.yml restart
```

---

## Troubleshooting

### Can't SSH into qasim?
```bash
# Check if host is reachable
ping qasim
# or use IP
ssh user@192.168.1.X
```

### Docker not installing?
```bash
# Try updating first
sudo apt-get update
sudo apt-get upgrade -y

# Then run deploy script again
bash deploy-to-linux.sh
```

### Port forwarding not working?
```bash
# On Mac, verify tunnel is running
ssh -L 3001:localhost:3001 user@qasim

# In another Mac terminal:
curl http://localhost:3001

# If that doesn't work, check on server:
ssh user@qasim
curl http://localhost:3001
```

### Containers not starting?
```bash
# On qasim
docker-compose -f docker-compose.linux.yml logs

# Check if ports are in use
sudo lsof -i :3001
sudo lsof -i :8001
```

---

## Full Deployment Diagram

```
Your Mac
  ├─ Run: rsync to copy repo
  └─ SSH into qasim
      │
      └─> qasim Server
          ├─ Run: bash deploy-to-linux.sh
          │   ├─ Install Docker
          │   ├─ Pull images
          │   └─ Start containers
          │
          └─ Access:
              ├─ Local: http://localhost:3001
              ├─ Via SSH tunnel from Mac: ssh -L 3001:localhost:3001
              └─ Browser on Mac: http://localhost:3001
```

See `DEPLOYMENT_GUIDE.md` for detailed info on security, networking, and advanced options.

#!/usr/bin/env bash
# Sets up the iantopia VM from scratch. Safe to re-run: every step checks
# whether it's already done, then pulls the latest code, rebuilds, and restarts.
#
# Before running, put these in /srv/iantopia/secrets (see README.md):
#   service-account-key.json   the Firebase service account key
#   arena.env                  ADMIN_EMAILS=... and ADMIN_UIDS=...
#   tunnel-token               the iantopia-vm Cloudflare Tunnel token (one line)
#
# The digest model is set in news-pipeline/digest.py and pulled below.
set -euo pipefail

BRANCH="${BRANCH:-main}"
REPO_URL="https://github.com/dirpysquid45-crypto/iantopia.git"
APP=/srv/iantopia
REPO="$APP/repo"
SECRETS="$APP/secrets"
SWAP_SIZE="${SWAP_SIZE:-4G}"
DIGEST_MODEL="llama3.2:3b"

if [ ! -f "$SECRETS/service-account-key.json" ] || [ ! -f "$SECRETS/arena.env" ]; then
  echo "Missing secrets in $SECRETS (see deploy/vm/README.md). Stopping." >&2
  exit 1
fi

# --- Base packages and Docker ------------------------------------------------
sudo apt-get update
sudo apt-get install -y git nginx python3-venv curl
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

# --- Swap, so builds and the digest model don't run out of memory -----------
if ! grep -q "^/swapfile " /proc/swaps; then
  if [ ! -f /swapfile ]; then
    sudo fallocate -l "$SWAP_SIZE" /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# --- Cloudflare Tunnel connector ----------------------------------------------
if ! command -v cloudflared >/dev/null; then
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
fi
if ! systemctl is-enabled --quiet cloudflared 2>/dev/null; then
  sudo cloudflared service install "$(cat "$SECRETS/tunnel-token")"
fi

# --- Local AI for the news digest ---------------------------------------------
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sudo sh
fi
if ! ollama list 2>/dev/null | grep -q "^${DIGEST_MODEL%%:*}"; then
  ollama pull "$DIGEST_MODEL"
fi

sudo mkdir -p "$APP" "$SECRETS"
sudo chown -R "$USER":"$USER" "$APP"
chmod 700 "$SECRETS"
chmod 600 "$SECRETS"/* 2>/dev/null || true

# --- Code ----------------------------------------------------------------------
if [ -d "$REPO/.git" ]; then
  git -C "$REPO" fetch origin
  git -C "$REPO" checkout -- . 2>/dev/null || true
  git -C "$REPO" checkout "$BRANCH"
  git -C "$REPO" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO"
fi

# --- Site build ------------------------------------------------------------------
# Runs in a Node 20 container so the VM doesn't need Node. The build runs as
# root in the container, so dist/ is handed back to this user afterward, which
# lets the news pipeline copy its JSON into dist/.
docker run --rm -v "$REPO":/app -w /app node:20 sh -c "npm ci && npm run build && chown -R $(id -u):$(id -g) dist"

# --- Web server ------------------------------------------------------------------
sudo cp "$REPO/deploy/vm/nginx.conf" /etc/nginx/sites-available/iantopia
sudo ln -sf /etc/nginx/sites-available/iantopia /etc/nginx/sites-enabled/iantopia
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

# --- Arena server ----------------------------------------------------------------
docker compose -f "$REPO/deploy/vm/docker-compose.arena.yml" up -d --build

# --- Transcript app --------------------------------------------------------------
# Backend and frontend only. Its own compose also starts an nginx on port 80,
# which would clash with the host nginx, so it's skipped.
(cd "$REPO/youtube-transcript-app" && docker compose -f docker-compose.prod.yml up -d --build backend frontend)

# --- News job --------------------------------------------------------------------
python3 -m venv "$REPO/news-pipeline/.venv"
"$REPO/news-pipeline/.venv/bin/pip" install -q -r "$REPO/news-pipeline/requirements.txt"
sudo cp "$REPO/deploy/vm/iantopia-news.service" "$REPO/deploy/vm/iantopia-news.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now iantopia-news.timer

echo "Done. Check: curl -I http://localhost/ , docker ps , sudo systemctl is-active cloudflared"

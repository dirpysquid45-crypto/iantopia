#!/usr/bin/env bash
# Sets up the iantopia VM. Safe to re-run: it pulls the latest code, rebuilds,
# and restarts the services.
#
# Before running, put the secrets in /srv/iantopia/secrets (see README.md):
#   service-account-key.json   the Firebase service account key
#   arena.env                  ADMIN_EMAILS=... and ADMIN_UIDS=...
set -euo pipefail

BRANCH="${BRANCH:-main}"
REPO_URL="https://github.com/dirpysquid45-crypto/iantopia.git"
APP=/srv/iantopia
REPO="$APP/repo"
SECRETS="$APP/secrets"

if [ ! -f "$SECRETS/service-account-key.json" ] || [ ! -f "$SECRETS/arena.env" ]; then
  echo "Missing secrets in $SECRETS (see deploy/vm/README.md). Stopping." >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y git nginx python3-venv
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

sudo mkdir -p "$APP" "$SECRETS"
sudo chown -R "$USER":"$USER" "$APP"
chmod 700 "$SECRETS"

# Code
if [ -d "$REPO/.git" ]; then
  git -C "$REPO" fetch origin
  git -C "$REPO" checkout "$BRANCH"
  git -C "$REPO" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO"
fi

# Site build, in a Node 20 container so the VM doesn't need Node installed
# The build runs as root in the container, so hand dist/ back to this user.
# Without that, the news pipeline can't copy its JSON into dist/.
docker run --rm -v "$REPO":/app -w /app node:20 sh -c "npm ci && npm run build && chown -R $(id -u):$(id -g) dist"

# Web server
sudo cp "$REPO/deploy/vm/nginx.conf" /etc/nginx/sites-available/iantopia
sudo ln -sf /etc/nginx/sites-available/iantopia /etc/nginx/sites-enabled/iantopia
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

# Arena server
docker compose -f "$REPO/deploy/vm/docker-compose.arena.yml" up -d --build

# Transcript app: backend and frontend only. Its own compose also starts an
# nginx on port 80, which would clash with the host nginx, so it's skipped.
(cd "$REPO/youtube-transcript-app" && docker compose -f docker-compose.prod.yml up -d --build backend frontend)

# News job (the optional Ollama digest is skipped on this machine)
python3 -m venv "$REPO/news-pipeline/.venv"
"$REPO/news-pipeline/.venv/bin/pip" install -q -r "$REPO/news-pipeline/requirements.txt"
sudo cp "$REPO/deploy/vm/iantopia-news.service" "$REPO/deploy/vm/iantopia-news.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now iantopia-news.timer

echo "Done. Check: curl -I http://localhost/ and docker ps"

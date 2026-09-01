#!/usr/bin/env bash
# Runs every pipeline stage in sequence. Each stage is independent -- one
# stage failing (a feed being briefly down, Ollama not yet warmed up)
# shouldn't block the others, so a failure is logged but doesn't abort
# the rest of the run.
set -uo pipefail
cd "$(dirname "$0")"
source .venv/bin/activate

run_stage() {
  echo "=== $1 ==="
  python3 "$1" || echo "[run_pipeline] $1 failed (exit $?) -- continuing"
}

run_stage ingest.py
run_stage cluster.py
run_stage digest.py
run_stage stock_analysis.py

# Every stage above writes to public/news-data/ -- but nginx serves the
# already-built dist/ folder (a read-only bind mount), which Astro only
# ever copies public/ into AT BUILD TIME. Without this, the pipeline's
# output goes stale the moment it lands: fresh on disk in public/, but
# invisible to anyone hitting the live site until the next manual
# `npm run build`. A straight file copy is enough here -- no rebuild,
# no restart, nginx just serves whatever bytes are on disk.
echo "=== sync to dist/ ==="
mkdir -p ../dist/news-data
cp ../public/news-data/*.json ../dist/news-data/ 2>&1 || echo "[run_pipeline] sync to dist/ failed -- live site will keep serving stale data until the next npm run build"

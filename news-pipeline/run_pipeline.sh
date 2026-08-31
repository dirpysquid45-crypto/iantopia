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

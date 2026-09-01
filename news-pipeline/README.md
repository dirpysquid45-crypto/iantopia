# news-pipeline

Backend data pipeline for `/news` (The Iantopia Times). Runs on Qasim,
outside the Astro build. Every stage writes straight to
`../public/news-data/*.json` -- the same folder Astro copies verbatim into
`dist/` on every build, so a cron job updating these files serves fresh
data immediately, with no rebuild and no extra service.

## Stages

- **ingest.py** — RSS pull (`feedparser`) of BBC News World, NPR, Wall
  Street Journal, Bloomberg, and New York Times' own public feeds —
  headline + dek exactly as rendered to any anonymous visitor, nothing
  scraped past a paywall, no user-agent spoofing — plus Pew Research
  Center for context. AP and Reuters aren't included: both discontinued
  their public RSS feeds years ago (confirmed dead, not assumed).
  Writes `headlines.json`.
- **cluster.py** — groups same-story headlines across the five news
  outlets by keyword overlap (plain set similarity, no LLM). Pew is
  research/analysis, not daily wire news, so it's excluded from
  clustering and read directly from `headlines.json` instead. Writes
  `clusters.json`.
- **digest.py** — synthesizes the day's clusters + Pew context into one
  written digest via a local Ollama model (`qwen2.5:7b`), talking to
  `127.0.0.1:11434` only. Degrades to a clear "unavailable" note (not a
  crash) if Ollama isn't running or the model isn't pulled yet. Writes
  `digest.json`.
- **stock_analysis.py** — `yfinance` pull of a geopolitically-relevant
  watchlist, sorted by magnitude of change. No AI, just numbers. Runs
  independently of the other three (see `deploy/` for scheduling). Writes
  `stocks.json`.

Cross-outlet bias-rating tags (left/center/right) are intentionally not
in `clusters.json` yet — that needs a real sourced dataset (AllSides/Ad
Fontes), not a guess, and hasn't been wired in. The frontend shows outlet
name + real headline + link only, for now.

## Running locally

```bash
cd news-pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 ingest.py && python3 cluster.py && python3 digest.py && python3 stock_analysis.py
```

`digest.py` will report Ollama as unavailable on a machine without it
running — that's expected off Qasim; the other three stages work anywhere
with network access.

## On Qasim

Each stage is a plain script invoked by a systemd timer, not a
long-running service — see `deploy/` for the unit files. Outbound-only,
no inbound listening port for ingestion/processing. Only a future
read-only API route (not needed yet — see above) would ever get
reverse-proxied through the existing nginx + Cloudflare Tunnel setup.

Ollama runs as the existing native (non-Dockerized) host binary, since it
only processes already-extracted text, not raw untrusted HTML.

### Install

```bash
cd ~/iantopia/news-pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ollama pull qwen2.5:7b

sudo cp deploy/iantopia-news.service deploy/iantopia-news.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now iantopia-news.timer

# First run doesn't wait for the timer:
sudo systemctl start iantopia-news.service
journalctl -u iantopia-news.service -f
```

`run_pipeline.sh` writes straight to `../public/news-data/*.json` in the
git checkout — nothing else to wire up. The next `git pull && npm run
build` (the existing manual deploy flow) picks up whatever the pipeline
last wrote, since Astro copies `public/` into `dist/` verbatim.

# news-pipeline

Backend data pipeline for `/news` (The Iantopia Times). Runs on Qasim,
outside the Astro build — see the architecture discussion for the full
picture. Not yet wired to the frontend; `data/*.json` here is what a small
read-only FastAPI service (not yet built) will eventually serve to the page.

## Stages

- [x] **stock_analysis.py** — `yfinance` pull of a geopolitically-relevant
      watchlist (major indices, commodities, currencies), sorted by
      magnitude of change. No AI involved, just numbers.
- [ ] **ingest** — RSS (`feedparser`) + honest scrape (`trafilatura`) of
      headline/dek content, paywalled sources included (never bypasses
      anything — captures only what's rendered to an anonymous visitor).
- [ ] **cluster** — group same-story headlines across outlets via
      keyword/entity overlap (classical NLP, not an LLM call).
- [ ] **framing analysis** (LLM) — per cluster, describe how each outlet
      frames the same story.
- [ ] **digest** (LLM) — synthesize the day's clusters into one written
      piece.
- [ ] **publish** — merge everything into the JSON the page reads.

## Running a stage locally

```bash
cd news-pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 stock_analysis.py
```

Writes to `data/stocks.json` (gitignored — generated output, not source).

## On Qasim

Each stage is a plain script invoked by cron/systemd timers, not a
long-running service — see the security notes in the architecture
discussion for why (no inbound exposure needed for ingestion/processing;
only a read-only API endpoint gets reverse-proxied through the existing
nginx + Cloudflare Tunnel setup).

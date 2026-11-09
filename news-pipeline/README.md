# news-pipeline

Backend data pipeline for `/news` (The Iantopia Times). Runs on the VM as a
systemd timer, outside the Astro build. Every stage writes straight to
`../public/news-data/*.json`, and `run_pipeline.sh` copies the results into
`../dist/news-data/`, so the next visit serves fresh data with no rebuild.

## Stages

`run_pipeline.sh` runs these in order. A failed stage is logged and the rest
still run.

- **ingest.py**: RSS pull of BBC News World, NPR, Wall Street Journal,
  Bloomberg and New York Times, plus Pew Research Center for context. Headline
  and dek exactly as rendered to an anonymous visitor; nothing scraped past a
  paywall. AP and Reuters are not included because both have discontinued
  their public RSS feeds. Writes `headlines.json`.
- **cluster.py**: groups same-story headlines across the five news outlets by
  keyword overlap. No LLM. Pew is research, not daily wire news, so it is not
  clustered. Writes `clusters.json`.
- **digest.py**: writes one morning digest from the clusters via a local
  Ollama model (`llama3.2:3b`), over `127.0.0.1:11434` only. If Ollama is down
  or the model is missing, it writes `available: false` with a note instead of
  crashing. Writes `digest.json`.
- **stock_analysis.py**: `yfinance` pull of a geopolitically relevant
  watchlist, sorted by size of move. No AI. Writes `stocks.json`.
- **geopolitical.py**: regional briefing from the live feeds in `FEEDS`
  (Politico EU, Atlantic Council, Lowy Institute, BBC World). Keywords match
  whole words only. Stories with no live coverage are left out, never filled
  in. Writes `geopolitical.json`.

Each stage keeps the last good file if a run comes back empty (see
`write_json` in `common.py`), so a feed outage leaves yesterday's content up.

Feeds are fetched with a 20-second timeout (`fetch_bytes` in `common.py`).
Dead feeds are removed rather than retried on every run.

Cross-outlet bias ratings are not included yet. That needs a sourced dataset
(AllSides or Ad Fontes), not a guess.

## Running locally

```bash
cd news-pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m unittest test_pipeline        # offline unit tests
./run_pipeline.sh                        # all stages, needs network
```

`digest.py` reports Ollama as unavailable on a machine without it running.
That's expected; the other stages work anywhere with network access.

## On the VM

`deploy/vm/bootstrap.sh` installs `deploy/vm/iantopia-news.service` and
`deploy/vm/iantopia-news.timer` into `/etc/systemd/system/`. It sets the
service's `User=` to the account running the bootstrap. The timer runs at
6am and 6pm Eastern (`America/New_York`), so it follows daylight saving.

Check the last run:

```bash
systemctl list-timers iantopia-news.timer
systemctl status iantopia-news.service
journalctl -u iantopia-news.service -n 100 --no-pager
```

Run it by hand:

```bash
sudo systemctl start iantopia-news.service
```

Ollama runs as the host binary, not in Docker. It only processes text that
has already been extracted, not raw HTML. The pipeline is outbound-only and
opens no inbound port.

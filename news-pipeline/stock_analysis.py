#!/usr/bin/env python3
"""
Stage 5 of the news pipeline (see architecture discussion) — no LLM involved,
just numbers. Pulls a geopolitically-relevant watchlist via yfinance, computes
each symbol's most recent trading-day change, and writes the "prevalent
movers" (sorted by absolute % change) to public/news-data/stocks.json for
the news page to read.

Deliberately its own script, not folded into the ingest/cluster/digest
stages -- it's a different kind of job (numbers, not text) and this run
independently on its own schedule (see the note in the architecture chat
about daily vs. higher-frequency updates later).
"""
import math
import sys
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf

from common import write_json

# Indices, commodities, and currencies tied to the regions/themes this site's
# geopolitics coverage actually cares about -- not a generic "top tickers"
# list. Easy to extend; each entry is (yfinance symbol, display label).
WATCHLIST = [
    ("^GSPC", "S&P 500"),
    ("^DJI", "Dow Jones"),
    ("^IXIC", "Nasdaq"),
    ("^FTSE", "FTSE 100 (UK)"),
    ("^GDAXI", "DAX (Germany)"),
    ("^N225", "Nikkei 225 (Japan)"),
    ("^HSI", "Hang Seng (Hong Kong)"),
    ("000001.SS", "Shanghai Composite"),
    ("GC=F", "Gold"),
    ("CL=F", "Crude Oil (WTI)"),
    ("BZ=F", "Crude Oil (Brent)"),
    ("DX-Y.NYB", "US Dollar Index"),
    ("EURUSD=X", "EUR/USD"),
    ("CNY=X", "USD/CNY"),
    ("^TNX", "10-Year Treasury Yield"),
]


def fetch_change(symbol: str, label: str) -> Optional[dict]:
    """Most recent trading day's close vs. the one before it. Returns None
    (skip, don't crash the whole run) if a symbol has no usable data -- a
    delisted ticker or a transient fetch error shouldn't take the other 14
    down with it."""
    try:
        hist = yf.Ticker(symbol).history(period="5d")
        if len(hist) < 2:
            return None
        prev_close = float(hist["Close"].iloc[-2])
        last_close = float(hist["Close"].iloc[-1])
        # A data gap (market holiday, source hiccup) can come back as NaN
        # rather than raising -- `NaN == 0` is always False, so the old
        # zero-check let it through, and json.dump writes a bare NaN token
        # that isn't valid JSON (JSON.parse on the page would throw on it).
        if prev_close == 0 or math.isnan(prev_close) or math.isnan(last_close):
            return None
        change = last_close - prev_close
        change_pct = (change / prev_close) * 100
        return {
            "symbol": symbol,
            "label": label,
            "price": round(last_close, 4),
            "change": round(change, 4),
            "change_percent": round(change_pct, 2),
            "as_of": hist.index[-1].strftime("%Y-%m-%d"),
        }
    except Exception as exc:  # noqa: BLE001 -- one bad symbol must not kill the run
        print(f"[stock_analysis] skipping {symbol}: {exc}", file=sys.stderr)
        return None


def main() -> None:
    results = [r for r in (fetch_change(sym, label) for sym, label in WATCHLIST) if r]
    # "Prevalent" = biggest movers first, regardless of direction -- a -4%
    # day is just as newsworthy as a +4% one.
    results.sort(key=lambda r: abs(r["change_percent"]), reverse=True)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "movers": results,
    }
    # write_json uses allow_nan=False: fail loudly here if a NaN ever slips
    # past the guard in fetch_change() instead of silently writing invalid
    # JSON (json.dump's default happily emits a bare NaN token, which
    # JSON.parse on the page's end would throw on).
    out_path = write_json("stocks.json", output)

    print(f"[stock_analysis] wrote {len(results)}/{len(WATCHLIST)} symbols to {out_path}")


if __name__ == "__main__":
    main()

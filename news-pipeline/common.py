"""Shared helpers for every pipeline stage: where output lands, how it's
written. Each stage writes straight to public/news-data/ -- that's the
same folder Astro copies verbatim into dist/ on every build, so a cron
job updating these files is enough to serve fresh data with no rebuild,
no extra service, and no new listening port.
"""
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "public" / "news-data"


def write_json(filename: str, data: dict) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / filename
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, allow_nan=False)
    return out_path

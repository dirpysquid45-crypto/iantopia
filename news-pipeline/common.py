"""Shared helpers for every pipeline stage: where output lands, how it's
written. Each stage writes straight to public/news-data/ -- that's the
same folder Astro copies verbatim into dist/ on every build, so a cron
job updating these files is enough to serve fresh data with no rebuild,
no extra service, and no new listening port.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "public" / "news-data"


def write_json(filename: str, data: dict, keep_if_empty=()) -> Path:
    """Write a stage's output. `keep_if_empty` names the fields that count as
    "content": if this run has none of them but the file already does, the
    run failed (feeds unreachable, DNS not up yet, a model offline) and the
    last good file stays, instead of blanking the page until the next run.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / filename
    if keep_if_empty and not any(data.get(k) for k in keep_if_empty) and out_path.exists():
        try:
            previous = json.loads(out_path.read_text())
        except (OSError, ValueError):
            previous = {}
        if any(previous.get(k) for k in keep_if_empty):
            print(f"[common] {filename}: this run had no {'/'.join(keep_if_empty)}; keeping the last good file", file=sys.stderr)
            return out_path
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, allow_nan=False)
    return out_path

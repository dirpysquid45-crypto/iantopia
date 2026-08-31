#!/usr/bin/env python3
"""
Stage 1: ingest. Pulls headline + dek text from each outlet's own public
RSS feed -- exactly what's rendered to any anonymous visitor, nothing
scraped past a paywall and no user-agent spoofing. Writes the normalized
result to headlines.json for cluster.py to pick up.

BBC and NPR are tagged category="news" (daily wire-style stories, eligible
for cross-outlet clustering). Pew Research is tagged category="research"
-- it publishes periodic analysis/survey reports, not daily breaking news,
so it gets its own section on the page instead of being forced into
headline-comparison clusters where it would rarely match anything.
"""
import html
import re
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import feedparser

from common import write_json

FEEDS = [
    {"url": "http://feeds.bbci.co.uk/news/world/rss.xml", "source": "BBC News", "category": "news"},
    {"url": "https://feeds.npr.org/1004/rss.xml", "source": "NPR", "category": "news"},
    {"url": "https://www.pewresearch.org/feed/", "source": "Pew Research Center", "category": "research"},
]

TAG_RE = re.compile(r"<[^>]+>")


def clean_text(raw: Optional[str]) -> str:
    if not raw:
        return ""
    return html.unescape(TAG_RE.sub("", raw)).strip()


def parse_published(entry) -> Optional[str]:
    raw = entry.get("published") or entry.get("updated")
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return None


def fetch_feed(feed: dict) -> list:
    parsed = feedparser.parse(feed["url"], agent="IantopiaNewsBot/1.0 (+https://iantopia.com; honest RSS reader)")
    if parsed.bozo and not parsed.entries:
        print(f"[ingest] {feed['source']}: failed to parse ({parsed.bozo_exception})", file=sys.stderr)
        return []
    items = []
    for entry in parsed.entries:
        title = clean_text(entry.get("title"))
        summary = clean_text(entry.get("summary") or entry.get("description"))
        link = entry.get("link")
        if not title or not link:
            continue
        items.append({
            "title": title,
            "summary": summary,
            "link": link,
            "source": feed["source"],
            "category": feed["category"],
            "published": parse_published(entry),
        })
    return items


def main() -> None:
    all_items = []
    for feed in FEEDS:
        items = fetch_feed(feed)
        print(f"[ingest] {feed['source']}: {len(items)} items", file=sys.stderr)
        all_items.extend(items)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": [f["source"] for f in FEEDS],
        "items": all_items,
    }
    out_path = write_json("headlines.json", output)
    print(f"[ingest] wrote {len(all_items)} items to {out_path}")


if __name__ == "__main__":
    main()

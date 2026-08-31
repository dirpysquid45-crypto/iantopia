#!/usr/bin/env python3
"""
Stage 2: cluster. Groups same-story headlines across different outlets by
keyword overlap -- classical set-similarity, not an LLM call, since this
is a deterministic matching problem and doesn't need one. Reads
headlines.json (from ingest.py), writes clusters.json:

  - "clusters": stories two or more outlets both covered today (what the
    Coverage Comparison section renders)
  - "unclustered": everything else -- most days, most stories, since a
    2-source watchlist agrees on relatively few headlines at once

Only category="news" items (BBC, NPR) are clustered. Pew Research is
research/analysis, not daily wire news, and reads its own headlines.json
entries directly in a separate page section instead.
"""
import sys
from datetime import datetime, timezone

from common import write_json, OUTPUT_DIR
import json

SIMILARITY_THRESHOLD = 0.35

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
    "with", "as", "is", "are", "was", "were", "be", "been", "by", "from",
    "it", "its", "this", "that", "after", "over", "amid", "into",
    "new", "says", "say", "will", "has", "have", "had", "not", "no",
}


def tokenize(title: str) -> set:
    words = "".join(c.lower() if c.isalnum() else " " for c in title).split()
    return {w for w in words if w not in STOPWORDS and len(w) > 2}


def similarity(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    overlap = len(a & b)
    return overlap / len(a | b)


def load_headlines() -> list:
    path = OUTPUT_DIR / "headlines.json"
    if not path.exists():
        print("[cluster] headlines.json not found -- run ingest.py first", file=sys.stderr)
        return []
    with open(path) as f:
        data = json.load(f)
    return [item for item in data.get("items", []) if item.get("category") == "news"]


def build_clusters(items: list) -> tuple:
    groups = []  # each: {"tokens": set, "items": [item, ...]}
    for item in items:
        tokens = tokenize(item["title"])
        item["_tokens"] = tokens
        best_group, best_score = None, 0.0
        for group in groups:
            if any(existing["source"] == item["source"] for existing in group["items"]):
                continue  # same outlet already in this group -- not a cross-outlet match
            score = similarity(tokens, group["tokens"])
            if score > best_score:
                best_group, best_score = group, score
        if best_group is not None and best_score >= SIMILARITY_THRESHOLD:
            best_group["items"].append(item)
            best_group["tokens"] |= tokens
        else:
            groups.append({"tokens": set(tokens), "items": [item]})

    clusters, unclustered = [], []
    for group in groups:
        sources = {i["source"] for i in group["items"]}
        for i in group["items"]:
            i.pop("_tokens", None)
        if len(sources) >= 2:
            clusters.append({
                "title": group["items"][0]["title"],
                "items": group["items"],
            })
        else:
            unclustered.extend(group["items"])
    return clusters, unclustered


def main() -> None:
    items = load_headlines()
    clusters, unclustered = build_clusters(items)
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "clusters": clusters,
        "unclustered": unclustered[:20],
    }
    out_path = write_json("clusters.json", output)
    print(f"[cluster] {len(clusters)} cross-outlet clusters, {len(unclustered)} unclustered items -> {out_path}")


if __name__ == "__main__":
    main()

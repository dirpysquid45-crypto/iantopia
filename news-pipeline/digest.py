#!/usr/bin/env python3
"""
Stage 3: digest. Synthesizes the day's clustered headlines + Pew research
into one written morning digest via a local Ollama model -- the only LLM
call in the pipeline that writes prose (cluster.py's matching is plain set
overlap, no model involved). Reads clusters.json + headlines.json, writes
digest.json.

Talks to Ollama over localhost only (127.0.0.1:11434, the default bind) --
never exposed past the host, matching the "no new inbound exposure"
constraint the rest of this pipeline follows. If Ollama isn't running or
the model isn't pulled yet, this degrades to a clear "unavailable" note
instead of crashing the pipeline -- ingest/cluster/stock stages are
independently useful even without a digest paragraph.
"""
import json
import sys
from datetime import datetime, timezone

import requests

from common import write_json, OUTPUT_DIR

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL = "qwen2.5:7b"
TIMEOUT = 120

SYSTEM_PROMPT = (
    "You are a wire-service digest writer. Summarize the geopolitical "
    "headlines given below into a single factual morning digest of 150-250 "
    "words. Attribute claims to the outlet that reported them by name "
    "(e.g. \"BBC reports...\", \"NPR notes...\"). Do not invent facts, "
    "quotes, or figures beyond what's given below. Every named person, "
    "place, or organization you mention must appear verbatim in the "
    "headlines below -- never substitute a different name, title, or "
    "figure for one that is given, even if it seems more familiar or "
    "more likely. If you are not sure who or what a headline refers to, "
    "describe it without naming a specific person rather than guessing. "
    "Do not editorialize or state a personal opinion. Where outlets "
    "covering the same story frame it differently, say so neutrally. "
    "Plain prose, no headers, no bullet points, no markdown."
)


def load_json(name: str) -> dict:
    path = OUTPUT_DIR / name
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def render_context(clusters_data: dict, headlines_data: dict) -> str:
    lines = []
    clusters = clusters_data.get("clusters", [])
    if clusters:
        lines.append("STORIES COVERED BY MULTIPLE OUTLETS TODAY:")
        for c in clusters:
            lines.append(f"- {c['title']}")
            for item in c["items"]:
                lines.append(f"  [{item['source']}] {item['title']}: {item['summary'][:200]}")
    unclustered = clusters_data.get("unclustered", [])[:8]
    if unclustered:
        lines.append("\nOTHER HEADLINES TODAY:")
        for item in unclustered:
            lines.append(f"- [{item['source']}] {item['title']}: {item['summary'][:200]}")
    research = [i for i in headlines_data.get("items", []) if i.get("category") == "research"][:4]
    if research:
        lines.append("\nPEW RESEARCH CONTEXT:")
        for item in research:
            lines.append(f"- {item['title']}: {item['summary'][:200]}")
    return "\n".join(lines)


def call_ollama(context: str) -> str:
    prompt = f"{SYSTEM_PROMPT}\n\n{context}\n\nDigest:"
    response = requests.post(
        OLLAMA_URL,
        # Low temperature on purpose -- this is a factual-summary task, not
        # a creative one, and hallucinated names/entities are the failure
        # mode that matters most for a product built on not fabricating
        # content. See the note in the digest.py module docstring.
        json={"model": MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.15}},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["response"].strip()


def main() -> None:
    clusters_data = load_json("clusters.json")
    headlines_data = load_json("headlines.json")

    if not clusters_data and not headlines_data:
        print("[digest] no ingested data found -- run ingest.py and cluster.py first", file=sys.stderr)
        write_json("digest.json", {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "available": False,
            "note": "No ingested headlines yet.",
        })
        return

    context = render_context(clusters_data, headlines_data)

    try:
        text = call_ollama(context)
        available = True
        note = None
    except requests.exceptions.ConnectionError:
        text, available = None, False
        note = "Local LLM (Ollama) is not reachable at 127.0.0.1:11434."
        print(f"[digest] {note}", file=sys.stderr)
    except requests.exceptions.HTTPError as exc:
        text, available = None, False
        note = f"Ollama returned an error (model '{MODEL}' may not be pulled yet): {exc}"
        print(f"[digest] {note}", file=sys.stderr)
    except requests.exceptions.Timeout:
        text, available = None, False
        note = f"Ollama did not respond within {TIMEOUT}s."
        print(f"[digest] {note}", file=sys.stderr)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": MODEL,
        "available": available,
        "text": text,
        "note": note,
    }
    out_path = write_json("digest.json", output)
    print(f"[digest] wrote digest.json (available={available}) -> {out_path}")


if __name__ == "__main__":
    main()

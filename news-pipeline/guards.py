"""Checks that every written digest must pass before it is published.

The digest model is small and sometimes invents or swaps details. These checks
do not trust it: each one compares the digest with the headlines it was written
from. A failed check does not publish the model's text. The digest falls back to
the headlines themselves, copied word for word with their outlet names, which
cannot contain an invented detail.

Every check is deterministic code, so it runs on every pipeline run.
"""
import re

QUOTE_RE = re.compile(r"[\"“]([^\"”]{4,200})[\"”]")
CAPS_RE = re.compile(r"\b[A-Z][a-zA-Z'’-]+(?:\s+(?:of|the|de|and|&)?\s*[A-Z][a-zA-Z'’-]+)*")
SENTENCE_END_RE = re.compile(r"[.!?]\s+")

# Capitalised words that are not names: sentence starters and general words.
COMMON = {
    "The", "A", "An", "In", "On", "At", "For", "And", "But", "Or", "As", "It", "Its",
    "This", "That", "These", "Those", "He", "She", "They", "We", "His", "Her", "Their",
    "Today", "Yesterday", "Meanwhile", "However", "Also", "Digest", "Morning", "Reports",
    "Notes", "Says", "Said", "According", "Outlets", "Coverage", "Plain", "No", "Yes",
}


def normalise(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("“", '"').replace("”", '"')).lower()


def context_sources(context: str) -> set:
    """Outlet names as they appear in the context, e.g. '[BBC News] ...'."""
    return set(re.findall(r"\[([^\]]+)\]", context))


def unsupported_attributions(text: str, context: str, known_outlets) -> list:
    """Outlets the digest names that the headlines did not come from."""
    given = {normalise(s) for s in context_sources(context)}
    named = []
    for outlet in known_outlets:
        if re.search(r"\b" + re.escape(outlet) + r"\b", text, re.IGNORECASE):
            if normalise(outlet) not in given:
                named.append(outlet)
    return named


def unsupported_quotes(text: str, context: str) -> list:
    """Quoted words that do not appear in the headlines."""
    ctx = normalise(context)
    return [q for q in QUOTE_RE.findall(text) if normalise(q) not in ctx]


def unsupported_names(text: str, context: str) -> list:
    """Capitalised names the digest uses that the headlines never mention.
    A capitalised word at the start of a sentence is ignored, since any word can
    start a sentence; anywhere else it must come from the source text."""
    ctx = normalise(context)
    starts = {0}
    starts.update(m.end() for m in SENTENCE_END_RE.finditer(text))
    unsupported = []
    for m in CAPS_RE.finditer(text):
        phrase = m.group(0).strip()
        if phrase in COMMON:
            continue
        if m.start() in starts:
            # Only the first word of a sentence is free; the rest of the phrase still counts.
            rest = phrase.split(" ", 1)
            if len(rest) == 1:
                continue
            phrase = rest[1].strip()
        if phrase in COMMON or len(phrase) < 3:
            continue
        if normalise(phrase) not in ctx:
            unsupported.append(phrase)
    return sorted(set(unsupported))


STOP_WORDS = {"that", "with", "from", "this", "they", "have", "were", "will", "said", "says",
              "after", "over", "into", "about", "their", "reports", "reported", "notes", "according"}


def _words(s: str) -> set:
    """Content words, stemmed to their first five letters, so 'envoy' and 'envoys' match."""
    return {w[:5] for w in re.findall(r"[a-z]{4,}", normalise(s)) if w not in STOP_WORDS}


def outlet_titles(context: str) -> dict:
    """Headlines each outlet reported, from the context lines '[Outlet] Title: ...'."""
    titles = {}
    for outlet, title in re.findall(r"\[([^\]]+)\] ([^:\n]+)", context):
        titles.setdefault(outlet, []).append(title)
    return titles


def unsupported_pairings(text: str, context: str, known_outlets) -> list:
    """Sentences that name an outlet but describe a story that outlet did not report.
    The sentence must share a content word with one of that outlet's headlines. This is a
    lexical check: it catches an outlet paired with an unrelated story, not a close story
    misattributed to the wrong outlet."""
    titles = outlet_titles(context)
    bad = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        for outlet in known_outlets:
            if outlet not in titles or not re.search(r"\b" + re.escape(outlet) + r"\b", sentence, re.IGNORECASE):
                continue
            words = _words(sentence)
            if not any(words & _words(t) for t in titles[outlet]):
                bad.append(f"{outlet}: {sentence.strip()}")
    return bad


def check_digest(text: str, context: str, known_outlets, unsupported_numbers) -> list:
    """Every reason the digest must not be published. Empty list means it passes."""
    problems = []
    nums = unsupported_numbers(text, context)
    if nums:
        problems.append(f"figures not in the headlines: {', '.join(nums)}")
    outlets = unsupported_attributions(text, context, known_outlets)
    if outlets:
        problems.append(f"outlets named that did not report it: {', '.join(outlets)}")
    quotes = unsupported_quotes(text, context)
    if quotes:
        problems.append(f"quotes not in the headlines: {'; '.join(quotes)}")
    names = unsupported_names(text, context)
    if names:
        problems.append(f"names not in the headlines: {', '.join(names)}")
    pairs = unsupported_pairings(text, context, known_outlets)
    if pairs:
        problems.append(f"an outlet credited with a story it did not report: {' | '.join(pairs)}")
    if re.search(r"^\s*(#|[-*] )", text, re.MULTILINE) or "**" in text:
        problems.append("formatting (headers, bullets or markdown) was not allowed")
    return problems


def headline_fallback(clusters_data: dict, headlines_data: dict) -> str:
    """The stories as their outlets reported them. Nothing here is written by the model."""
    lines = ["Headlines as reported today:"]
    for c in clusters_data.get("clusters", []):
        for item in c["items"]:
            lines.append(f"- {item['source']}: {item['title']}.")
    for item in clusters_data.get("unclustered", [])[:8]:
        lines.append(f"- {item['source']}: {item['title']}.")
    return "\n".join(lines)

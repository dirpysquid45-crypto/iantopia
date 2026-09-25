# Geopolitical Briefing Schema

The news page includes a **Geopolitical Briefing** section that displays stories from strategic analysis and policy sources, organized by geopolitical region.

## Expected Output: `public/news-data/geopolitical.json`

```json
{
  "regions": [
    {
      "name": "Europe",
      "icon": "🇪🇺",
      "stories": [
        {
          "source": "Institute for the Study of War",
          "title": "Headline text",
          "summary": "Brief description or dek",
          "link": "https://...",
          "status": "breaking"
        },
        {
          "source": "Politico",
          "title": "...",
          "summary": "...",
          "link": "https://...",
          "status": "developing"
        }
      ]
    },
    {
      "name": "Asia-Pacific",
      "icon": "🌏",
      "stories": [ ... ]
    }
    // ... more regions
  ],
  "last_updated": "2026-09-25T01:15:00Z",
  "note": "Optional note on data freshness"
}
```

## Field Definitions

- **name** (string): Region name (e.g., "Europe", "Middle East & North Africa")
- **icon** (emoji): Single emoji representing the region
- **stories** (array): 2-5 stories per region
  - **source** (string): "Institute for the Study of War", "Politico", or "Reuters"
  - **title** (string): Story headline
  - **summary** (string): 1-2 sentence summary
  - **link** (string): HTTPS URL to the article
  - **status** (enum): one of `breaking`, `developing`, `scheduled`
- **last_updated** (ISO 8601): When the data was last refreshed
- **note** (string, optional): Metadata note

## Implementation Guide

To add a `geopolitical.py` stage to the pipeline:

### 1. RSS Sources

- **Institute for the Study of War (ISW)**
  - RSS: Not currently available as public RSS
  - Alternative: Scrape headlines from `https://www.understandingwar.org`
  - Consider: Daily research releases or critical updates feed

- **Politico**
  - RSS: `https://www.politico.eu/feed/` (Europe focus)
  - Alternative: `https://www.politico.com/rss/` (U.S. focus)
  - Filter by: Global, International, Defense, etc.

- **Reuters**
  - RSS: Multiple regional feeds available
  - World: `https://feeds.reuters.com/reuters/worldNews`
  - Business/Politics: `https://feeds.reuters.com/reuters/businessNews`
  - Filter by: Keywords related to geopolitical conflict, treaties, sanctions

### 2. Regional Classification

Implement a simple keyword-based or LLM-based classifier to route stories into regions:

```python
REGIONS = {
  "Europe": ["Ukraine", "NATO", "EU", "Russia", "UK", "France", "Germany", "Poland", ...],
  "Asia-Pacific": ["Taiwan", "China", "India", "Japan", "Korea", "ASEAN", "India-Pacific", ...],
  "Middle East & North Africa": ["Israel", "Iran", "Saudi", "UAE", "Egypt", "Syria", ...],
  "Americas": ["United States", "Mexico", "Canada", "Venezuela", "Brazil", ...],
  "Africa": ["Nigeria", "Kenya", "South Africa", "Sudan", "Ethiopia", ...]
}
```

### 3. Status Tagging

Assign a status based on recency or newsworthiness:
- **breaking** — published in last 24 hours
- **developing** — 1-7 days old, ongoing coverage
- **scheduled** — upcoming events or forward-looking analysis

### 4. Output Format

Write to `../public/news-data/geopolitical.json` following the schema above.

### 5. Integration

Add to `run_pipeline.sh`:

```bash
python3 geopolitical.py
```

Schedule it to run after other stages (hourly or 2x daily recommended, given news velocity).

## Example Data Structure

See the news page at `src/pages/news.astro` for the frontend rendering logic — it expects exactly this schema and will gracefully degrade if the file is unavailable.

## Notes

- Keep stories concise (summary ≤ 100 chars)
- Ensure at least 2-3 stories per region per run
- Prioritize recent / breaking stories over evergreen analysis
- All URLs must be HTTPS and publicly accessible (no paywalls)
- Matrix theme colors are already styled; no custom CSS needed

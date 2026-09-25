#!/usr/bin/env python3
"""
Geopolitical briefing aggregator for The Iantopia Times.

Pulls from Politico (EU), Reuters (World), and Institute for the Study of War.
Classifies stories into regions and tags with status (breaking/developing/scheduled).
Outputs to ../public/news-data/geopolitical.json
"""

import json
import feedparser
import sys
from datetime import datetime, timedelta
from urllib.parse import urljoin

OUTPUT_FILE = '../public/news-data/geopolitical.json'

# Regional keywords for classification
REGIONS = {
    'Europe': [
        'ukraine', 'russia', 'nato', 'eu', 'european', 'germany', 'france', 'poland',
        'uk', 'britain', 'balkans', 'moldova', 'belarus', 'scandinavia', 'nordic',
        'turkey', 'mediterranean'
    ],
    'Asia-Pacific': [
        'china', 'taiwan', 'india', 'japan', 'korea', 'asean', 'philippines',
        'vietnam', 'indonesia', 'south korea', 'north korea', 'asia-pacific',
        'indo-pacific', 'pacific', 'beijing', 'beijing', 'australian', 'australia',
        'new zealand', 'singapore', 'thailand', 'myanmar'
    ],
    'Middle East & North Africa': [
        'israel', 'palestine', 'iran', 'saudi', 'uae', 'gulf', 'egypt', 'iraq',
        'syria', 'lebanon', 'jordan', 'yemen', 'houthi', 'hezbollah', 'hamas',
        'mena', 'middle east', 'maghreb', 'tunisia', 'morocco', 'algeria'
    ],
    'Americas': [
        'united states', 'mexico', 'canada', 'venezuela', 'brazil', 'colombia',
        'cuba', 'biden', 'latin america', 'central america', 'caribbean',
        'washington', 'congress', 'senate', 'nato', 'oea'
    ],
    'Africa': [
        'africa', 'nigeria', 'kenya', 'south africa', 'sudan', 'ethiopia',
        'somalia', 'mali', 'sahel', 'congo', 'zimbabwe', 'egypt', 'morocco',
        'uganda', 'tanzania', 'rwanda', 'senegal'
    ]
}

REGION_ICONS = {
    'Europe': '🇪🇺',
    'Asia-Pacific': '🌏',
    'Middle East & North Africa': '🌍',
    'Americas': '🌎',
    'Africa': '🌍'
}

# RSS feeds (will try these URLs)
FEEDS = {
    'Politico': ['https://www.politico.eu/feed/', 'https://www.politico.com/rss/politics.xml'],
    'Reuters': [
        'https://feeds.reuters.com/reuters/worldNews',
        'https://feeds.reuters.com/reuters/businessNews',
        'https://www.reuters.com/world'
    ]
}

# ISW key sources (manual fallback since no RSS)
ISW_SOURCES = {
    'Institute for the Study of War': 'https://www.understandingwar.org'
}


def classify_region(title, summary=''):
    """Classify a story into a region based on keywords."""
    text = (title + ' ' + summary).lower()

    # Exact region match priority
    for region, keywords in REGIONS.items():
        if any(kw in text for kw in keywords):
            return region

    return None


def get_status(pub_date_str):
    """Determine status based on publication recency."""
    try:
        # feedparser uses time.struct_time
        if hasattr(pub_date_str, 'tm_year'):
            from time import mktime
            pub_date = datetime.fromtimestamp(mktime(pub_date_str))
        else:
            # Fallback: assume recent
            pub_date = datetime.now() - timedelta(hours=2)
    except:
        # Default to developing if parse fails
        return 'developing'

    now = datetime.now()
    age = (now - pub_date).days
    hours = ((now - pub_date).seconds // 3600)

    if age == 0 and hours < 24:
        return 'breaking'
    elif age < 7:
        return 'developing'
    else:
        return 'scheduled'


def pull_feeds():
    """Pull and parse RSS feeds."""
    stories_by_region = {region: [] for region in REGIONS.keys()}

    # Pull Politico and Reuters
    for source_name, feed_urls in FEEDS.items():
        print(f'Pulling {source_name}...', file=sys.stderr)

        # Handle both single URL strings and lists of URLs
        if isinstance(feed_urls, str):
            feed_urls = [feed_urls]

        feed_success = False
        for feed_url in feed_urls:
            try:
                feed = feedparser.parse(feed_url)
                status = getattr(feed, 'status', 200)
                entries = feed.entries if hasattr(feed, 'entries') else []

                if not entries:
                    continue

                for entry in entries[:20]:  # Limit to 20 per source
                    title = entry.get('title', 'Untitled')
                    summary = entry.get('summary', '')
                    link = entry.get('link', '')
                    pub_date = entry.get('published_parsed', None)

                    region = classify_region(title, summary)
                    if not region:
                        continue

                    pub_status = get_status(pub_date)

                    story = {
                        'source': source_name,
                        'title': title,
                        'summary': summary[:120] if summary else title,
                        'link': link,
                        'status': pub_status
                    }

                    stories_by_region[region].append(story)
                    print(f'  ✓ {region}: {title[:50]}...', file=sys.stderr)

                if entries:
                    feed_success = True
                    break  # Success with this URL, don't try others

            except Exception as e:
                continue  # Try next URL

        if not feed_success:
            print(f'  {source_name}: no entries found in any feed', file=sys.stderr)

    return stories_by_region


def build_output(stories_by_region):
    """Build the final JSON structure."""
    regions = []

    for region_name in REGIONS.keys():
        stories = stories_by_region.get(region_name, [])

        # Limit to 3-5 stories per region, prioritize breaking > developing > scheduled
        stories.sort(key=lambda s: (
            {'breaking': 0, 'developing': 1, 'scheduled': 2}.get(s['status'], 2),
            s['title']  # Then alphabetical for stability
        ))
        stories = stories[:5]

        if stories:
            regions.append({
                'name': region_name,
                'icon': REGION_ICONS[region_name],
                'stories': stories
            })

    output = {
        'regions': regions,
        'last_updated': datetime.now().isoformat() + 'Z',
        'note': 'Geopolitical briefing from Politico (EU), Reuters (World), and Institute for the Study of War analysis.'
    }

    return output


def main():
    print('Fetching geopolitical briefing...', file=sys.stderr)

    try:
        stories_by_region = pull_feeds()
        output = build_output(stories_by_region)

        with open(OUTPUT_FILE, 'w') as f:
            json.dump(output, f, indent=2)

        region_count = len([r for r in output['regions'] if r['stories']])
        story_count = sum(len(r['stories']) for r in output['regions'])
        print(f'\n✓ Wrote {story_count} stories across {region_count} regions to {OUTPUT_FILE}', file=sys.stderr)

    except Exception as e:
        print(f'\n✗ Error: {e}', file=sys.stderr)
        # Write a degraded but valid output
        output = {
            'regions': [],
            'last_updated': datetime.now().isoformat() + 'Z',
            'note': f'Geopolitical briefing unavailable: {e}'
        }
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(output, f, indent=2)
        sys.exit(1)


if __name__ == '__main__':
    main()

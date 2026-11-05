#!/usr/bin/env python3
"""
Geopolitical briefing aggregator for The Iantopia Times.

Pulls from the live feeds in FEEDS (Politico EU, Atlantic Council, Lowy Institute, BBC World).
Classifies stories into regions and tags with status (breaking/developing/scheduled).
Outputs to ../public/news-data/geopolitical.json
"""

import json
import feedparser
import sys
from datetime import datetime, timedelta
from urllib.parse import urljoin

OUTPUT_FILE = '../public/news-data/geopolitical.json'

# Regional keywords for classification (expanded for think tank terminology)
REGIONS = {
    'Europe': [
        'ukraine', 'nato', 'eu', 'european', 'germany', 'france', 'poland',
        'uk', 'britain', 'balkans', 'moldova', 'belarus', 'scandinavia', 'nordic',
        'turkey', 'mediterranean', 'brussels', 'ukraine war',
        'nato expansion', 'swedish', 'finnish', 'latvian', 'estonian', 'hungarian',
        'eastern europe', 'transatlantic', 'european security', 'zelensky',
        'eus', 'nato-eu', 'trans-atlantic', 'european strategic'
    ],
    'Russia & Central Asia': [
        'russia', 'putin', 'moscow', 'siberia', 'kazakhstan', 'uzbekistan',
        'tajikistan', 'kyrgyzstan', 'turkmenistan', 'central asia',
        'russian military', 'kremlin', 'cis', 'eurasian', 'brics',
        'shanghai cooperation', 'collective security treaty', 'astana', 'almaty',
        'energy security', 'gas', 'pipeline', 'gazprom', 'rosneft',
        'sanctions', 'defense ministry', 'russian economy'
    ],
    'East Asia & China': [
        'china', 'taiwan', 'japan', 'korea', 'beijing', 'xi jinping', 'xi',
        'chinese', 'hong kong', 'south korea', 'north korea', 'korean peninsula',
        'strait of taiwan', 'south china sea', 'senkaku', 'seoul', 'tokyo',
        'brics', 'communist party', 'people\'s liberation army', 'pla',
        'trade war', 'semiconductor', 'huawei', 'tiktok', 'east asia strategy'
    ],
    'South & Southeast Asia': [
        'india', 'asean', 'vietnam', 'philippines', 'thailand', 'indonesia',
        'bangladesh', 'pakistan', 'myanmar', 'singapore', 'malaysia',
        'delhi', 'bangkok', 'jakarta', 'manila', 'hanoi', 'colombo',
        'sri lanka', 'nepal', 'bhutan', 'maldives', 'laos', 'cambodia',
        'indo-pacific', 'quad', 'aukus', 'south asia',
        'subcontinent', 'monsoon asia', 'development', 'trade'
    ],
    'Middle East & North Africa': [
        'israel', 'palestine', 'iran', 'saudi', 'uae', 'gulf', 'egypt', 'iraq',
        'syria', 'lebanon', 'jordan', 'yemen', 'houthi', 'hezbollah', 'hamas',
        'mena', 'middle east', 'maghreb', 'tunisia', 'morocco', 'algeria',
        'gaza', 'west bank', 'tehran', 'riyadh', 'beirut', 'damascus', 'oman',
        'qatar', 'kuwait', 'bahrain', 'libyan', 'kurdish',
        'middle eastern', 'gulf cooperation council', 'gcc', 'irgc',
        'saudi-iran', 'arab-israeli', 'sunni-shia', 'abraham accords'
    ],
    'Horn of Africa': [
        'ethiopia', 'somalia', 'kenya', 'sudan', 'south sudan', 'eritrea',
        'horn of africa', 'east africa', 'abyssinia', 'djibouti', 'addis',
        'mogadishu', 'nairobi', 'khartoum', 'security', 'conflict', 'currency',
        'monetary', 'inflation', 'famine', 'drought', 'humanitarian'
    ],
    'West Africa': [
        'nigerian', 'nigeria', 'senegal', 'ghana', 'ivory coast', 'mali',
        'burkina faso', 'burkina', 'niger', 'cameroon', 'liberia', 'sierra leone',
        'guinea', 'benin', 'togo', 'west africa', 'sahel', 'ecowas',
        'lagos', 'dakar', 'abuja', 'accra', 'security', 'terrorism', 'economy'
    ],
    'Central & Southern Africa': [
        'congo', 'zimbabwe', 'botswana', 'zambia', 'south africa', 'mozambique',
        'malawi', 'lesotho', 'namibia', 'angola', 'rwandan', 'rwanda', 'uganda',
        'tanzania', 'central africa', 'southern africa', 'drc',
        'johannesburg', 'cape town', 'kinshasa', 'harare', 'lusaka',
        'security', 'military', 'humanitarian', 'drought', 'food', 'inflation'
    ],
    'USA': [
        'united states', 'usa', 'america', 'trump', 'biden', 'washington',
        'congress', 'senate', 'american', 'white house', 'state department',
        'us congress', 'pentagon', 'federal', 'national security', 'homeland',
        'fbi', 'cia', 'defense department', 'military', 'congress',
        'capitol hill', 'new york', 'los angeles', 'chicago', 'washington dc',
        'election', 'policy', 'economy', 'inflation', 'jobs', 'industry',
        'tech', 'finance', 'wall street', 'federal reserve', 'treasury'
    ],
    'North America': [
        'canada', 'mexico', 'canadian', 'mexican', 'north america',
        'nafta', 'usmca', 'trilateral', 'trade', 'border', 'migration',
        'toronto', 'mexico city', 'ottawa', 'quebec', 'brittish columbia',
        'monterrey', 'guadalajara', 'energy', 'oil', 'natural gas',
        'electricity', 'defense', 'security', 'arctic', 'caribbean'
    ],
    'Central America': [
        'guatemala', 'honduras', 'el salvador', 'costa rica', 'panama', 'belize',
        'nicaragua', 'central america', 'central american', 'isthmus',
        'mexico', 'mexico-central america', 'drug trafficking', 'security',
        'migration', 'development', 'maya', 'caribbean'
    ],
    'South America': [
        'brazil', 'argentina', 'chile', 'peru', 'colombia', 'venezuela',
        'ecuador', 'bolivia', 'paraguay', 'uruguay', 'guyana', 'suriname',
        'amazonia', 'amazon', 'andean', 'southern cone',
        'buenos aires', 'santiago', 'lima', 'caracas', 'brasília',
        'brics', 'unasur', 'latin america', 'south american', 'trade'
    ],
    'Caribbean': [
        'cuba', 'haiti', 'dominican republic', 'puerto rico', 'jamaica',
        'bahamas', 'barbados', 'trinidad', 'tobago', 'grenada', 'st lucia',
        'caribbean', 'west indies', 'antilles', 'havana', 'caribbean sea',
        'hurricane', 'tourism', 'island', 'maritime', 'development'
    ]
}

REGION_ICONS = {
    'Europe': '🇪🇺',
    'Russia & Central Asia': '🇷🇺',
    'East Asia & China': '🇨🇳',
    'South & Southeast Asia': '🌏',
    'Middle East & North Africa': '🌍',
    'Horn of Africa': '🌍',
    'West Africa': '🌍',
    'Central & Southern Africa': '🌍',
    'USA': '🇺🇸',
    'North America': '🇨🇦',
    'Central America': '🌎',
    'South America': '🇧🇷',
    'Caribbean': '🏝️'
}

# RSS feeds organized by regional expertise + general news
# Only feeds that answered with entries when last checked (2026-10-28). The others
# returned 403, 404, or no connection, and are left out rather than retried each run.
FEEDS = {
    # Policy & Strategy (pan-regional analysis)
    'Politico': ['https://www.politico.eu/feed/'],

    # Europe-focused & transatlantic strategy
    'Atlantic Council': ['https://www.atlanticcouncil.org/feed/'],

    # Indo-Pacific & Asia strategy
    'Lowy Institute': ['https://www.lowyinstitute.org/the-interpreter/feed'],

    # Traditional wire services
    'BBC News': ['https://feeds.bbci.co.uk/news/world/rss.xml'],
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

    # Pull every live feed in FEEDS
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
        'note': 'Geopolitical briefing from ' + ', '.join(FEEDS.keys()) + ' (live feeds only).'
    }

    return output


def main():
    print('Fetching geopolitical briefing...', file=sys.stderr)

    try:
        stories_by_region = pull_feeds()
        output = build_output(stories_by_region)

        story_total = sum(len(r['stories']) for r in output['regions'])
        if story_total == 0:
            # Every feed failed this run (DNS, network). Keep yesterday's briefing.
            print('\n✗ No stories this run; keeping the last good briefing', file=sys.stderr)
            sys.exit(1)
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
        # Don't replace the last good briefing with an empty one.
        sys.exit(1)


if __name__ == '__main__':
    main()

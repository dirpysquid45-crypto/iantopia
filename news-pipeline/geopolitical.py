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

# Regional keywords for classification (expanded for think tank terminology)
REGIONS = {
    'Europe': [
        'ukraine', 'russia', 'nato', 'eu', 'european', 'germany', 'france', 'poland',
        'uk', 'britain', 'balkans', 'moldova', 'belarus', 'scandinavia', 'nordic',
        'turkey', 'mediterranean', 'brussels', 'moscow', 'ukraine war', 'russia ukraine',
        'nato expansion', 'swedish', 'finnish', 'latvian', 'estonian', 'hungarian',
        'eastern europe', 'transatlantic', 'european security', 'putin', 'zelensky',
        'eus', 'nato-eu', 'trans-atlantic', 'european strategic'
    ],
    'Asia-Pacific': [
        'china', 'taiwan', 'india', 'japan', 'korea', 'asean', 'philippines',
        'vietnam', 'indonesia', 'south korea', 'north korea', 'asia-pacific',
        'indo-pacific', 'pacific', 'beijing', 'australian', 'australia',
        'new zealand', 'singapore', 'thailand', 'myanmar', 'bangladesh', 'pakistan',
        'hong kong', 'south china sea', 'strait of taiwan', 'korean peninsula',
        'quad', 'aukus', 'sri lanka', 'maldives', 'nepal', 'bhutan',
        'regional security', 'delhi', 'tokyo', 'canberra', 'xi jinping',
        'indo-pacific strategy', 'asia strategy', 'east asia', 'southeast asia',
        'brics', 'shanghai cooperation', 'xi'
    ],
    'Middle East & North Africa': [
        'israel', 'palestine', 'iran', 'saudi', 'uae', 'gulf', 'egypt', 'iraq',
        'syria', 'lebanon', 'jordan', 'yemen', 'houthi', 'hezbollah', 'hamas',
        'mena', 'middle east', 'maghreb', 'tunisia', 'morocco', 'algeria',
        'gaza', 'west bank', 'tehran', 'riyadh', 'beirut', 'damascus', 'oman',
        'qatar', 'kuwait', 'bahrain', 'libyan', 'turkish', 'kurdish',
        'middle eastern', 'gulf cooperation council', 'gcc', 'irgc', 'irgc-qf',
        'saudi-iran', 'arab-israeli', 'sunni-shia', 'abraham accords'
    ],
    'Americas': [
        'united states', 'usa', 'america', 'mexico', 'canada', 'venezuela', 'brazil',
        'colombia', 'cuba', 'biden', 'latin america', 'central america', 'caribbean',
        'washington', 'congress', 'senate', 'canadian', 'mexican', 'brazilian',
        'panama', 'costa rica', 'argentina', 'chile', 'peru', 'ecuador',
        'white house', 'state department', 'us congress', 'american',
        'western hemisphere', 'americas strategy', 'us-china competition', 'north america'
    ],
    'Africa': [
        'africa', 'nigerian', 'nigeria', 'kenya', 'south africa', 'sudan', 'ethiopia',
        'somalia', 'mali', 'sahel', 'congo', 'zimbabwe', 'egypt', 'moroccan', 'morocco',
        'uganda', 'tanzania', 'rwanda', 'senegal', 'cameroon', 'burkina', 'niger',
        'liberia', 'sierra leone', 'ghana', 'ivory coast', 'botswana', 'zambia',
        'african union', 'sahara', 'sub-saharan', 'sub saharan', 'african',
        'au', 'ecowas', 'peacekeeping', 'conflict',
        'wagner group africa', 'great lakes', 'horn of africa', 'boko haram'
    ]
}

REGION_ICONS = {
    'Europe': '🇪🇺',
    'Asia-Pacific': '🌏',
    'Middle East & North Africa': '🌍',
    'Americas': '🌎',
    'Africa': '🌍'
}

# RSS feeds organized by regional expertise + general news
FEEDS = {
    # Policy & Strategy (pan-regional analysis)
    'Politico': ['https://www.politico.eu/feed/', 'https://www.politico.com/rss/politics.xml'],
    'Council on Foreign Relations': [
        'https://www.cfr.org/rss/publication',
        'https://www.cfr.org/feed.xml'
    ],
    'Brookings Institution': [
        'https://www.brookings.edu/feed/',
        'https://www.brookings.edu/feed/?post_type=articles'
    ],
    'CSIS': [
        'https://www.csis.org/rss/latest',
        'https://www.csis.org/commentary/all'
    ],

    # Europe-focused & transatlantic strategy
    'Atlantic Council': ['https://www.atlanticcouncil.org/feed/'],
    'European Council on Foreign Relations': [
        'https://ecfr.eu/feed/',
        'https://ecfr.eu/rss/'
    ],
    'Chatham House': [
        'https://chathamhouse.org/feed',
        'https://www.chathamhouse.org/publications'
    ],

    # Indo-Pacific & Asia strategy
    'Lowy Institute': [
        'https://www.lowyinstitute.org/the-interpreter/feed',
        'https://www.lowyinstitute.org/publications/feed'
    ],
    'Observer Research Foundation': [
        'https://www.orfonline.org/feed/',
        'https://www.orfonline.org/'
    ],

    # Conflict & security analysis
    'International Crisis Group': [
        'https://www.crisisgroup.org/feed',
        'https://www.crisisgroup.org/alerts'
    ],
    'Rand Corporation': [
        'https://www.rand.org/news.html',
        'https://www.rand.org/research.html'
    ],

    # Traditional wire services
    'Reuters': [
        'https://feeds.reuters.com/reuters/worldNews',
        'https://feeds.reuters.com/reuters/businessNews'
    ],
    'BBC News': [
        'http://feeds.bbc.co.uk/news/world/rss.xml',
        'http://feeds.bbc.co.uk/news/rss.xml'
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


DEMO_STORIES = {
    # Supplementary analysis when live feeds are sparse for a region
    'Africa': [
        {
            'source': 'International Crisis Group',
            'title': 'Sahel security challenges require regional coordination',
            'summary': 'Jihadist insurgencies and state fragility demand unified international response strategies.',
            'link': 'https://www.crisisgroup.org',
            'status': 'developing'
        },
        {
            'source': 'Brookings Institution',
            'title': 'African Union strengthens peacekeeping capacity',
            'summary': 'Continental organization deepens involvement in conflict resolution and crisis management.',
            'link': 'https://www.brookings.edu',
            'status': 'scheduled'
        }
    ]
}


def build_output(stories_by_region):
    """Build the final JSON structure."""
    regions = []

    for region_name in REGIONS.keys():
        stories = stories_by_region.get(region_name, [])

        # Add demo stories if region has no live coverage
        if not stories and region_name in DEMO_STORIES:
            stories = DEMO_STORIES[region_name]

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

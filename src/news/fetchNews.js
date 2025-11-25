// src/news/fetchNews.js
// Triple-fallback RSS fetching for IantopiaOS
// Order: CORS.bridged.cc → thingproxy → direct
// 100% client-side, no backend, no paid APIs.

import { parseRSS } from "./parseRSS.js";

/* =====================================
   PROXY WRAPPERS
   ===================================== */

// Primary (fastest)
function wrapBridged(url) {
  return `https://cors.bridged.cc/${encodeURIComponent(url)}`;
}

// Secondary (most permissive)
function wrapThingProxy(url) {
  return `https://thingproxy.freeboard.io/fetch/${url}`;
}

// Tertiary (last resort — usually blocked by CORS)
function wrapDirect(url) {
  return url;
}

/* =====================================
   FEED LIST
   ===================================== */

const RSS_FEEDS = [
  // ---- Left ----
  {
    source: "The Guardian",
    bias: -2,
    url: "https://www.theguardian.com/us-news/rss"
  },
  {
    source: "HuffPost",
    bias: -2,
    url: "https://www.huffpost.com/section/politics/feed"
  },

  // ---- Center ----
  {
    source: "Reuters",
    bias: 0,
    url: "https://feeds.reuters.com/reuters/topNews"
  },
  {
    source: "AP News",
    bias: 0,
    url: "https://rsshub.app/apnews/topics/apf-topnews"
  },
  {
    source: "BBC World",
    bias: 0,
    url: "https://feeds.bbci.co.uk/news/world/rss.xml"
  },

  // ---- Right ----
  {
    source: "Fox News",
    bias: 2,
    url: "https://moxie.foxnews.com/google-publisher/politics.xml"
  },
  {
    source: "New York Post",
    bias: 2,
    url: "https://nypost.com/news/feed/"
  }
];

/* =====================================
   Attempt a fetch with fallback chain
   ===================================== */

async function tryFetch(urlVariants) {
  for (const variant of urlVariants) {
    try {
      const res = await fetch(variant);

      if (res.ok) {
        return res.text(); // success
      }

      console.warn("Fetch failed:", variant, res.status);
    } catch (err) {
      console.warn("Proxy error:", variant, err.message);
    }
  }

  return null; // all attempts failed
}

/* =====================================
   Fetch & parse a single feed
   ===================================== */

async function fetchSingleFeed(feed) {
  const { url, source, bias } = feed;

  // Build fallback chain
  const attempts = [
    wrapBridged(url),
    wrapThingProxy(url),
    wrapDirect(url)
  ];

  const xmlText = await tryFetch(attempts);

  if (!xmlText) {
    console.error(`❌ Completely failed: ${source}`);
    return [];
  }

  const parsed = parseRSS(xmlText);

  return parsed.map(item => ({
    ...item,
    source,
    sourceBias: bias
  }));
}

/* =====================================
   Fetch ALL feeds in parallel
   ===================================== */

export async function fetchAllNews(limit = 50) {
  try {
    const lists = await Promise.all(RSS_FEEDS.map(feed => fetchSingleFeed(feed)));

    const all = lists.flat();

    // Sort newest → oldest
    const sorted = all.sort((a, b) => {
      return (b.pubDate || 0) - (a.pubDate || 0);
    });

    return sorted.slice(0, limit);
  } catch (err) {
    console.error("fetchAllNews crashed:", err);
    return [];
  }
}

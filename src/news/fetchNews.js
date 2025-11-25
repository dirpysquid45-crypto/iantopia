// src/news/fetchNews.js
// CORS-safe RSS fetching using AllOrigins proxy
// Works entirely client-side with zero backend

import { parseRSS } from "./parseRSS.js";

/* =====================================
   AllOrigins free CORS proxy wrapper
   ===================================== */

function wrap(url) {
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}

/* =====================================
   FEED LIST (Left, Center, Right)
   ===================================== */

const RSS_FEEDS = [
  // ---- Left-leaning ----
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

  // ---- Center / Wire ----
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

  // ---- Right-leaning ----
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
   Fetch + Parse one feed
   ===================================== */

async function fetchSingleFeed(feed) {
  try {
    const proxied = wrap(feed.url);
    const res = await fetch(proxied);

    if (!res.ok) {
      console.warn(`Feed failed: ${feed.source}`, res.status);
      return [];
    }

    const xmlText = await res.text();
    const articles = parseRSS(xmlText);

    // Attach meta
    return articles.map(item => ({
      ...item,
      source: feed.source,
      sourceBias: feed.bias
    }));
  } catch (err) {
    console.error(`Error fetching ${feed.source}:`, err);
    return [];
  }
}

/* =====================================
   Fetch all feeds in parallel
   ===================================== */

export async function fetchAllNews(limit = 50) {
  try {
    // Fetch everything simultaneously
    const results = await Promise.all(RSS_FEEDS.map(feed => fetchSingleFeed(feed)));

    // Flatten
    const all = results.flat();

    // Sort newest → oldest
    const sorted = all.sort((a, b) => {
      return (b.pubDate || 0) - (a.pubDate || 0);
    });

    // Limit for performance
    return sorted.slice(0, limit);
  } catch (err) {
    console.error("fetchAllNews failed:", err);
    return [];
  }
}

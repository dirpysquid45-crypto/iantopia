// src/news/fetchNews.js
// Unified RSS fetcher for Iantopia OS — optimized + parallelized

import { parseRSS } from "./parseRSS.js";

/* ===============================
   1. MASTER FEED LIST
================================ */
export const FEEDS = [
  // ---- Left-leaning ----
  {
    id: "guardian",
    label: "The Guardian",
    bias: "left",
    url: "https://www.theguardian.com/us-news/rss"
  },
  {
    id: "huffpost",
    label: "HuffPost",
    bias: "left",
    url: "https://www.huffpost.com/section/politics/feed"
  },

  // ---- Center / wire services ----
  {
    id: "reuters",
    label: "Reuters",
    bias: "center",
    url: "https://feeds.reuters.com/reuters/topNews"
  },
  {
    id: "apnews",
    label: "Associated Press",
    bias: "center",
    url: "https://rsshub.app/apnews/topics/apf-topnews"
  },
  {
    id: "bbc",
    label: "BBC World",
    bias: "center",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml"
  },

  // ---- Right-leaning ----
  {
    id: "fox",
    label: "Fox News",
    bias: "right",
    url: "https://moxie.foxnews.com/google-publisher/politics.xml"
  },
  {
    id: "nypost",
    label: "New York Post",
    bias: "right",
    url: "https://nypost.com/news/feed/"
  }
];

/* ======================================
   2. Parallel Fetcher (10× Faster)
   - Uses Promise.allSettled()
   - Gracefully handles individual feed failure
====================================== */

async function fetchSingleFeed(feed) {
  try {
    const res = await fetch(feed.url);
    if (!res.ok) {
      console.error(`❌ Failed fetching ${feed.label}:`, res.status);
      return [];
    }

    const xmlText = await res.text();
    const parsed = parseRSS(xmlText, feed);

    // Attach source meta
    parsed.forEach(a => {
      a.source = feed.label;
      a.sourceBias = feed.bias;
    });

    return parsed;
  } catch (err) {
    console.error(`❌ Error fetching ${feed.label}:`, err);
    return [];
  }
}

/* ======================================
   3. Main fetch — massively faster
   -  All feeds load together
====================================== */

export async function fetchAllNews() {
  const results = await Promise.allSettled(
    FEEDS.map(feed => fetchSingleFeed(feed))
  );

  let allArticles = [];

  results.forEach(r => {
    if (r.status === "fulfilled") allArticles.push(...r.value);
  });

  // Sort newest → oldest
  allArticles.sort((a, b) => {
    return (b.pubDate?.getTime?.() || 0) - (a.pubDate?.getTime?.() || 0);
  });

  // Limit for performance
  return allArticles.slice(0, 60);
}


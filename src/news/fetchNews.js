// src/news/fetchNews.js
// Unified RSS fetcher for Iantopia OS News Engine

import { parseRSS } from "./parseRSS.js";

/* ===============================
   1. MASTER FEED LIST
   (bias labels will be used later)
   =============================== */

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
   2. Main fetcher
   - gracefully handles CORS errors
   - merges everything into one array
   ====================================== */

export async function fetchAllNews() {
  const allArticles = [];

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url);
      if (!res.ok) {
        console.error(`❌ Failed fetching ${feed.label}:`, res.status);
        continue;
      }

      const xmlText = await res.text();
      const parsedArticles = parseRSS(xmlText, feed);

      allArticles.push(...parsedArticles);
    } catch (err) {
      console.error(`❌ Error fetching ${feed.label}:`, err);
    }
  }

  // sort newest → oldest
  allArticles.sort((a, b) => {
    return (b.pubDate?.getTime?.() || 0) - (a.pubDate?.getTime?.() || 0);
  });

  // limit for speed + UI cleanliness
  return allArticles.slice(0, 50);
}

// src/news/fetchNews.js
import { parseRSS } from "./parseRSS.js";

const SOURCES = [
  { name: "Reuters", url: "https://feeds.reuters.com/reuters/topNews" },
  { name: "Associated Press", url: "https://rsshub.app/apnews/topics/apf-topnews" },
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" }
];

export async function fetchAllNews() {
  const results = [];

  for (const src of SOURCES) {
    try {
      const xml = await fetch(src.url).then(r => r.text());
      const parsed = parseRSS(xml);

      parsed.forEach(article => {
        article.source = src.name;
      });

      results.push(...parsed);
    } catch (err) {
      console.error("Error fetching", src.name, err);
    }
  }

  return results.slice(0, 30); // limit for speed
}

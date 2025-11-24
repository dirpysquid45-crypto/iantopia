// src/pages/news.js
// Main render function for News Engine
// Ties together RSS fetcher + parser + card renderer

import { fetchAllNews } from "../news/fetchNews.js";
import { renderNewsCard } from "../components/newsCard.js";

export async function render() {
  const view = document.getElementById("app-view");
  if (!view) return;

  view.innerHTML = `
    <h2>News Engine</h2>
    <p>Fetching latest headlines, analyzing sentiment + political bias…</p>
    <div id="news-loading" class="card">Loading news…</div>
    <div id="news-feed"></div>
  `;

  let articles = [];
  try {
    articles = await fetchAllNews();
  } catch (err) {
    console.error("❌ Error in fetchAllNews:", err);
  }

  const feed = document.getElementById("news-feed");
  const loading = document.getElementById("news-loading");

  if (loading) loading.remove();

  if (!articles.length) {
    feed.innerHTML = `<div class="card"><p>No articles found.</p></div>`;
    return;
  }

  feed.innerHTML = articles
    .map(article => renderNewsCard(article))
    .join("");
}

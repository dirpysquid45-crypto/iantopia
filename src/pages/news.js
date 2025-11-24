// src/pages/news.js
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
    console.error("News Engine fetch error:", err);
  }

  const loading = document.getElementById("news-loading");
  const feed = document.getElementById("news-feed");

  if (loading) loading.remove();

  if (!articles || articles.length === 0) {
    feed.innerHTML = `
      <div class="card">
        <p>No articles found.</p>
      </div>
    `;
    return;
  }

  feed.innerHTML = articles
    .map(a => renderNewsCard(a))
    .join("");
}

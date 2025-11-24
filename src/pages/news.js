// src/pages/news.js
import { fetchAllNews } from "../news/fetchNews.js";
import { scoreSentiment } from "../news/sentiment.js";
import { scoreBias } from "../news/biasModel.js";
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
    console.error("❌ Failed to fetch news:", err);
  }

  const feed = document.getElementById("news-feed");
  const loading = document.getElementById("news-loading");
  loading.remove();

  if (!articles.length) {
    feed.innerHTML = `<div class="card"><p>No articles available.</p></div>`;
    return;
  }

  // Render each article
  feed.innerHTML = articles.map(a => {
    const bias = scoreBias(a.title + " " + a.description);
    const sentiment = scoreSentiment(a.title + " " + a.description);

    return renderNewsCard({
      ...a,
      bias,
      sentiment
    });
  }).join("");
}

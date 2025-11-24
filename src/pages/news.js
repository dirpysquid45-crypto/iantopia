// src/pages/news.js
// Full News Engine page for Iantopia OS

import { fetchAllNews } from "../news/fetchNews.js";
import { scoreSentiment } from "../news/sentiment.js";
import { scoreBias } from "../news/biasModel.js";
import { renderNewsCard } from "../components/newsCard.js";

export async function render() {
  const view = document.getElementById("app-view");
  if (!view) return;

  /* ------------------------------
     Initial UI Skeleton
     ------------------------------ */
  view.innerHTML = `
    <h2>📰 News Engine</h2>
    <p style="color:#94a3b8; margin-bottom:18px;">
      Fetching world & political news… scoring bias & sentiment…
    </p>

    <div id="news-loading" style="
      padding:12px;
      background:#0f172a;
      border:1px solid #1e293b;
      border-radius:10px;
      margin-bottom:16px;
    ">
      Loading news feeds…
    </div>

    <div id="news-feed"></div>
  `;

  const feed = document.getElementById("news-feed");
  const loading = document.getElementById("news-loading");

  /* ------------------------------
     Fetch All RSS Articles
     ------------------------------ */
  let articles = [];
  try {
    articles = await fetchAllNews();
  } catch (err) {
    console.error("News fetch failed:", err);
    loading.innerHTML = `<p style="color:#ef4444;">Unable to load news.</p>`;
    return;
  }

  loading.remove();

  if (!articles.length) {
    feed.innerHTML = `
      <div style="padding:12px; background:#0f172a; border:1px solid #1e293b; border-radius:10px;">
        <p>No news found. Try again later.</p>
      </div>
    `;
    return;
  }

  /* ------------------------------
     Bias + Sentiment Processing
     ------------------------------ */
  const processed = articles.map(a => {
    const text = `${a.title} ${a.description || ""}`;

    return {
      ...a,
      bias: scoreBias(text),
      sentiment: scoreSentiment(text)
    };
  });

  /* ------------------------------
     Render All Cards
     ------------------------------ */
  feed.innerHTML = processed
    .map(article => renderNewsCard(article))
    .join("");

  /* ------------------------------
     Optional: Auto-scroll to top
     ------------------------------ */
  window.scrollTo({ top: 0, behavior: "smooth" });
}

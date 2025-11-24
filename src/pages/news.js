// src/pages/news.js
import { fetchAllNews } from "../news/fetchNews.js";
import { scoreSentiment } from "../news/sentiment.js";
import { scoreBias } from "../news/biasModel.js";

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
  } catch (e) {
    console.error("News fetch error:", e);
  }

  const feed = document.getElementById("news-feed");
  const loading = document.getElementById("news-loading");
  if (loading) loading.remove();

  if (!articles || !articles.length) {
    feed.innerHTML = `<div class="card"><p>No articles found.</p></div>`;
    return;
  }

  // Render news
  feed.innerHTML = articles.map(a => {
    const text = `${a.title} ${a.description || ""}`;
    const bias = scoreBias(text);
    const sentiment = scoreSentiment(text);

    return `
      <div class="card" style="margin-bottom:16px;">
        <h3>${a.title}</h3>
        <p>${a.description || ""}</p>
        <p><small>${a.source} — ${new Date(a.pubDate).toLocaleString()}</small></p>

        <div style="margin-top:10px;">
          <strong>Bias:</strong> ${bias.label} (${bias.score})<br/>
          <strong>Sentiment:</strong> ${sentiment.label} (${sentiment.score})
        </div>
      </div>
    `;
  }).join("");
}

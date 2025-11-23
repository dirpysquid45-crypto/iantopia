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
  } catch (err) {
    console.error("News Engine Error:", err);
  }

  const feed = document.getElementById("news-feed");
  const loading = document.getElementById("news-loading");
  if (loading) loading.remove();

  if (!articles || !articles.length) {
    feed.innerHTML = `<div class="card"><p>No articles found.</p></div>`;
    return;
  }

  feed.innerHTML = articles
    .map(a => {
      const bias = scoreBias(a.title + " " + (a.description || ""));
      const sentiment = scoreSentiment(a.title + " " + (a.description || ""));

      return `
        <div class="card" style="margin-bottom:16px;">
          <h3>${a.title}</h3>
          <p>${a.description || ""}</p>
          <p><small>${a.source || "Unknown Source"} — ${new Date(a.pubDate).toLocaleString()}</small></p>

          <div style="margin-top:10px;">
            <strong>Bias:</strong> ${bias.label} (${bias.score})<br>
            <strong>Sentiment:</strong> ${sentiment.label} (${sentiment.score})
          </div>
        </div>
      `;
    })
    .join("");
}

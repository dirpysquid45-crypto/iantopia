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

  const articles = await fetchAllNews();

  const feed = document.getElementById("news-feed");
  const loading = document.getElementById("news-loading");
  loading.remove();

  if (!articles.length) {
    feed.innerHTML = `<div class="card"><p>No articles found.</p></div>`;
    return;
  }

  // Process and render articles
  feed.innerHTML = articles.map(a => {
    const bias = scoreBias(a.title + " " + a.description);
    const sentiment = scoreSentiment(a.title + " " + a.description);

    return `
      <div class="card" style="margin-bottom:16px;">
        <h3>${a.title}</h3>
        <p>${a.description || ""}</p>
        <p><small>${a.source} — ${new Date(a.pubDate).toLocaleString()}</small></p>

        <div style="margin-top:10px;">
          <strong>Bias:</strong> ${bias.label} (${bias.score})
          <br>
          <strong>Sentiment:</strong> ${sentiment.label} (${sentiment.score})
        </div>

        <a href="${a.link}" target="_blank" style="color:#38bdf8; display:inline-block; margin-top:10px;">
          Read full article →
        </a>
      </div>
    `;
  }).join("");
}

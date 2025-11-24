// src/pages/news.js
// News Engine page — fetches RSS feeds and renders bias-aware cards

import { fetchAllNews } from "../news/fetchNews.js";
import { renderNewsCard } from "../components/newsCard.js";

/**
 * Render the News Engine page.
 * Router passes in `view`, but we also fall back to #app-view.
 */
export async function render(view) {
  const container = view || document.getElementById("app-view");
  if (!container) {
    console.error("News render: no #app-view container found");
    return;
  }

  // Initial skeleton
  container.innerHTML = `
    <h2>News Engine</h2>
    <p>Fetching latest headlines, analyzing sentiment + political bias…</p>

    <div id="news-loading" class="card">Loading news…</div>
    <div id="news-feed"></div>
  `;

  // Helper to safely get elements inside the current view
  const getFeedElements = () => {
    return {
      loadingEl: container.querySelector("#news-loading"),
      feedEl: container.querySelector("#news-feed"),
    };
  };

  let articles = [];

  try {
    // Fetch + normalize articles
    articles = await fetchAllNews();
  } catch (err) {
    console.error("News Engine fetch error:", err);
  }

  try {
    // Re-query elements AFTER the async work (user may have navigated)
    const { loadingEl, feedEl } = getFeedElements();

    // If user navigated away, abort quietly
    if (!feedEl) {
      console.warn("News render aborted: feed element no longer in DOM.");
      return;
    }

    if (loadingEl) loadingEl.remove();

    if (!articles || articles.length === 0) {
      feedEl.innerHTML = `
        <div class="card">
          <p>No articles found.</p>
        </div>
      `;
      return;
    }

    // Render article cards
    feedEl.innerHTML = articles.map(a => renderNewsCard(a)).join("");

  } catch (err) {
    console.error("News render DOM error:", err);

    // Fail gracefully instead of triggering router's Routing Error
    container.innerHTML = `
      <h2>News Engine</h2>
      <p>There was an error rendering the news feed.</p>
      <div class="card">
        <p>Please try reloading this page or checking again later.</p>
      </div>
    `;
  }
}


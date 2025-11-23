export function render(view) {
  const view = document.getElementById("app-view");
  if (!view) return;

  view.innerHTML = `
    <h2>News Engine</h2>
    <p>Here we'll display RSS headlines, bias scoring, and sentiment.</p>
    <p>Next steps: wire <code>src/news/fetchNews.js</code> and <code>parseRSS.js</code> to show real feeds.</p>
  `;
}

export function render(view) {
  const view = document.getElementById("app-view");
  if (!view) return;

  view.innerHTML = `
    <h2>Market View</h2>
    <p>Future: tickers, catalysts, volatility meter, and watchlists will live here.</p>
  `;
}

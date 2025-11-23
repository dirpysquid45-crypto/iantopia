export function render(view) {
  const view = document.getElementById("app-view");
  if (!view) return;

  view.innerHTML = `
    <h2>Dashboard</h2>
    <p>Welcome to the internal Iantopia OS engine.</p>
    <p>This will eventually show: recent catalysts, watchlist summaries, and news highlights.</p>
  `;
}

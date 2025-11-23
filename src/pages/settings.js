export function render() {
  const view = document.getElementById("app-view");
  if (!view) return;

  view.innerHTML = `
    <h2>Settings</h2>
    <p>Theme controls, PWA install tips, and app preferences will go here.</p>
  `;
}

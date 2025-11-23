export function render() {
  const view = document.getElementById("app-view");
  if (!view) return;

  view.innerHTML = `
    <h2>About Iantopia OS</h2>
    <p>This is the structured, modular engine behind Iantopia.</p>
    <p>It powers news analysis, bias detection, catalyst mapping, and more.</p>
  `;
}

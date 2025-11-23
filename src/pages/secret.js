export function render(view) {
  const view = document.getElementById("app-view");
  if (!view) return;

  view.innerHTML = `
    <h2>🜏 Quantum Room</h2>
    <p>You found the hidden dev chamber of Iantopia.</p>
    <p>Future idea: show debug metrics, internal logs, or experimental tools here.</p>
  `;
}

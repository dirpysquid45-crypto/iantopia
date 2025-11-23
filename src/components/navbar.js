// src/components/navbar.js
import { navigateTo } from "../router.js";

export function renderNavbar() {
  const nav = document.getElementById("os-nav");
  if (!nav) return;

  nav.innerHTML = `
    <div class="nav-inner">

      <div class="nav-header">
        <span class="nav-title">IANTOPIA OS</span>
      </div>

      <div class="nav-links">
        <button data-route="home">🏠 Home</button>
        <button data-route="market">📈 Market</button>
        <button data-route="news">📰 News</button>
        <button data-route="about">📘 About</button>
        <button data-route="settings">⚙️ Settings</button>
        <button data-route="secret">🔒 Secret</button>
      </div>

      <div class="nav-footer">
        <small>v0.1</small>
      </div>

    </div>
  `;

  // CLICK ROUTING
  nav.querySelectorAll("button[data-route]").forEach(btn => {
    btn.addEventListener("click", () => {
      const route = btn.getAttribute("data-route");
      navigateTo(route);
      highlightActive(route);
    });
  });

  // highlight active on load
  highlightActive(location.hash.replace("#","") || "home");
}

function highlightActive(route) {
  const nav = document.getElementById("os-nav");
  if (!nav) return;
  nav.querySelectorAll("button[data-route]").forEach(btn => {
    if (btn.getAttribute("data-route") === route)
      btn.classList.add("active");
    else
      btn.classList.remove("active");
  });
}

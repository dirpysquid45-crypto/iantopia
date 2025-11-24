// src/app.js
// Main bootloader for Iantopia OS (Engine Mode)

import { initRouter, navigateTo } from "./router.js";
import { renderNavbar } from "./components/navbar.js";

function setupNav() {
  const buttons = document.querySelectorAll(".nav-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route || "home";

      // Navigate
      navigateTo(route);

      // Update active state
      buttons.forEach(b => b.classList.toggle("active", b === btn));
    });
  });
}

export function initApp() {
  // Insert sidebar/navbar HTML
  renderNavbar();

  // Bind click handlers (important!)
  setupNav();

  // Start router
  initRouter();
}

// Auto-start
window.addEventListener("DOMContentLoaded", initApp);

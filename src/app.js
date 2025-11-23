// src/app.js
// Main bootloader for Iantopia OS (Engine Mode)
// Clean, modular architecture — sidebar + router boot

import { initRouter } from "./router.js";
import { renderNavbar } from "./components/navbar.js";

export function initApp() {
  // Insert navbar/sidebar HTML into engine.html
  renderNavbar();

  // Boot the client-side router
  initRouter();
}

// Start automatically when DOM is ready
window.addEventListener("DOMContentLoaded", initApp);

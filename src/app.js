// placeholder// src/app.js
// Main bootloader for Iantopia OS (Engine Mode)

import { initRouter, navigateTo } from "./router.js";

function setupNav() {
  const buttons = document.querySelectorAll(".nav-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route || "home";
      navigateTo(route);
      buttons.forEach(b => b.classList.toggle("active", b === btn));
    });
  });

  // mark "home" active by default
  const homeBtn = document.querySelector('.nav-btn[data-route="home"]');
  if (homeBtn) homeBtn.classList.add("active");
}

export function startApp() {
  const view = document.getElementById("app-view");
  if (!view) {
    console.error("No #app-view element found in engine.html");
    return;
  }

  setupNav();
  initRouter();
}

// auto-start
window.addEventListener("DOMContentLoaded", startApp);

// src/router.js
// Hash-based router for Iantopia OS (fixed + improved)

const routes = {
  home:     () => import("./pages/home.js"),
  news:     () => import("./pages/news.js"),
  market:   () => import("./pages/market.js"),
  settings: () => import("./pages/settings.js"),
  about:    () => import("./pages/about.js"),
  secret:   () => import("./pages/secret.js"),
};

function getCurrentRoute() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "home";
}

export function navigateTo(route) {
  if (!routes[route]) route = "home";
  window.location.hash = route;
}

export function initRouter() {
  async function handleRouteChange() {
    const view = document.getElementById("app-view");
    if (!view) {
      console.error("❌ No #app-view container found in engine.html");
      return;
    }

    const route = getCurrentRoute();
    const loader = routes[route] || routes.home;

    try {
      const module = await loader();

      if (typeof module.render === "function") {
        module.render(view);       // ← PASS THE VIEW
      } else {
        console.error(`❌ Route "${route}" has no render() export.`);
        view.innerHTML = `
          <h2>Missing render()</h2>
          <p>The page module for <code>${route}</code> does not export <code>render()</code>.</p>
        `;
      }
    } catch (err) {
      console.error("❌ Router error:", err);
      view.innerHTML = `
        <h2>Routing Error</h2>
        <p>Could not load <code>${route}</code>.</p>
      `;
    }
  }

  window.addEventListener("hashchange", handleRouteChange);
  handleRouteChange(); // Initial load
}

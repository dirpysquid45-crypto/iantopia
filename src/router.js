// src/router.js
// Lightweight hash-based router for Iantopia OS

const routes = {
  home:   () => import("./pages/home.js"),
  news:   () => import("./pages/news.js"),
  market: () => import("./pages/market.js"),
  settings: () => import("./pages/settings.js"),
  about:  () => import("./pages/about.js"),
  secret: () => import("./pages/secret.js"),
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
    const route = getCurrentRoute();
    const loader = routes[route] || routes.home;

    try {
      const module = await loader();
      if (typeof module.render === "function") {
        module.render();
      } else {
        console.error(`Route "${route}" loaded but no render() exported`);
      }
    } catch (err) {
      console.error("Error loading route:", route, err);
      const view = document.getElementById("app-view");
      if (view) {
        view.innerHTML = `
          <h2>Routing Error</h2>
          <p>Could not load the page for <code>${route}</code>.</p>
        `;
      }
    }
  }

  window.addEventListener("hashchange", handleRouteChange);
  handleRouteChange(); // initial load
}

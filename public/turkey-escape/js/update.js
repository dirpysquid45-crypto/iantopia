// Fun Shed kit v1.4
// Keeping the installed game up to date. The title screen shows the version, asks the site whether a
// newer release is out, and offers a button that fetches it.
import { VERSION } from "./version.js";
import { installed } from "./install.js";

// → true when the site has a newer release than this copy, false when it doesn't, null when it
// could not be asked (no signal, or running on this computer).
export async function checkForUpdate() {
  if (VERSION === "dev") return null;
  try {
    // &app=1 when playing from the home screen: funshed counts those from the site's logs. It's the only
    // thing the game tells anyone, and nothing in it says who is playing.
    const app = installed() ? "&app=1" : "";
    const res = await fetch(`version.json?t=${Date.now()}${app}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).version !== VERSION;
  } catch {
    return null;
  }
}

// Throws away the stored copy of the game and reloads it from the site. The reload brings the new
// release, which then stores itself again for offline play.
export async function update() {
  try {
    // Scoped to this game only: the same origin also hosts the Iantopia site,
    // whose own service worker and caches must survive an update here.
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.filter((r) => r.scope.includes('/turkey-escape/')).map((r) => r.unregister()));
    await Promise.all((await caches.keys()).filter((k) => k.startsWith('turkey')).map((k) => caches.delete(k)));
  } catch {
    // Nothing stored, or the browser refused: the reload below still asks the site.
  }
  location.reload();
}

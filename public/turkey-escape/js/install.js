// Fun Shed kit v1.4
// The "install me" hint on the title screen, for phones playing in a browser tab.
// Chrome on Android can install the game itself, so its hint is a tappable button. Every other phone
// gets a small "how to install" link to the Shed's install page, which keeps the steps for each phone.
const INSTALL_PAGE = "https://thefunshed.com/install";
let promptEvent = null;
let changed = () => {};

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // keep Chrome's own bar away; the title screen offers it instead
  promptEvent = e;
  changed();
});
window.addEventListener("appinstalled", () => {
  promptEvent = null;
  changed();
});

export function installed() {
  return matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true;
}

// → { words, tap } or { words, link } for the title screen, or null when there's nothing to say
// (installed, or a computer).
export function installHint() {
  if (installed()) return null;
  if (promptEvent) return { words: "📲 TAP HERE TO INSTALL THE GAME", tap: true };
  if (/iPhone|iPad|iPod|Android/.test(navigator.userAgent) || navigator.maxTouchPoints > 1) return { words: "📲 how to install", link: INSTALL_PAGE };
  return null;
}

// Shows Chrome's install question. Must run from a tap.
export async function install() {
  if (!promptEvent) return;
  const event = promptEvent;
  promptEvent = null;
  await event.prompt();
  changed();
}

// Lets the title screen redraw its hint when Chrome decides the game can be installed.
export function onHintChange(fn) {
  changed = fn;
}

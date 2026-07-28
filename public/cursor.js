// cursor.js — canvas custom cursor, skinnable via cursor-library.js
//
// The active skin is read from localStorage and can be swapped live (the
// homepage cursor picker dispatches 'cursor:changed'). Skins are either
// image-based or emoji-based; see cursor-library.js.
//
// Requires cursor-library.js to be loaded first. If it is missing we fall back
// to the built-in Smiski paths so the cursor never simply disappears.
if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
const ACTIVE_CURSOR_KEY = 'active_cursor_v1';
const FALLBACK = { label: 'Smiski', point: '/Smiski-cursor.png', interact: '/Smiski-interact.png' };
const SIZE = 34;

const canvas = document.createElement('canvas');
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.pointerEvents = 'none';
canvas.style.zIndex = '9999';
document.body.appendChild(canvas);

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const ctx = canvas.getContext('2d');
let mouseX = 0, mouseY = 0;
let isHovering = false;
let running = false;

// Current skin, resolved from the library. `ready` gates drawing so a
// half-loaded image swap never blanks the cursor mid-move.
let skin = { emoji: null, point: null, interact: null, ready: false };

function resolveEntry(key) {
  const lib = window.CURSOR_LIBRARY;
  if (!lib) return FALLBACK;
  return lib[key] || lib.default || FALLBACK;
}

function getActiveKey() {
  let key = null;
  try { key = localStorage.getItem(ACTIVE_CURSOR_KEY); } catch {}
  const lib = window.CURSOR_LIBRARY;
  // Unknown or unset key falls back to default rather than leaving the user
  // with no cursor — e.g. a skin removed from the library after being equipped.
  return (key && lib && lib[key]) ? key : 'default';
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function applySkin(key) {
  const entry = resolveEntry(key);

  if (entry.emoji) {
    skin = { emoji: entry.emoji, point: null, interact: null, ready: true };
    start();
    return;
  }

  const [point, interact] = await Promise.all([
    loadImage(entry.point),
    loadImage(entry.interact),
  ]);

  if (!point) {
    // The skin's art is missing. Rather than render nothing, hand the real
    // system cursor back so the page stays usable.
    console.error(`[cursor] skin "${key}" failed to load (${entry.point}); reverting to system cursor.`);
    document.body.style.cursor = 'auto';
    skin.ready = false;
    return;
  }

  skin = { emoji: null, point, interact, ready: true };
  start();
}

function start() {
  document.body.style.cursor = 'none';
  if (running) return;
  running = true;
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!skin.ready) return;

  if (skin.emoji) {
    ctx.font = `${SIZE - 6}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(skin.emoji, mouseX, mouseY);
    return;
  }

  const active = (isHovering && skin.interact) ? skin.interact : skin.point;
  if (active) ctx.drawImage(active, mouseX - SIZE / 2, mouseY - SIZE / 2, SIZE, SIZE);
}

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Swap to the interact pose (and glow) over clickable elements.
// Using .closest() (not a tagName check on e.target directly) so hovering
// a child element inside a button/link -- e.g. an icon or label span --
// still resolves to the same interactive ancestor instead of flickering
// back to the point pose every time the mouse crosses onto nested content.
const INTERACTIVE_SELECTOR = 'a, button, [role="button"]';

document.addEventListener('mouseover', (e) => {
  if (e.target.closest && e.target.closest(INTERACTIVE_SELECTOR)) {
    isHovering = true;
    canvas.style.filter = 'brightness(1.5) drop-shadow(0 0 6px rgba(255, 235, 59, 0.9))';
  }
}, true);

document.addEventListener('mouseout', (e) => {
  const movingWithinInteractive = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(INTERACTIVE_SELECTOR);
  if (!movingWithinInteractive) {
    isHovering = false;
    canvas.style.filter = 'brightness(1)';
  }
}, true);

// Live switching: the picker writes localStorage then fires this.
window.addEventListener('cursor:changed', () => applySkin(getActiveKey()));

applySkin(getActiveKey());
}

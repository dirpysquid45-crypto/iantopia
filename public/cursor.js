if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
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

let pointImage = null, pointLoaded = false;
let interactImage = null, interactLoaded = false;

function tryStart() {
  if (!pointLoaded) return;
  document.body.style.cursor = 'none';
  animate();
}

// Point pose: default cursor
const img = new Image();
img.src = '/Smiski-cursor.png';
img.onload = () => {
  pointImage = img;
  pointLoaded = true;
  tryStart();
};
img.onerror = () => {
  console.error('Cursor image failed to load, reverting to default');
  document.body.style.cursor = 'auto';
};

// Interact pose: shown while hovering clickable elements
const interactImg = new Image();
interactImg.src = '/Smiski-interact.png';
interactImg.onload = () => {
  interactImage = interactImg;
  interactLoaded = true;
};
interactImg.onerror = () => {
  console.error('Interact cursor image failed to load, falling back to point pose');
};

function animate() {
  if (!pointLoaded) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const active = (isHovering && interactLoaded) ? interactImage : pointImage;
  if (active) {
    ctx.drawImage(active, mouseX - 17, mouseY - 17, 34, 34);
  }
  requestAnimationFrame(animate);
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
}

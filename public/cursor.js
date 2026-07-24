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
let cursorImage = null;
let isLoaded = false;

// Load optimized Smiski cursor image (32x32 @ 852B)
const img = new Image();
img.src = '/Smiski-cursor.png';
img.onload = () => {
  cursorImage = img;
  isLoaded = true;
  document.body.style.cursor = 'none';
  animate();
};
img.onerror = () => {
  console.error('Cursor image failed to load, reverting to default');
  document.body.style.cursor = 'auto';
};

function animate() {
  if (!isLoaded) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (cursorImage) {
    ctx.drawImage(cursorImage, mouseX - 12, mouseY - 12, 24, 24);
  }
  requestAnimationFrame(animate);
}

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Brighten cursor over clickable elements
document.addEventListener('mouseover', (e) => {
  const el = e.target;
  if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.closest('[role="button"]')) {
    canvas.style.filter = 'brightness(1.5) drop-shadow(0 0 6px rgba(255, 235, 59, 0.9))';
  }
}, true);

document.addEventListener('mouseout', () => {
  canvas.style.filter = 'brightness(1)';
}, true);

// Fun Shed kit v1.4
// One-finger input for every screen: taps (for the buttons) and swipes (shortcuts, and the play itself).
// Touches in the first lockMs of a screen are ignored, so the tap that ended the last
// screen does not also act on this one.
import * as audio from "./audio.js";
import { fingerAt } from "./ui.js";

// A finger's path → "up" | "down" | "left" | "right" | "tap" | null. Points are { x, y, t }.
export function readSwipe(points) {
  if (points.length === 0) return null;
  const a = points[0];
  const b = points.at(-1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 30) return b.t - a.t < 600 ? "tap" : null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function listenForGestures(scene, { onSwipe, onTap, lockMs = 500 }) {
  const openAt = performance.now() + lockMs;
  let id = null;
  let path = [];
  const point = (p) => fingerAt(scene, p);
  scene.input.on("pointerdown", (p) => {
    audio.unlock();
    if (performance.now() < openAt || id !== null) return;
    id = p.id;
    path = [point(p)];
  });
  scene.input.on("pointermove", (p) => {
    if (p.id === id) path.push(point(p));
  });
  const up = (p) => {
    audio.unlock(); // phones only allow sound once a touch has ended, so try again here
    if (p.id !== id) return;
    id = null;
    const end = point(p);
    path.push(end);
    const gesture = readSwipe(path);
    if (gesture === "tap") onTap?.(end.x, end.y);
    else if (gesture) onSwipe?.(gesture);
  };
  scene.input.on("pointerup", up);
  scene.input.on("pointerupoutside", up);
}

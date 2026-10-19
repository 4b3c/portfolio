// The screen's size, and the camera: the world's pixel at the top-left of the
// screen. It eases after the player, so walking feels smooth.
import { WORLD_W, WORLD_H, CAMERA_EASE } from './config.js';
import { clamp } from './util.js';
import { canvas, dpr } from './dom.js';

export const view = { w: 0, h: 0 };
export const cam = { x: 0, y: 0, snap: true };   // snap: jump straight there next frame, no easing

export function resize() {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = view.w * dpr;
  canvas.height = view.h * dpr;
  canvas.style.width = view.w + 'px';
  canvas.style.height = view.h + 'px';
}

export function follow(player, dt) {
  const tx = clamp(player.x - view.w / 2, 0, Math.max(WORLD_W - view.w, 0));
  const ty = clamp(player.y - view.h / 2, 0, Math.max(WORLD_H - view.h, 0));
  const ease = cam.snap ? 1 : 1 - Math.exp(-dt * CAMERA_EASE);
  cam.x += (tx - cam.x) * ease;
  cam.y += (ty - cam.y) * ease;
  cam.snap = false;
}

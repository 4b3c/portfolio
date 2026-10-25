// The screen's size, and the camera: the pixel at the top-left of the screen,
// in isometric screen pixels (iso.js), not world ones. It eases after the
// player, so walking feels smooth.
import { WORLD_W, WORLD_H, CAMERA_EASE, SKY } from './config.js';
import { clamp } from './util.js';
import { canvas, dpr } from './dom.js';
import { toScreen } from './iso.js';

export const view = { w: 0, h: 0 };
// How far down the screen you're kept: the middle, but lower on touch screens,
// where the card opens up top and the D-pad takes the bottom.
const FOCUS_Y = window.matchMedia('(pointer: coarse)').matches ? 0.62 : 0.5;
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
  // The world is a diamond on screen: its left corner is at x = -WORLD_H, its
  // right at WORLD_W, its top at y = 0 and its bottom halfway down both, with
  // the slab's earth edge just under that (ground.js).
  const p = toScreen(player.x, player.y);
  const tx = clamp(p.x - view.w / 2, -WORLD_H, Math.max(WORLD_W - view.w, -WORLD_H));
  const ty = clamp(p.y - view.h * FOCUS_Y, -SKY, Math.max((WORLD_W + WORLD_H) / 2 + 32 - view.h, -SKY));
  const ease = cam.snap ? 1 : 1 - Math.exp(-dt * CAMERA_EASE);
  cam.x += (tx - cam.x) * ease;
  cam.y += (ty - cam.y) * ease;
  cam.snap = false;
}

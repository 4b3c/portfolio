// Going in or out of the cabin fades to black, swaps scenes, and fades back.
import { FADE_S } from './config.js';
import { ctx } from './dom.js';
import { view } from './camera.js';

let fade = 0;
let then = null;                       // what to do once it's black

// fade out, call `swap` once it's black, then fade back in
export const fadeTo = (swap) => { if (!then) then = swap; };
export const fading = () => Boolean(then);

// run each frame, after drawing the scene
export function drawFade(dt) {
  if (then) {
    fade = Math.min(1, fade + dt / FADE_S);
    if (fade === 1) { then(); then = null; }
  } else {
    fade = Math.max(0, fade - dt / FADE_S);
  }
  if (fade) {
    ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

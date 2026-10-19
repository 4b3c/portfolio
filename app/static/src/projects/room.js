// Inside the cabin: a replica of my high school room, in isometric (see
// CABIN_ROOM in config.js). Inside, player.x and player.y are floor
// coordinates (u, v), in screen pixels. Each piece of furniture keeps you off
// its footprint (`blocks`, floor art pixels: u0, v0, u1, v1), and shows its
// card when you're right up against it (cards.js).
import { PIXEL, PALETTES, CABIN_ROOM, ABOUT } from './config.js';
import { clamp } from './util.js';
import { ctx, dpr } from './dom.js';
import { view } from './camera.js';
import { sprites } from './assets.js';
import { player } from './player.js';
import { drawPlayer } from './draw.js';

// once the sprites have loaded
export function makeRoom() {
  return {
    floor: sprites.room,
    front: sprites['room-front'],      // the low front walls, always in front of you
    w: sprites.room.width * PIXEL,
    h: sprites.room.height * PIXEL,
    furniture: [
      // laid out like my real room: the desk in the corner with its shelf
      // above it, then on the other wall the window, and the bed's headboard
      { sprite: sprites.bed, blocks: [0, 37, 27, 53], card: ABOUT.room },
      { sprite: sprites.desk, blocks: [0, 0, 36, 13], card: ABOUT.pc },
      { sprite: sprites.bookshelf, blocks: [40, 0, 48, 6], card: ABOUT.bio },
    ],
  };
}

// where floor spot (u, v), in screen pixels, lands in the room's layers
const roomAt = (u, v) => ({
  x: CABIN_ROOM.origin[0] * PIXEL + u - v,
  y: CABIN_ROOM.origin[1] * PIXEL + (u + v) / 2,
});

// The room in the middle of the screen, or following you if the screen is
// smaller than it. Each piece of furniture is drawn over you if you're behind
// it (back of its far edges, along both walls), and under you otherwise.
export function drawRoom(room) {
  const { w, h } = view;
  const at = roomAt(player.x, player.y);
  const offset = (screen, size, to) => (screen >= size ? (screen - size) / 2 : clamp(screen / 2 - to, screen - size, 0));
  const ox = Math.round(offset(w, room.w, at.x));
  const oy = Math.round(offset(h, room.h, at.y));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1d1612';
  ctx.fillRect(0, 0, w, h);
  const layer = (sprite) => ctx.drawImage(sprite, ox, oy, room.w, room.h);
  layer(room.floor);

  const pu = player.x / PIXEL, pv = player.y / PIXEL;
  const behind = (f) => pu < f.blocks[2] && pv < f.blocks[3];
  for (const f of room.furniture) if (!behind(f)) layer(f.sprite);
  const px = Math.round((ox + at.x) * dpr) / dpr;
  const py = Math.round((oy + at.y) * dpr) / dpr;
  ctx.globalAlpha = PALETTES.green.shadow_color[3] / 255;
  ctx.fillStyle = '#000';
  [4, 6, 4].forEach((wide, i) => ctx.fillRect(px - (wide / 2) * PIXEL, py + (i - 2) * PIXEL + 4, wide * PIXEL, PIXEL));
  ctx.globalAlpha = 1;
  drawPlayer(px, py);
  for (const f of room.furniture) if (behind(f)) layer(f.sprite);
  layer(room.front);
}

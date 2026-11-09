// The ground: an island of grass with the trails and clearings on top, and
// the sea all round it. It's painted once, when the page loads, as one
// isometric picture with a canvas pixel per art pixel, then copied onto the
// screen every frame. Each art pixel of it looks up the spot on the ground
// under it (iso.js), so the tiles come out as diamonds with crisp 2:1 pixel
// edges, not top-down art turned 45°. The island is a slab, like the room
// inside the cabin: below its shore, where it faces you, there's a cliff of
// earth down to the water.
import { PIXEL, TILE, COLS, ROWS, WORLD_W, WORLD_H, MATERIALS, MAT_NAMES, at, inWorld } from './config.js';
import { hashXY, randint, rgba } from './util.js';
import { ctx } from './dom.js';
import { toWorld } from './iso.js';
import { view } from './camera.js';
import { sprites } from './assets.js';

const N = TILE / PIXEL;                       // art pixels across a tile, on the ground
const GRASS = [130, 170, 70];
const GRASS_DARK = [124, 163, 66];            // every other tile, so the diamonds read
const RIM = [104, 140, 56];                   // grass along the far shore, where the sea's behind it
// the cliff, top down, in art pixels: a lip of grass, then earth
const EARTH = [[104, 140, 56], [126, 92, 58], [112, 80, 50], [126, 92, 58], [112, 80, 50], [98, 68, 42]];
const SIDE = EARTH.length;
// The sea: deep, then lighter over the tiles beside the island, with ripples,
// and foam where it meets the cliff.
const DEEP = [56, 104, 146];
const SHALLOW = [[78, 138, 172], [66, 120, 160]];   // one tile out, two
const RIPPLE = [120, 178, 204];
const FOAM = [214, 236, 240];
const SEA = `rgb(${DEEP.join(', ')})`;     // past the edge of the picture too

let ground;                                   // the painted ground; its (0, 0) is screen (-WORLD_H, 0)

export function initGround(world) {
  const { material, isLand } = world;
  const textures = MAT_NAMES.map((mat) => pixelsOf(sprites[MATERIALS[mat].sprite]));
  const isTrail = (c, r) => inWorld(c, r) && material[at(c, r)] !== -1;

  // Same weighting as TileWorld's `grasses` list: tile i gets i // 2 + 1 tickets.
  const tickets = [];
  for (let i = 0; i < 7; i++) for (let k = 0; k <= Math.floor(i / 2); k++) tickets.push(i);
  const grassTile = new Uint8Array(COLS * ROWS).map(() => tickets[randint(0, tickets.length - 1)]);

  // The colour of the ground at world art pixel (wx, wy), or null for grass.
  // Trail edges go ragged wherever a trail meets grass.
  function trailAt(wx, wy) {
    const c = Math.floor(wx / N), r = Math.floor(wy / N);
    const m = material[at(c, r)];
    if (m === -1) return null;
    const x = wx - c * N, y = wy - r * N;
    // how many art pixels to the nearest grass edge
    const edge = Math.min(
      isTrail(c, r - 1) ? N : y, isTrail(c, r + 1) ? N : N - 1 - y,
      isTrail(c - 1, r) ? N : x, isTrail(c + 1, r) ? N : N - 1 - x
    );
    const roll = hashXY(wx + 9001, wy);
    if (edge === 0) return roll < 0.55 ? null : rgba(MATERIALS[MAT_NAMES[m]].edge);
    if (edge === 1 && roll < 0.35) return rgba(MATERIALS[MAT_NAMES[m]].edge);
    // the texture repeats across the world, so neighbouring tiles line up
    const tex = textures[m];
    const t = ((wy % tex.height) * tex.width + (wx % tex.width)) * 4;
    return tex.data.subarray(t, t + 4);
  }
  const grassAt = (wx, wy) => {
    const tint = (Math.floor(wx / N) + Math.floor(wy / N)) % 2 ? GRASS_DARK : GRASS;
    return hashXY(wx, wy + 77) < 0.04 ? tint.map((v) => v - 8) : tint;
  };

  // How many tiles out to sea each tile is: 0 on land, 1 beside it, then 2, 3 (or more).
  const out = new Uint8Array(COLS * ROWS).fill(3);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (isLand(c, r)) { out[at(c, r)] = 0; continue; }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (isLand(c + dc, r + dr)) out[at(c, r)] = Math.min(out[at(c, r)], Math.max(Math.abs(dc), Math.abs(dr)));
        }
      }
    }
  }
  const tileAt = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];
  const landAt = (x, y) => isLand(...tileAt(x, y));

  const w = (WORLD_W + WORLD_H) / PIXEL;
  const h = (WORLD_W + WORLD_H) / 2 / PIXEL + SIDE + 1;
  const img = new ImageData(w, h);
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      // the middle of this art pixel on screen, and the spot on the ground under it
      const p = toWorld(-WORLD_H + (gx + 0.5) * PIXEL, (gy + 0.5) * PIXEL);
      let colour;
      if (landAt(p.x, p.y)) {
        const wx = Math.floor(p.x / PIXEL), wy = Math.floor(p.y / PIXEL);
        colour = trailAt(wx, wy) || (landAt(p.x - PIXEL, p.y - PIXEL) ? grassAt(wx, wy) : RIM);
      } else {
        // Out at sea. Going up the screen by an art pixel goes back (-PIXEL,
        // -PIXEL) on the ground, so if there's land k art pixels up, this is
        // the cliff below its shore, k - 1 pixels down it; just past the
        // bottom, foam.
        let k = 1;
        while (k <= SIDE + 1 && !landAt(p.x - k * PIXEL, p.y - k * PIXEL)) k++;
        if (k <= SIDE) {
          colour = EARTH[k - 1];
          // The face looking down-right (+x) is in shadow, the one looking
          // down-left in the light: which edge of the land's tile did we cross?
          if (k > 1 && !landAt(p.x, p.y - k * PIXEL)) colour = colour.map((v) => v * 0.82);
        } else if (k === SIDE + 1) {
          colour = hashXY(gx, gy) < 0.6 ? FOAM : RIPPLE;
        } else {
          const [c, r] = tileAt(p.x, p.y);
          const far = inWorld(c, r) ? out[at(c, r)] : 3;
          colour = far === 3 ? DEEP : SHALLOW[far - 1];
          // little ripples, a few pixels wide, across the screen
          if (hashXY(Math.floor(gx / 3), gy) < 0.025) colour = RIPPLE;
        }
      }
      img.data.set(rgba(colour), (gy * w + gx) * 4);
    }
  }

  // Grass tufts and flowers, from grass.png: they stand up off the ground, so
  // each is stamped upright with its foot where it grows, front ones last.
  const stamps = tuftsOf(sprites.grass);
  const planted = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isLand(c, r) || material[at(c, r)] !== -1) continue;
      for (const tuft of stamps[grassTile[at(c, r)]]) {
        const wx = c * N + tuft.x, wy = r * N + tuft.y;
        planted.push({ gx: wx - wy + WORLD_H / PIXEL, gy: Math.floor((wx + wy) / 2), tuft });
      }
    }
  }
  planted.sort((a, b) => a.gy - b.gy);
  for (const { gx, gy, tuft } of planted) {
    for (const [dx, dy, colour] of tuft.pixels) {
      const x = gx + dx, y = gy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) img.data.set(colour, (y * w + x) * 4);
    }
  }

  ground = document.createElement('canvas');
  ground.width = w;
  ground.height = h;
  ground.getContext('2d').putImageData(img, 0, 0);
}

// an image's raw pixels, to copy from
function pixelsOf(image) {
  const scratch = document.createElement('canvas');
  scratch.width = image.naturalWidth;
  scratch.height = image.naturalHeight;
  const scratchCtx = scratch.getContext('2d');
  scratchCtx.drawImage(image, 0, 0);
  return scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
}

// grass.png is a row of top-down tiles, N art pixels square, drawn at PIXEL
// screen pixels per art pixel. For each tile, the bits that aren't plain
// grass, split into tufts (pixels touching each other): each one's foot (its
// bottom middle, x and y in the tile) and its pixels relative to that.
function tuftsOf(image) {
  const px = pixelsOf(image);
  const colourAt = (x, y) => px.data.subarray(((y * PIXEL) * px.width + x * PIXEL) * 4, ((y * PIXEL) * px.width + x * PIXEL) * 4 + 4);
  const plain = colourAt(0, 0).join();
  const tiles = [];
  for (let t = 0; t < px.width / PIXEL / N; t++) {
    const seen = new Set();
    const tufts = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const key = y * N + x;
        if (seen.has(key) || colourAt(t * N + x, y).join() === plain) continue;
        // flood out to every pixel touching this one, corners included
        const pixels = [], todo = [[x, y]];
        seen.add(key);
        while (todo.length) {
          const [ax, ay] = todo.pop();
          pixels.push([ax, ay, colourAt(t * N + ax, ay)]);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const bx = ax + dx, by = ay + dy, k = by * N + bx;
              if (bx < 0 || by < 0 || bx >= N || by >= N || seen.has(k)) continue;
              if (colourAt(t * N + bx, by).join() === plain) continue;
              seen.add(k);
              todo.push([bx, by]);
            }
          }
        }
        const footY = Math.max(...pixels.map((p) => p[1]));
        const footX = Math.round(pixels.reduce((s, p) => s + p[0], 0) / pixels.length);
        tufts.push({ x: footX, y: footY, pixels: pixels.map(([ax, ay, colour]) => [ax - footX, ay - footY, colour]) });
      }
    }
    tiles.push(tufts);
  }
  return tiles;
}

// the ground on screen, with the camera at (cx, cy)
export function drawGround(cx, cy) {
  ctx.fillStyle = SEA;
  ctx.fillRect(0, 0, view.w, view.h);
  // just the part of it on screen
  const x0 = Math.max(0, Math.floor((cx + WORLD_H) / PIXEL)), y0 = Math.max(0, Math.floor(cy / PIXEL));
  const x1 = Math.min(ground.width, Math.ceil((cx + WORLD_H + view.w) / PIXEL) + 1);
  const y1 = Math.min(ground.height, Math.ceil((cy + view.h) / PIXEL) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.drawImage(ground, x0, y0, x1 - x0, y1 - y0,
    x0 * PIXEL - WORLD_H - cx, y0 * PIXEL - cy, (x1 - x0) * PIXEL, (y1 - y0) * PIXEL);
}

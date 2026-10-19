// The ground: grass tiles everywhere, with the trails and clearings on top.
import { PIXEL, TILE, COLS, ROWS, MATERIALS, MAT_NAMES, toCanvas, at, inWorld } from './config.js';
import { hashXY, randint, rgba } from './util.js';
import { ctx } from './dom.js';
import { view } from './camera.js';
import { grass, sprites } from './assets.js';

let material;                // world.material: which trail is on each tile, or -1
let textures;                // each material's texture as raw pixels, to copy from
let grassTile;               // which of grass.png's tiles goes on each tile
const trailCanvases = new Map();

export function initGround(world) {
  material = world.material;
  textures = MAT_NAMES.map((mat) => {
    const img = sprites[MATERIALS[mat].sprite];
    const scratch = document.createElement('canvas');
    scratch.width = img.naturalWidth;
    scratch.height = img.naturalHeight;
    const scratchCtx = scratch.getContext('2d');
    scratchCtx.drawImage(img, 0, 0);
    return scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  });
  // Same weighting as TileWorld's `grasses` list: tile i gets i // 2 + 1 tickets.
  const tickets = [];
  for (let i = 0; i < 7; i++) for (let k = 0; k <= Math.floor(i / 2); k++) tickets.push(i);
  grassTile = new Uint8Array(COLS * ROWS).map(() => tickets[randint(0, tickets.length - 1)]);
}

// --- path tiles -----------------------------------------------------------
// Drawn once per tile and cached. Edges go ragged wherever a trail meets
// grass, letting the grass tile underneath show through.
const isTrail = (c, r) => inWorld(c, r) && material[at(c, r)] !== -1;
function trailTile(c, r) {
  const key = at(c, r);
  if (trailCanvases.has(key)) return trailCanvases.get(key);
  const mat = MAT_NAMES[material[key]];
  const texture = textures[material[key]];
  const n = TILE / PIXEL;
  const img = new ImageData(n, n);
  const grassUp = !isTrail(c, r - 1), grassDown = !isTrail(c, r + 1);
  const grassLeft = !isTrail(c - 1, r), grassRight = !isTrail(c + 1, r);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const wx = c * n + x, wy = r * n + y;
      // how many art pixels to the nearest grass edge
      const edge = Math.min(
        grassUp ? y : n, grassDown ? n - 1 - y : n,
        grassLeft ? x : n, grassRight ? n - 1 - x : n
      );
      const roll = hashXY(wx + 9001, wy);
      // the texture repeats across the world, so neighbouring tiles line up
      const t = ((wy % texture.height) * texture.width + (wx % texture.width)) * 4;
      let colour = texture.data.subarray(t, t + 4);
      if (edge === 0) colour = roll < 0.55 ? null : MATERIALS[mat].edge;
      else if (edge === 1 && roll < 0.35) colour = MATERIALS[mat].edge;
      if (colour) img.data.set(rgba(colour), (y * n + x) * 4);
    }
  }
  const tile = toCanvas(img);
  trailCanvases.set(key, tile);
  return tile;
}

// the tiles on screen, with the camera at (cx, cy)
export function drawGround(cx, cy) {
  const c0 = Math.max(Math.floor(cx / TILE), 0), c1 = Math.min(Math.ceil((cx + view.w) / TILE), COLS);
  const r0 = Math.max(Math.floor(cy / TILE), 0), r1 = Math.min(Math.ceil((cy + view.h) / TILE), ROWS);
  const grassReady = grass.complete && grass.naturalWidth;
  ctx.fillStyle = 'rgb(130, 170, 70)';
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const x = c * TILE - cx;
      const y = r * TILE - cy;
      if (grassReady) ctx.drawImage(grass, grassTile[at(c, r)] * TILE, 0, TILE, TILE, x, y, TILE, TILE);
      else ctx.fillRect(x, y, TILE, TILE);
      if (material[at(c, r)] !== -1) ctx.drawImage(trailTile(c, r), x, y, TILE, TILE);
    }
  }
}

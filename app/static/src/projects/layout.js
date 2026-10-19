// Lays out the world when the page loads: where the cabin, the arcade machine,
// the clearings, the social signs and every project's tree go, which tiles
// trails can't cross, and then the trails themselves (trails.js). Everything
// it decides goes in the `world` object it returns.
import {
  PIXEL, TILE, COLS, ROWS, SPAWN, SPAWN_CLEARING, ROOM, TOP_ROW, MAT_INDEX, SOCIALS,
  TRAILHEAD_CLEARING, CABIN_CLEARING, CABIN_DISTANCE, at, inWorld,
} from './config.js';
import { randint, clamp } from './util.js';
import { sprites } from './assets.js';
import { makeSign, makeMailbox } from './signs.js';
import { layTrails } from './trails.js';

export function buildWorld(projects) {
  // --- place the cabin ----------------------------------------------------
  // Somewhere random, but well away from spawn so you have to go and find it.
  // It's placed first so the trees leave room for it and its clearing.
  let cc, cr;                                   // the cabin's middle tile
  do {
    cc = randint(CABIN_CLEARING[0] + 3, COLS - CABIN_CLEARING[0] - 4);
    cr = randint(TOP_ROW, ROWS - CABIN_CLEARING[1] - 4);
  } while (Math.hypot(cc - SPAWN[0], cr - SPAWN[1]) < CABIN_DISTANCE);
  const cabin = { x: cc * TILE + TILE / 2, y: cr * TILE + TILE - 8, sprite: sprites.cabin };
  const doorX = cabin.x;                        // the door is in the middle of cabin.png
  const mailbox = { x: cabin.x + 150, y: cabin.y + 4, down: makeMailbox(false), up: makeMailbox(true) };
  // a tree growing just behind one side of the cabin
  const treeSide = Math.random() < 0.5 ? -1 : 1;
  const cabinTreeAt = [cc + 3 * treeSide, cr - 1];

  // --- the arcade machine ---------------------------------------------------
  // An easter egg out on the grass in one corner of the map, picked at
  // random (but not the one the cabin's in). Trees keep clear of it.
  const corners = [[2, 2], [COLS - 3, 2], [2, ROWS - 2], [COLS - 3, ROWS - 2]]
    .filter(([c, r]) => Math.hypot(c - cc, r - cr) > 14);
  const [ac, ar] = corners[randint(0, corners.length - 1)];
  const arcadeMachine = { x: ac * TILE + TILE / 2, y: ar * TILE + TILE - 8, sprite: sprites.arcade };
  // a tree's trunk below it, and its crown would hide it; one just above is fine
  const nearArcade = (c, r) => Math.abs(c - ac) <= 7 && r >= ar - 2 && r <= ar + 14;

  // --- clearings ----------------------------------------------------------
  // Packed earth around spawn and in front of the cabin, in whole tiles: a
  // rough oval, solid in the middle, that breaks up toward its edge into a
  // scatter of tiles, more of them on the checkerboard's dark squares.
  const EDGE = [0.75, 1.3];   // solid out to here, scattered out to here (1 is the oval itself)
  const clearings = [
    { c: SPAWN[0] + 0.5, r: SPAWN[1] + 0.5, rx: TRAILHEAD_CLEARING[0], ry: TRAILHEAD_CLEARING[1] },
    { c: cc + 0.5, r: cr + 1.5, rx: CABIN_CLEARING[0], ry: CABIN_CLEARING[1] },   // mostly in front of the cabin
  ];
  const cabinClearing = clearings[1];
  // how far out a tile's middle is from a clearing's: the oval is at 1
  const depthIn = (cl, c, r) => Math.hypot((c + 0.5 - cl.c) / cl.rx, (r + 0.5 - cl.r) / cl.ry);
  const core = new Uint8Array(COLS * ROWS);     // which clearing a tile is in (1, 2, ...), or 0
  clearings.forEach((cl, k) => {
    for (let r = Math.floor(cl.r - cl.ry * EDGE[1]); r <= cl.r + cl.ry * EDGE[1]; r++) {
      for (let c = Math.floor(cl.c - cl.rx * EDGE[1]); c <= cl.c + cl.rx * EDGE[1]; c++) {
        if (!inWorld(c, r)) continue;
        const d = depthIn(cl, c, r);
        const odds = (EDGE[1] - d) / (EDGE[1] - EDGE[0]) + ((c + r) % 2 ? -0.25 : 0.25);
        if (d < EDGE[0] || (d < EDGE[1] && Math.random() < odds)) core[at(c, r)] = k + 1;
      }
    }
  });

  // The social signs stand scattered about the cabin's clearing: away from
  // its middle, but not out on the grass; and not on the cabin or the
  // mailbox, in front of the door, or on top of each other.
  const socials = SOCIALS.map((s) => ({ ...s, sign: makeSign(s.sign) }));
  const boxOf = (sprite, x, y, margin) => [
    x - (sprite.width * PIXEL) / 2 - margin, y - sprite.height * PIXEL - margin,
    x + (sprite.width * PIXEL) / 2 + margin, y + margin,
  ];
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const taken = [
    boxOf(cabin.sprite, cabin.x, cabin.y, 16),
    boxOf(mailbox.down, mailbox.x, mailbox.y, 16),
    [(cabinTreeAt[0] - 0.5) * TILE, (cabinTreeAt[1] - 0.5) * TILE, (cabinTreeAt[0] + 1.5) * TILE, (cabinTreeAt[1] + 1.25) * TILE],
    [doorX - 56, cabin.y, doorX + 56, cabin.y + 2 * TILE],   // the doorstep, and the way up to it
  ];
  for (const s of socials) {
    // if a crowded clearing leaves no room, slowly stop being fussy about where
    for (let tries = 0; ; tries++) {
      const fussy = tries < 2000;
      const x = Math.round(((cabinClearing.c + (Math.random() * 2 - 1) * cabinClearing.rx * EDGE[1]) * TILE) / PIXEL) * PIXEL;
      const y = Math.round(((cabinClearing.r + (Math.random() * 2 - 1) * cabinClearing.ry * EDGE[1]) * TILE) / PIXEL) * PIXEL;
      const [c, r] = [Math.floor(x / TILE), Math.floor(y / TILE)];
      if (!inWorld(c, r) || core[at(c, r)] !== 2) continue;            // on the clearing's earth
      const depth = depthIn(cabinClearing, c, r);
      if (depth < (fussy ? 0.4 : 0) || depth > (fussy ? 1 : EDGE[1])) continue;   // toward its edge, not out on a stray tile
      const box = boxOf(s.sign, x, y, 12);
      if (tries < 4000 && taken.some((t) => overlaps(box, t))) continue;
      Object.assign(s, { x, y });
      taken.push(box);
      break;
    }
  }

  // Trees keep out of the clearing (with room for their own sign post, two
  // tiles to the right) and out of the rows below it: a big tree's leaves
  // reach up about eight rows, and would hide the signs.
  const around = {
    c0: Math.floor(cabinClearing.c - cabinClearing.rx * EDGE[1]), c1: Math.floor(cabinClearing.c + cabinClearing.rx * EDGE[1]),
    r0: Math.floor(cabinClearing.r - cabinClearing.ry * EDGE[1]), r1: Math.floor(cabinClearing.r + cabinClearing.ry * EDGE[1]),
  };
  const nearCabin = (c, r) =>
    c >= around.c0 - 3 && c <= around.c1 + 1 && r >= Math.min(around.r0, cr - 4) && r <= around.r1 + 8;

  // --- scatter the trees --------------------------------------------------
  // Oldest on the left, newest on the right, roughly: in order of start date,
  // each project gets its own column, spread evenly across the map (evenly,
  // not by the calendar, or the busy recent years would pile up), then nudged
  // up to X_SHUFFLE columns either way so the order isn't perfect. The row is
  // random. Biggest first, so they get the pick of the space, and each size
  // keeps its own room (ROOM): two trees stand at least their two rooms apart,
  // so big trees spread out and small ones fill in between. If a layout gets
  // too crowded to finish, start over a little less fussy about spacing.
  const X_SHUFFLE = 10;
  const byDate = [...projects].sort((a, b) => a.start.localeCompare(b.start));
  const [X0, X1] = [6, COLS - 8];
  const column = new Map(byDate.map((p, i) => [p, Math.round(X0 + ((i + 0.5) / byDate.length) * (X1 - X0))]));
  const SIZE_ORDER = ['huge', 'large', 'medium', 'small', 'tiny'];
  const order = [...projects].sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
  let spots;
  for (let loosen = 1; ; loosen *= 0.92) {
    spots = new Map();
    for (const p of order) {
      const room = ROOM[p.size] || ROOM.medium;
      for (let tries = 0; tries < 500 && !spots.has(p); tries++) {
        const c = clamp(column.get(p) + randint(-X_SHUFFLE, X_SHUFFLE), X0, X1);
        const r = randint(TOP_ROW, ROWS - 4);
        if (Math.hypot(c - SPAWN[0], r - SPAWN[1]) < SPAWN_CLEARING || nearCabin(c, r) || nearArcade(c, r)) continue;
        const crowded = [...spots].some(([q, [sc, sr]]) => {
          const other = ROOM[q.size] || ROOM.medium;
          return ((c - sc) / ((room[0] + other[0]) * loosen)) ** 2 + ((r - sr) / ((room[1] + other[1]) * loosen)) ** 2 < 1;
        });
        if (!crowded) spots.set(p, [c, r]);
      }
    }
    if (spots.size === projects.length) break;
  }

  // Trunks and sign posts block trails.
  const material = new Int8Array(COLS * ROWS).fill(-1);
  const blocked = new Uint8Array(COLS * ROWS);
  for (const p of projects) {
    const [c, r] = spots.get(p);
    blocked[at(c, r)] = 1;
    blocked[at(c + 2, r)] = 1;          // sign post
  }

  // Clearing tiles are packed earth: trails cross them cheaply and never claim them.
  for (let i = 0; i < core.length; i++) if (core[i]) material[i] = MAT_INDEX.trailhead;

  // a signpost at the top of the spawn clearing
  const trailSign = {
    x: SPAWN[0] * TILE + TILE / 2,
    y: (SPAWN[1] - 1) * TILE + TILE - 12,
    sign: makeSign('WELCOME'),
  };
  blocked[at(SPAWN[0], SPAWN[1] - 1)] = 1;

  // Trails can't run through the cabin (or behind its roof), its tree, the mailbox, or the sign posts.
  blocked[at(...cabinTreeAt)] = 1;
  for (let dr = -3; dr <= 0; dr++) {
    for (let dc = -1; dc <= 1; dc++) blocked[at(cc + dc, cr + dr)] = 1;
  }
  blocked[at(Math.floor(mailbox.x / TILE), cr)] = 1;
  for (const s of socials) blocked[at(Math.floor(s.x / TILE), Math.floor(s.y / TILE))] = 1;
  blocked[at(ac, ar)] = 1;

  const world = {
    cc, cr, cabin, doorX, mailbox, cabinTreeAt, arcadeMachine, socials, spots, trailSign,
    core, clearings, cabinClearing, depthIn, EDGE, material, blocked,
  };
  layTrails(world, projects);
  return world;
}

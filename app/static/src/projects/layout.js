// Lays out the world when the page loads: the island's shape, where the cabin,
// the arcade machine, the clearings, the social signs and every project's tree
// go, which tiles trails can't cross, and then the trails themselves
// (trails.js). Everything it decides goes in the `world` object it returns.
import {
  PIXEL, TILE, COLS, ROWS, SPAWN, SPAWN_CLEARING, ROOM, MAT_INDEX, SOCIALS, CABIN, ISLAND,
  TRAILHEAD_CLEARING, CABIN_CLEARING, CABIN_DISTANCE, CABIN_SIZE, ARCADE_SIZE, at, inWorld,
} from './config.js';
import { randint, clamp } from './util.js';
import { sprites } from './assets.js';
import { makeSign, makeMailbox } from './signs.js';
import { layTrails } from './trails.js';
import { toScreen } from './iso.js';

// Where tile (c, r) is on screen, in tiles: how far across, and how far down.
// Down the screen is in front (iso.js), and a tree's crown hides whatever's
// up the screen from its trunk.
const onScreen = (c, r) => [c - r, (c + r) / 2];

// The island: 1 for each tile of land, 0 for sea. It's a round blob in the
// middle of the grid (an oval, as the grid isn't square), its shore pushed in
// and out by a few waves of different lengths around it, each starting at a
// random angle. Measured out from the middle, so it's all one piece.
function makeIsland() {
  const waves = [2, 3, 5, 7].map((k) => ({ k, phase: Math.random() * 2 * Math.PI, size: ISLAND.wobble / Math.sqrt(k) }));
  const land = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = ((c + 0.5) / COLS) * 2 - 1, v = ((r + 0.5) / ROWS) * 2 - 1;   // -1 to 1 across the grid
      const angle = Math.atan2(v, u);
      const shore = ISLAND.radius + waves.reduce((sum, w) => sum + w.size * Math.sin(w.k * angle + w.phase), 0);
      if (Math.hypot(u, v) < shore) land[at(c, r)] = 1;
    }
  }
  return land;
}

export function buildWorld(projects) {
  const land = makeIsland();
  const isLand = (c, r) => inWorld(c, r) && land[at(c, r)] === 1;
  // land all the way out to `rad` tiles from (c, r)
  const landAround = (c, r, rad) => {
    for (let dr = -Math.ceil(rad); dr <= rad; dr++) {
      for (let dc = -Math.ceil(rad); dc <= rad; dc++) {
        if (Math.hypot(dc, dr) <= rad && !isLand(Math.round(c + dc), Math.round(r + dr))) return false;
      }
    }
    return true;
  };

  // --- place the cabin ----------------------------------------------------
  // Somewhere random on the island, with room for its clearing, but well away
  // from spawn so you have to go and find it. It's placed first so the trees
  // leave room for it and its clearing. On a small island, there may be
  // nowhere that far, so it slowly settles for nearer.
  let cc, cr;                                   // the cabin's front tile
  for (let tries = 0; ; tries++) {
    cc = randint(4, COLS - CABIN_CLEARING[0] - 6);
    cr = randint(4, ROWS - CABIN_CLEARING[1] - 6);
    if (Math.hypot(cc - SPAWN[0], cr - SPAWN[1]) < CABIN_DISTANCE - tries / 500) continue;
    if (landAround(cc + 3.5, cr + 1, CABIN_CLEARING[0] * 1.3 + 1) && landAround(cc - 2, cr - 2, 3)) break;
  }
  // It stands on the box of ground (CABIN_SIZE) behind its feet, near the
  // front corner of tile (cc, cr). The door is in its front-right wall (+x);
  // coming out, you're just in front of it, past the step.
  const cabin = { x: (cc + 1) * TILE - 8, y: (cr + 1) * TILE - 8, size: CABIN_SIZE, sprite: sprites.cabin, foot: CABIN.foot };
  const door = { x: cabin.x + 28, y: cabin.y - CABIN.door };
  // the mailbox beside the door, toward the back of that wall
  const mailbox = { x: cabin.x + 32, y: cabin.y - CABIN_SIZE[1] + 8, down: makeMailbox(false), up: makeMailbox(true) };
  // a tree growing just behind one side of the cabin: up-left on screen is -x, up-right is -y
  const cabinTreeAt = Math.random() < 0.5 ? [cc - 4, cr - 1] : [cc - 1, cr - 3];

  // --- the arcade machine ---------------------------------------------------
  // An easter egg out on the grass near the shore, somewhere random, far from
  // the cabin and from spawn. Trees keep clear of it.
  const shoreSpots = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!landAround(c, r, 2) || landAround(c, r, 5)) continue;   // on land, but near the sea
      if (Math.hypot(c - cc, r - cr) > 14 && Math.hypot(c - SPAWN[0], r - SPAWN[1]) > 12) shoreSpots.push([c, r]);
    }
  }
  const [ac, ar] = shoreSpots.length ? shoreSpots[randint(0, shoreSpots.length - 1)] : [SPAWN[0] + 6, SPAWN[1] - 6];
  const arcadeMachine = { x: ac * TILE + TILE / 2, y: ar * TILE + TILE / 2, size: ARCADE_SIZE, sprite: sprites.arcade };
  // a tree's trunk below it on screen, and its crown would hide it; one just above is fine
  const nearArcade = (c, r) => {
    const [a, d] = onScreen(c, r), [aa, ad] = onScreen(ac, ar);
    return Math.abs(a - aa) <= 7 && d >= ad - 2 && d <= ad + 14;
  };

  // --- clearings ----------------------------------------------------------
  // Packed earth around spawn and in front of the cabin, in whole tiles: a
  // rough oval, solid in the middle, that breaks up toward its edge into a
  // scatter of tiles, more of them on the checkerboard's dark squares.
  const EDGE = [0.75, 1.3];   // solid out to here, scattered out to here (1 is the oval itself)
  const clearings = [
    { c: SPAWN[0] + 0.5, r: SPAWN[1] + 0.5, rx: TRAILHEAD_CLEARING[0], ry: TRAILHEAD_CLEARING[1] },
    { c: cc + 3.5, r: cr + 1, rx: CABIN_CLEARING[0], ry: CABIN_CLEARING[1] },   // mostly in front of the door
  ];
  const cabinClearing = clearings[1];
  // how far out a tile's middle is from a clearing's: the oval is at 1
  const depthIn = (cl, c, r) => Math.hypot((c + 0.5 - cl.c) / cl.rx, (r + 0.5 - cl.r) / cl.ry);
  const core = new Uint8Array(COLS * ROWS);     // which clearing a tile is in (1, 2, ...), or 0
  clearings.forEach((cl, k) => {
    for (let r = Math.floor(cl.r - cl.ry * EDGE[1]); r <= cl.r + cl.ry * EDGE[1]; r++) {
      for (let c = Math.floor(cl.c - cl.rx * EDGE[1]); c <= cl.c + cl.rx * EDGE[1]; c++) {
        if (!isLand(c, r)) continue;
        const d = depthIn(cl, c, r);
        const odds = (EDGE[1] - d) / (EDGE[1] - EDGE[0]) + ((c + r) % 2 ? -0.25 : 0.25);
        if (d < EDGE[0] || (d < EDGE[1] && Math.random() < odds)) core[at(c, r)] = k + 1;
      }
    }
  });

  // The social signs stand scattered about the cabin's clearing: away from
  // its middle, but not out on the grass; and not on the cabin or the
  // mailbox, in front of the door, or on top of each other.
  // These boxes are on screen (iso.js), around what you see.
  const socials = SOCIALS.map((s) => ({ ...s, sign: makeSign(s.sign) }));
  const boxOf = (sprite, x, y, margin, foot = [sprite.width / 2]) => {
    const s = toScreen(x, y);
    const left = s.x - foot[0] * PIXEL;
    return [left - margin, s.y - sprite.height * PIXEL - margin, left + sprite.width * PIXEL + margin, s.y + margin];
  };
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const tree = toScreen((cabinTreeAt[0] + 0.5) * TILE, (cabinTreeAt[1] + 0.5) * TILE);
  const step = toScreen(door.x, door.y);
  const taken = [
    boxOf(cabin.sprite, cabin.x, cabin.y, 16, cabin.foot),
    boxOf(mailbox.down, mailbox.x, mailbox.y, 16),
    [tree.x - TILE, tree.y - TILE, tree.x + TILE, tree.y + TILE / 2],
    [step.x - 40, step.y - 40, step.x + 2 * TILE, step.y + TILE],   // the doorstep, and the way up to it (down-right on screen)
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
  // tiles to the right on screen) and out of the ground below it on screen:
  // a big tree's leaves reach up about eight tiles, and would hide the signs.
  // A round clearing is a flat oval on screen, √2 times as wide as it is.
  const [ca, cd] = onScreen(cabinClearing.c, cabinClearing.r);
  const wide = cabinClearing.rx * EDGE[1] * Math.SQRT2, tall = wide / 2;
  const nearCabin = (c, r) => {
    const [a, d] = onScreen(c, r);
    return Math.abs(a - ca) <= wide + 2 && d >= Math.min(cd - tall, (cc + cr) / 2 - 4) && d <= cd + tall + 8;
  };
  // and not right in front of you as you start, hiding you
  const [sa, sd] = onScreen(...SPAWN);
  const nearSpawn = (c, r) => {
    const [a, d] = onScreen(c, r);
    return Math.abs(a - sa) <= 5 && d >= sd && d <= sd + 9;
  };

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
        const r = randint(3, ROWS - 4);
        if (Math.hypot(c - SPAWN[0], r - SPAWN[1]) < SPAWN_CLEARING || nearSpawn(c, r) || nearCabin(c, r) || nearArcade(c, r)) continue;
        if (!landAround(c, r, 2)) continue;     // trunk and sign post well up from the shore
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
  const blocked = new Uint8Array(COLS * ROWS).map((_, i) => 1 - land[i]);   // no trails out to sea
  for (const p of projects) {
    const [c, r] = spots.get(p);
    blocked[at(c, r)] = 1;
    blocked[at(c + 1, r - 1)] = 1;      // sign post
  }

  // Clearing tiles are packed earth: trails cross them cheaply and never claim them.
  for (let i = 0; i < core.length; i++) if (core[i]) material[i] = MAT_INDEX.trailhead;

  // a signpost at the top of the spawn clearing, just up the screen from you
  const trailSign = {
    x: (SPAWN[0] - 1) * TILE + TILE / 2,
    y: (SPAWN[1] - 1) * TILE + TILE / 2,
    sign: makeSign('WELCOME'),
  };
  blocked[at(SPAWN[0] - 1, SPAWN[1] - 1)] = 1;

  // Trails can't run through the cabin (or behind its roof), its tree, the mailbox, or the sign posts.
  blocked[at(...cabinTreeAt)] = 1;
  for (let dr = -2; dr <= 0; dr++) {
    for (let dc = -2; dc <= 0; dc++) blocked[at(cc + dc, cr + dr)] = 1;
  }
  blocked[at(Math.floor(mailbox.x / TILE), Math.floor(mailbox.y / TILE))] = 1;
  for (const s of socials) blocked[at(Math.floor(s.x / TILE), Math.floor(s.y / TILE))] = 1;
  blocked[at(ac, ar)] = 1;

  const world = {
    land, isLand, cc, cr, cabin, door, mailbox, cabinTreeAt, arcadeMachine, socials, spots, trailSign,
    core, clearings, cabinClearing, depthIn, EDGE, material, blocked,
  };
  layTrails(world, projects);
  return world;
}

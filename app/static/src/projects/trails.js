// The trails: one cobblestone trail past every tree, and a path from spawn
// out to the cabin. They're found with A* over the tile grid and written into
// world.material, tile by tile.
import { COLS, ROWS, SPAWN, MAT_INDEX, TRAIL_REACH, at, inWorld } from './config.js';
import { randint, clamp } from './util.js';
import { Heap } from './heap.js';

export function layTrails(world, projects) {
  const { cc, cr, spots, core, cabinClearing, depthIn, EDGE, material, blocked } = world;

  // --- trails -------------------------------------------------------------
  // A little random cost on every tile, so two loads don't route identically.
  // Kept small: most of a trail's character comes from TURN below.
  const wander = new Float32Array(COLS * ROWS).map(() => Math.random() * 0.3);
  // Turning costs as much as a few extra tiles, so trails run in long straight
  // stretches with a few deliberate corners instead of staircasing.
  const TURN = 3;
  // A tile right next to the trail costs extra, so where it loops back it
  // leaves a strip of grass instead of running alongside itself. Crossing straight over only pays it twice, once each side.
  const BESIDE = 4;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Cheapest 4-way route from a tile to anywhere within `reach` tiles of
  // another (A* over tile and heading); returns the tile it got to. Stepping
  // onto the trail is expensive, so it never merges, forks, or doubles back on
  // itself: where the next tree is back the way it came, it loops round on
  // fresh ground. It only meets itself at short crossings, and walking right
  // beside it costs extra too (BESIDE). The clearings are cheap to cross.
  function route(from, to, reach = 0) {
    const besideTrail = (i) => {
      const c = i % COLS, r = Math.floor(i / COLS);
      return DIRS.some(([dc, dr]) => {
        if (!inWorld(c + dc, r + dr)) return false;
        const j = at(c + dc, r + dr);
        return material[j] !== -1 && !core[j];
      });
    };
    const cost = (i) => {
      if (blocked[i]) return Infinity;
      if (core[i]) return 0.35;
      if (material[i] !== -1) return 6;
      return 1 + wander[i] + (besideTrail(i) ? BESIDE : 0);
    };
    const away = (i) => Math.hypot((i % COLS) - to[0], Math.floor(i / COLS) - to[1]);
    const guess = (i) => Math.max(0, away(i) - reach) * 0.35;
    // state = tile * 4 + heading
    const best = new Float32Array(COLS * ROWS * 4).fill(Infinity);
    const came = new Int32Array(COLS * ROWS * 4).fill(-1);
    const open = new Heap();
    const startI = at(...from);
    for (let d = 0; d < 4; d++) {
      best[startI * 4 + d] = 0;
      open.push(startI * 4 + d, guess(startI));
    }
    let end = -1;
    while (open.size) {
      const st = open.pop();
      const i = st >> 2, d = st & 3;
      if (away(i) <= reach) { end = st; break; }
      const c = i % COLS, r = Math.floor(i / COLS);
      DIRS.forEach(([dc, dr], nd) => {
        if (!inWorld(c + dc, r + dr)) return;
        const j = at(c + dc, r + dr);
        const g = best[st] + cost(j) + (nd === d ? 0 : TURN);
        const ns = j * 4 + nd;
        if (g < best[ns]) {
          best[ns] = g;
          came[ns] = st;
          open.push(ns, g + guess(j));
        }
      });
    }
    if (end === -1) return from;
    for (let st = end; st !== -1; st = came[st]) {
      const i = st >> 2;
      if (material[i] === -1) material[i] = MAT_INDEX.path;
    }
    return [(end >> 2) % COLS, Math.floor((end >> 2) / COLS)];
  }

  // The trail: join the two closest stops (the trees and the spawn clearing),
  // then the next two closest, and so on, skipping a stop already joined on
  // both sides, or a pair already on the same piece of trail (that would
  // close a loop). What's left is one trail through them all, walked from one
  // end. It comes within a few tiles of each trunk (TRAIL_REACH) and carries
  // on from wherever it got to.
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const stops = [{ at: SPAWN, reach: 0 }, ...projects.map((p) => ({ at: spots.get(p), reach: randint(...TRAIL_REACH) }))];
  const pairs = [];
  stops.forEach((a, i) => stops.forEach((b, j) => { if (i < j) pairs.push([i, j, dist(a.at, b.at)]); }));
  pairs.sort((x, y) => x[2] - y[2]);
  const links = stops.map(() => []);
  const piece = stops.map((_, i) => i);         // which piece of trail each stop is on so far
  const pieceOf = (i) => (piece[i] === i ? i : (piece[i] = pieceOf(piece[i])));
  for (const [i, j] of pairs) {
    if (links[i].length === 2 || links[j].length === 2 || pieceOf(i) === pieceOf(j)) continue;
    links[i].push(j);
    links[j].push(i);
    piece[pieceOf(i)] = pieceOf(j);
  }
  const walk = [];
  for (let s = links.findIndex((l) => l.length < 2), prev = -1; s !== undefined;) {
    walk.push(stops[s]);
    [prev, s] = [s, links[s].find((n) => n !== prev)];
  }
  // it begins a few tiles out from its first stop, on the side away from the next
  const [first, next] = walk;
  const out = next && next.at[0] > first.at[0] ? -1 : 1;
  let here = [clamp(first.at[0] + out * first.reach, 0, COLS - 1), first.at[1]];
  for (const s of walk) here = route(here, s.at, s.reach);

  // And a path from the trailhead out to the cabin, routed last so it
  // doesn't pull the project trails off course. Left to itself it would take
  // one corner, so it goes by two: out along the longer way, across at a
  // random point partway, then on into the clearing, like a Z.
  {
    // It ends on the edge of the clearing that faces spawn, so the last
    // stretch comes straight in: through the side, or from above or below
    // through a gap beside the cabin or between the signs, never at the roof.
    const across = Math.abs(cc - SPAWN[0]) >= Math.abs(cr - SPAWN[1]);   // mostly sideways?
    const step = across ? [SPAWN[0] < cc ? -1 : 1, 0] : [0, SPAWN[1] < cr ? -1 : 1];   // toward spawn
    const edgeTiles = (strict) => {
      const edges = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = at(c, r), n = [c + step[0], r + step[1]];
          if (core[i] !== 2 || blocked[i] || depthIn(cabinClearing, c, r) >= EDGE[0]) continue;   // the solid middle
          if (!inWorld(...n) || blocked[at(...n)] || depthIn(cabinClearing, ...n) < EDGE[0]) continue;   // facing out of it
          if (strict && (across ? r < cr : Math.abs(c - cc) <= 2)) continue;    // not behind the cabin, or right by it
          edges.push([c, r]);
        }
      }
      return edges;
    };
    // a narrow clearing may have no edge to spare beside the cabin: then take any edge facing spawn
    const edges = edgeTiles(true).length ? edgeTiles(true) : edgeTiles(false);
    const goal = edges.length ? edges[randint(0, edges.length - 1)] : [cc, cr + 1];
    const [a, b] = across ? [0, 1] : [1, 0];   // a: the long way, b: the short way
    const turn = Math.round(SPAWN[a] + (goal[a] - SPAWN[a]) * (0.3 + Math.random() * 0.4));
    // if the short way is too short to see the jog, swing out a few tiles past the goal
    let side = goal[b];
    if (Math.abs(goal[b] - SPAWN[b]) < 4) side = clamp(goal[b] + (goal[b] >= SPAWN[b] ? 4 : -4), 2, (b ? ROWS : COLS) - 3);
    const corner1 = [], corner2 = [];
    corner1[a] = turn; corner1[b] = SPAWN[b];
    corner2[a] = turn; corner2[b] = side;
    // a corner can land on a trunk or post; use the nearest open tile instead
    const open = ([c, r]) => {
      for (let d = 0; d < 4; d++) {
        for (let dr = -d; dr <= d; dr++) {
          for (let dc = -d; dc <= d; dc++) if (inWorld(c + dc, r + dr) && !blocked[at(c + dc, r + dr)]) return [c + dc, r + dr];
        }
      }
      return [c, r];
    };
    const stops = [SPAWN, open(corner1), open(corner2), goal];
    for (let i = 1; i < stops.length; i++) route(stops[i - 1], stops[i]);
  }
}

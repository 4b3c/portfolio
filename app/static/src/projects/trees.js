// One tree per project, plus one beside the cabin. Each grows one step every
// few ticks, and redrawing a tree is the slow part, so trees that changed wait
// their turn: each frame redraws as many as fit in the budget, on-screen ones first.
import {
  TILE, BIG_TREE, BOX_W, BOX_H, BASE, STATUS, MIN_TICKS, MAX_TICKS, RENDER_BUDGET_MS, CABIN_TREE_AGE,
  PALETTES, TRUNK_WIDTH_POWER, Tree, count, renderLayers,
} from './config.js';
import { randint } from './util.js';
import { cam, view } from './camera.js';
import { makeSign } from './signs.js';
import { toScreen } from './iso.js';

// Adds world.trees (the projects') and world.allTrees (those and the cabin's).
export function plantTrees(world, projects) {
  world.trees = projects.map((p) => {
    const [c, r] = world.spots.get(p);
    const status = STATUS[p.status] || STATUS.active;
    return {
      project: p,
      x: c * TILE + TILE / 2,            // trunk base, in world px
      y: r * TILE + TILE - 16,
      signX: (c + 1) * TILE + TILE / 2,  // sign post foot: one tile over each way, so it's beside the trunk on screen
      signY: (r - 1) * TILE + TILE / 2,
      sign: makeSign(p.sign),
      tree: new Tree(p.tree.seed, PALETTES[status.palette],
        { ...BIG_TREE, maxAge: p.tree.maxAge, leaves: status.leaves }),
      growing: true,
      every: randint(MIN_TICKS, MAX_TICKS),  // ticks between growth steps
      wait: randint(1, MAX_TICKS),           // so they don't all start on the same tick
      dirty: false,
      rendered: 0,
      layers: null,
      trunkR: 0,
    };
  });
  // The tree beside the cabin isn't a project: no sign, no card. It grows and
  // draws with the others (allTrees).
  const [tc, tr] = world.cabinTreeAt;
  const cabinTree = {
    x: tc * TILE + TILE / 2,
    y: tr * TILE + TILE - 16,
    tree: new Tree(randint(1, 9999999), PALETTES.green, { ...BIG_TREE, maxAge: CABIN_TREE_AGE, leaves: true }),
    growing: true, every: randint(MIN_TICKS, MAX_TICKS), wait: randint(1, MAX_TICKS),
    dirty: false, rendered: 0, layers: null, trunkR: 0,
  };
  world.allTrees = [...world.trees, cabinTree];
}

// the top-left corner of a tree's drawing box, in screen px (before the camera)
export const boxLeft = (t) => toScreen(t.x, t.y).x - BASE[0];
export const boxTop = (t) => toScreen(t.x, t.y).y - BASE[1];
export const onScreen = (t) =>
  boxLeft(t) < cam.x + view.w && boxLeft(t) + BOX_W > cam.x &&
  boxTop(t) < cam.y + view.h && boxTop(t) + BOX_H > cam.y;

let tick = 0;
export function updateTrees(allTrees) {
  tick++;
  for (const t of allTrees) {
    if (!t.growing || --t.wait > 0) continue;
    t.wait = t.every;
    if (!t.tree.grow()) { t.growing = false; continue; }
    const nodes = count(t.tree.root);
    t.trunkR = nodes < 4 ? 0 : (nodes ** TRUNK_WIDTH_POWER) / 2 + 2;
    t.dirty = true;
  }

  // redraw changed trees: on screen first, then whichever has waited longest
  const todo = allTrees.filter((t) => t.dirty);
  todo.sort((a, b) => (onScreen(b) - onScreen(a)) || (a.rendered - b.rendered));
  const begin = performance.now();
  for (const t of todo) {
    if (performance.now() - begin > RENDER_BUDGET_MS) break;
    t.layers = renderLayers(t.tree);
    t.dirty = false;
    t.rendered = tick;
  }
}

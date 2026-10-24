// One tree per project, plus one beside the cabin. Each grows one step every
// few ticks, and redrawing a tree is the slow part, so trees that changed wait
// their turn: each frame redraws as many on-screen ones as fit in the budget.
// One off screen keeps growing, but isn't redrawn until it comes into view.
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
let lastCost = 0;                // how long the last redraw took, ms
let owed = 0;                    // ms past the budget earlier frames spent, still to make up
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

  // Redraw changed trees on screen, whichever has waited longest first. One
  // more only if it should fit in what's left of the budget, going by how long
  // the last one took. A big tree can take longer than the whole budget: then
  // it's still drawn, but the time over is owed, and the next frames skip
  // redrawing until it's made up, so on average it stays in budget.
  owed = Math.max(0, owed - RENDER_BUDGET_MS);
  if (owed > 0) return;
  const todo = allTrees.filter((t) => t.dirty && onScreen(t));
  todo.sort((a, b) => a.rendered - b.rendered);
  let spent = 0;
  for (const t of todo) {
    if (spent && spent + lastCost > RENDER_BUDGET_MS) break;
    const begin = performance.now();
    t.layers = renderLayers(t.tree);
    t.dirty = false;
    t.rendered = tick;
    lastCost = performance.now() - begin;
    spent += lastCost;
  }
  owed = Math.max(0, spent - RENDER_BUDGET_MS);
}

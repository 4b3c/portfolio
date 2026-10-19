// A walkable world of projects: one tree per project, oldest in the west and
// newest in the east, each at a random height on every load. One cobblestone
// trail winds past them all, through the clearing you start in.
// Walking up to a tree shows that project's card.
//
// This file starts it all; the pieces live in projects/:
//   config.js          every number and bit of text worth tuning
//   ui/                the HTML overlays: intro, list, guide, contact form, arcade
//   layout.js          where everything goes (trails.js lays the trails)
//   trees.js           the trees growing
//   player.js          walking, bumping into things, going in and out
//   cards.js           the card for whatever you're next to, and the counter
//   draw.js, ground.js drawing the forest; room.js draws inside the cabin
import { state } from './projects/state.js';
import { projectsLoaded, spritesLoaded } from './projects/assets.js';
import './projects/ui/intro.js';
import './projects/ui/guide.js';
import { resize, follow } from './projects/camera.js';
import { buildWorld } from './projects/layout.js';
import { initGround } from './projects/ground.js';
import { plantTrees, updateTrees } from './projects/trees.js';
import { makeRoom, drawRoom } from './projects/room.js';
import { player, movePlayer } from './projects/player.js';
import { initCards, updateCard } from './projects/cards.js';
import { drawScene } from './projects/draw.js';
import { drawFade } from './projects/fade.js';

// the world is laid out around the sprites' sizes, so it waits for them too
Promise.all([projectsLoaded, spritesLoaded]).then(([projects]) => start(projects));

function start(projects) {
  const world = buildWorld(projects);
  plantTrees(world, projects);
  world.room = makeRoom();
  initGround(world);
  initCards(world, projects);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    movePlayer(dt, world);
    follow(player, dt);
    updateTrees(world.allTrees);
    updateCard();
    if (state.inside) drawRoom(world.room);
    else drawScene(world);
    drawFade(dt);              // fade to black, swap scenes, fade back in
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
}

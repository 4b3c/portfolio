// You: where you are, the keys you're holding, walking, bumping into things,
// and going in and out of the cabin.
import {
  PIXEL, TILE, SPAWN, WORLD_W, WORLD_H, WALK_SPEED, RUN_SPEED, PLAYER_RADIUS, ANIM_FPS, DOOR_HALF, CABIN, CABIN_ROOM, ARCADE_RADIUS,
} from './config.js';
import { clamp } from './util.js';
import { state } from './state.js';
import { cam } from './camera.js';
import { fadeTo, fading } from './fade.js';
import { arcade } from './ui/arcade.js';
import { track } from './visits.js';

// Outside, x and y are world pixels. Inside, they're the room's floor
// coordinates (u, v), in screen pixels: see room.js.
export const player = { x: SPAWN[0] * TILE + TILE / 2, y: SPAWN[1] * TILE + TILE / 2, dir: 'down', anim: 0 };

export const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (state.introOpen || state.contactOpen || arcade.isOpen) return;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const held = (...codes) => codes.some((c) => keys.has(c));

function goInside() {
  track('inside');
  fadeTo(() => {
    state.inside = true;
    player.x = (CABIN_ROOM.u - 4) * PIXEL;
    player.y = ((CABIN_ROOM.door[0] + CABIN_ROOM.door[1]) / 2) * PIXEL;
    player.dir = 'left';
  });
}
function goOutside(world) {
  fadeTo(() => {
    state.inside = false;
    player.x = world.door.x;
    player.y = world.door.y;
    player.dir = 'right';              // walking out, down-right on screen
    cam.snap = true;                   // the camera jumps straight back to the door
  });
}

// Pushes the player out of a circle on the ground. `radius` is how wide it
// looks on screen: a circle on the ground is a flat oval there, √2 times
// wider than the circle is (iso.js).
function pushOut(cx, cy, radius) {
  const r = radius * Math.SQRT1_2;
  const ox = player.x - cx;
  const oy = player.y - cy;
  const dist = Math.hypot(ox, oy);
  if (dist < r && dist > 0) {
    player.x = cx + (ox / dist) * r;
    player.y = cy + (oy / dist) * r;
  }
}

// Pushes the player out of a box, the shortest way: for the cabin's walls.
function pushOutBox(x0, y0, x1, y1) {
  if (player.x < x0 || player.x > x1 || player.y < y0 || player.y > y1) return;
  const left = player.x - x0, right = x1 - player.x, up = player.y - y0, down = y1 - player.y;
  const least = Math.min(left, right, up, down);
  if (least === left) player.x = x0;
  else if (least === right) player.x = x1;
  else if (least === up) player.y = y0;
  else player.y = y1;
}

export function movePlayer(dt, world) {
  if (state.introOpen || state.contactOpen || arcade.isOpen || fading()) { player.anim = 0; return; }
  const dx = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
  const dy = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
  if (!dx && !dy) { player.anim = 0; return; }

  if (dx) player.dir = dx > 0 ? 'right' : 'left';
  else player.dir = dy > 0 ? 'down' : 'up';

  const speed = held('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED;
  player.anim += dt * ANIM_FPS * (speed / WALK_SPEED);

  // The keys point across the screen, but you walk on the ground, which runs
  // at an angle to it, outside (iso.js) and in (room.js): right is +x and -y,
  // down is +x and +y. So two keys at once (down and right, say) walk straight
  // along one edge of the tiles, and you go the same speed over the ground
  // whichever way you walk: on screen, up and down is half as fast as across,
  // since the ground is squashed to half height. `speed` is how fast you go
  // across the screen.
  const gx = dx + dy, gy = dy - dx;
  const len = Math.hypot(gx, gy);
  const stepX = (gx / len) * speed * Math.SQRT1_2 * dt;
  const [fromX, fromY] = [player.x, player.y];
  player.x += stepX;
  player.y += (gy / len) * speed * Math.SQRT1_2 * dt;

  if (state.inside) {
    // the furniture, the walls, and out through the doorway at the front right
    for (const f of world.room.furniture) {
      const [u0, v0, u1, v1] = f.blocks;
      pushOutBox(u0 * PIXEL - PLAYER_RADIUS, v0 * PIXEL - PLAYER_RADIUS, u1 * PIXEL + PLAYER_RADIUS, v1 * PIXEL + PLAYER_RADIUS);
    }
    const [U, V] = [CABIN_ROOM.u * PIXEL, CABIN_ROOM.v * PIXEL];
    const inDoorway = player.y > CABIN_ROOM.door[0] * PIXEL + PLAYER_RADIUS && player.y < CABIN_ROOM.door[1] * PIXEL - PLAYER_RADIUS;
    player.x = clamp(player.x, PLAYER_RADIUS, inDoorway ? U + 6 * PIXEL : U - PLAYER_RADIUS);
    player.y = clamp(player.y, PLAYER_RADIUS, V - PLAYER_RADIUS);
    if (player.x > U + 2 * PIXEL) goOutside(world);
    return;
  }
  // Not into the sea: each way you're going (x, then y) is undone if it would
  // take any edge of you off the island, so you slide along the shore.
  const onLand = (x, y) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([sx, sy]) =>
    world.isLand(Math.floor((x + sx * PLAYER_RADIUS) / TILE), Math.floor((y + sy * PLAYER_RADIUS) / TILE)));
  if (!onLand(player.x, fromY)) player.x = fromX;
  if (!onLand(player.x, player.y)) player.y = fromY;

  const { allTrees, trailSign, socials, mailbox, cabin, arcadeMachine } = world;
  for (const t of allTrees) {
    if (t.trunkR) pushOut(t.x, t.y, t.trunkR + PLAYER_RADIUS);
    if (t.sign) pushOut(t.signX, t.signY, 6 + PLAYER_RADIUS);
  }
  pushOut(trailSign.x, trailSign.y, 6 + PLAYER_RADIUS);
  for (const s of socials) pushOut(s.x, s.y, 6 + PLAYER_RADIUS);
  pushOut(mailbox.x, mailbox.y, 6 + PLAYER_RADIUS);
  pushOut(arcadeMachine.x, arcadeMachine.y, ARCADE_RADIUS + PLAYER_RADIUS);
  // the cabin: the box of ground it stands on, its feet at the front corner
  const [sizeX, sizeY] = cabin.size;
  pushOutBox(cabin.x - sizeX - PLAYER_RADIUS, cabin.y - sizeY - PLAYER_RADIUS, cabin.x + PLAYER_RADIUS, cabin.y + PLAYER_RADIUS);
  // Walking into the door, in the cabin's front-right wall (up-left on screen),
  // goes straight in. You're at the door if you're lined up with it along the
  // wall (y) and right up against the wall (x): the box above stops you at
  // PLAYER_RADIUS in front of it. Without the second half, anywhere in line
  // with the door, all the way across the map behind the cabin, would count.
  const lined = Math.abs(player.y - (cabin.y - CABIN.door)) < DOOR_HALF;
  const against = player.x >= cabin.x && player.x <= cabin.x + PLAYER_RADIUS + 1;
  const atDoor = lined && against;
  if (stepX < 0 && atDoor) goInside();
  player.x = clamp(player.x, 16, WORLD_W - 16);
  player.y = clamp(player.y, 48, WORLD_H - 8);
}

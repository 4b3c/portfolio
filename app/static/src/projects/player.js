// You: where you are, the keys you're holding, walking, bumping into things,
// and going in and out of the cabin.
import {
  PIXEL, TILE, SPAWN, WORLD_W, WORLD_H, WALK_SPEED, RUN_SPEED, PLAYER_RADIUS, ANIM_FPS, DOOR_HALF, CABIN_ROOM,
} from './config.js';
import { clamp } from './util.js';
import { state } from './state.js';
import { cam } from './camera.js';
import { fadeTo, fading } from './fade.js';
import { arcade } from './ui/arcade.js';

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
    player.x = world.doorX;
    player.y = world.cabin.y + 28;
    player.dir = 'down';
    cam.snap = true;                   // the camera jumps straight back to the door
  });
}

// Pushes the player out of a flat oval (y distance counts double).
function pushOut(cx, cy, radius) {
  const ox = player.x - cx;
  const oy = (player.y - cy) * 2;
  const dist = Math.hypot(ox, oy);
  if (dist < radius && dist > 0) {
    player.x = cx + (ox / dist) * radius;
    player.y = cy + (oy / dist) * radius / 2;
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
  const len = Math.hypot(dx, dy);
  const mx = (dx / len) * speed * dt;
  const my = (dy / len) * speed * dt;
  player.anim += dt * ANIM_FPS * (speed / WALK_SPEED);

  if (state.inside) {
    // The keys move you across the screen, but the floor runs at an angle to
    // it: right is half +u and half -v, down is +u and +v (see room.js).
    player.x += (mx + 2 * my) / 2;
    player.y += (2 * my - mx) / 2;
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
  player.x += mx;
  player.y += my;

  const { allTrees, trailSign, socials, mailbox, cabin, arcadeMachine, doorX } = world;
  for (const t of allTrees) {
    if (t.trunkR) pushOut(t.x, t.y, t.trunkR + PLAYER_RADIUS);
    if (t.sign) pushOut(t.signX, t.signY, 6 + PLAYER_RADIUS);
  }
  pushOut(trailSign.x, trailSign.y, 6 + PLAYER_RADIUS);
  for (const s of socials) pushOut(s.x, s.y, 6 + PLAYER_RADIUS);
  pushOut(mailbox.x, mailbox.y, 6 + PLAYER_RADIUS);
  pushOutBox(cabin.x - 108 - PLAYER_RADIUS, cabin.y - 60, cabin.x + 108 + PLAYER_RADIUS, cabin.y + PLAYER_RADIUS / 2);
  pushOutBox(arcadeMachine.x - 36 - PLAYER_RADIUS, arcadeMachine.y - 24, arcadeMachine.x + 36 + PLAYER_RADIUS, arcadeMachine.y + PLAYER_RADIUS / 2);
  // walking up into the door goes straight in
  if (dy < 0 && Math.abs(player.x - doorX) < DOOR_HALF * PIXEL && player.y <= cabin.y + PLAYER_RADIUS / 2) goInside();
  player.x = clamp(player.x, 16, WORLD_W - 16);
  player.y = clamp(player.y, 48, WORLD_H - 8);
}

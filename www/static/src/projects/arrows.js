// Clicking the counter shows arrows around the player, one toward each
// project not visited yet, for a few seconds (and contact, toward the cabin).
import { CABIN } from './config.js';
import { ctx } from './dom.js';
import { player } from './player.js';
import { visited } from './cards.js';
import { toScreen } from './iso.js';
import { track } from './visits.js';

const POINT_MS = 3000;
let pointing = { kind: null, until: 0 };
document.querySelectorAll('[data-point]').forEach((b) => b.addEventListener('click', () => {
  pointing = { kind: b.dataset.point, until: performance.now() + POINT_MS };
  track('arrows', b.dataset.point);
  b.blur();   // so the arrow keys go back to walking
}));

// A ring around the player pointing at the nearest few unvisited trees, the
// closest biggest. An arrow pointing almost the same way as a nearer one is
// left out, so the ring stays readable. They fade out over the last half second.
const MAX_ARROWS = 5;
const MIN_GAP = (15 * Math.PI) / 180;
export function drawArrows(world, cx, cy) {
  const left = pointing.until - performance.now();
  if (left <= 0) return;
  const kind = pointing.kind;
  const p = toScreen(player.x, player.y);
  const px = p.x - cx;
  const py = p.y - cy - 28;               // around the middle of the sprite
  // the contact button points to the cabin, in the mailbox flag's red; the counter in the cards' cream
  const toCabin = kind === 'cabin';
  const [r, g, b] = toCabin ? CABIN.flag : [244, 234, 210];
  ctx.save();
  ctx.globalAlpha = Math.min(1, left / 500);
  ctx.lineJoin = 'round';
  const targets = (toCabin ? [world.cabin] : world.trees.filter((t) => !visited.has(t.project.id)))
    .map((t) => ({ to: toScreen(t.x - player.x, t.y - player.y), d: Math.hypot(t.x - player.x, t.y - player.y) }))
    .map(({ to, d }) => ({ angle: Math.atan2(to.y, to.x), d }))   // the way it is on screen
    .sort((a, b) => a.d - b.d);
  const shown = [];
  for (const t of targets) {
    if (shown.length >= MAX_ARROWS) break;
    const apart = shown.every((s) => Math.abs(Math.atan2(Math.sin(t.angle - s.angle), Math.cos(t.angle - s.angle))) >= MIN_GAP);
    if (apart) shown.push(t);
  }
  shown.forEach(({ angle }, i) => {
    const size = 1.3 - i * 0.12;         // nearest first, biggest
    ctx.save();
    ctx.translate(px + Math.cos(angle) * 95, py + Math.sin(angle) * 95);
    ctx.rotate(angle);
    ctx.scale(size, size);
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-6, -10);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 10);
    ctx.closePath();
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.strokeStyle = '#28201e';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

// On touch screens: a D-pad bottom left, and E and run bottom right (E only
// when there's something to use). They
// press the same keys a keyboard would (as key events on window), so walking,
// the cards and the arcade game all work without knowing about them. The
// D-pad is one pad, not four buttons: slide your thumb round it to turn, and
// between two arrows to walk diagonally. Hidden while the intro, the list or
// the mailbox is up. The layout for touch is in projects.html (html.touch).
import { state } from '../state.js';
import { list } from './list.js';
import { arcade } from './arcade.js';

export const touch = window.matchMedia('(pointer: coarse)').matches;
if (touch) document.documentElement.classList.add('touch');

const pad = document.getElementById('touch');
const dpad = pad.querySelector('[data-dpad]');
const runButton = pad.querySelector('[data-run]');
const eButton = pad.querySelector('[data-e]');
const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

// --- the D-pad ------------------------------------------------------------
// Eight ways round, from where the thumb is: each 45° slice holds one arrow,
// or the two either side of a diagonal.
const ARROWS = { right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft', up: 'ArrowUp' };
const SLICES = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
const DEAD = 0.2;                     // the middle fifth of the pad is no direction
let held = new Set();
let running = false;
function hold(dirs) {
  const next = new Set(dirs);
  for (const d of held) if (!next.has(d)) release(ARROWS[d]);
  for (const d of next) if (!held.has(d)) press(ARROWS[d]);
  if (running && next.size && !held.size) press('ShiftLeft');   // keys clear on blur, so press run again on each new walk
  held = next;
  dpad.querySelectorAll('[data-dir]').forEach((b) => { b.dataset.on = String(held.has(b.dataset.dir)); });
}
function aim(e) {
  const r = dpad.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  if (Math.hypot(x, y) < DEAD / 2) return hold([]);
  const slice = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  hold(SLICES[(slice + 8) % 8]);
}
let finger = null;
dpad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  finger = e.pointerId;
  aim(e);
  dpad.setPointerCapture(e.pointerId);  // keeps the moves coming when the thumb slides off the pad
});
dpad.addEventListener('pointermove', (e) => { if (e.pointerId === finger) aim(e); });
const lift = (e) => { if (e.pointerId === finger) { finger = null; hold([]); } };
dpad.addEventListener('pointerup', lift);
dpad.addEventListener('pointercancel', lift);

// --- E and run --------------------------------------------------------------
// E is a tap: down and straight back up. Run stays on until tapped again.
eButton.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  press('KeyE');
  release('KeyE');
});
runButton.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  running = !running;
  runButton.dataset.on = String(running);
  (running ? press : release)('ShiftLeft');
});

// --- when it shows ----------------------------------------------------------
function update() {
  const show = touch && !state.introOpen && !state.contactOpen && list.hidden;
  if (!show && held.size) hold([]);
  pad.style.display = show ? '' : 'none';   // not `hidden`: its Tailwind `flex` class would override that
  eButton.style.visibility = state.canUse && !arcade.isOpen ? '' : 'hidden';   // visibility, so run stays put
  requestAnimationFrame(update);
}
if (touch) update();

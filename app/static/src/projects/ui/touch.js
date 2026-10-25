// On touch screens: a joystick bottom left. Drag the knob and you walk where
// it points on screen, slower when it's pushed only a little (state.stick,
// read by player.js). In the arcade game it presses the arrow keys instead,
// as key events on window, since the game only knows keys. Cards and the
// guide are used by tapping them. Hidden while the intro, the list or the
// mailbox is up. The layout for touch is in projects.html (html.touch).
import { state } from '../state.js';
import { list } from './list.js';
import { arcade } from './arcade.js';

export const touch = window.matchMedia('(pointer: coarse)').matches;
if (touch) document.documentElement.classList.add('touch');

const pad = document.getElementById('touch');
const stick = pad.querySelector('[data-stick]');
const knob = pad.querySelector('[data-knob]');
const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

// --- arrow keys, for the arcade ---------------------------------------------
// Eight ways round: each 45° slice holds one arrow, or the two either side of
// a diagonal.
const ARROWS = { right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft', up: 'ArrowUp' };
const SLICES = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
let held = new Set();
function hold(dirs) {
  const next = new Set(dirs);
  for (const d of held) if (!next.has(d)) release(ARROWS[d]);
  for (const d of next) if (!held.has(d)) press(ARROWS[d]);
  held = next;
}

// --- the joystick ------------------------------------------------------------
const DEAD = 0.15;                    // this near the middle (of the reach) is standing still
function aim(e) {
  const r = stick.getBoundingClientRect();
  const reach = r.width / 2;          // how far the knob can go from the middle
  let x = (e.clientX - r.left - reach) / reach;
  let y = (e.clientY - r.top - reach) / reach;
  const push = Math.hypot(x, y);
  if (push > 1) { x /= push; y /= push; }
  knob.style.transform = `translate(${x * reach}px, ${y * reach}px)`;
  const moving = push >= DEAD;
  state.stick = moving && !arcade.isOpen ? { x, y } : { x: 0, y: 0 };
  hold(moving && arcade.isOpen ? SLICES[(Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8] : []);
}
function letGo() {
  knob.style.transform = '';
  state.stick = { x: 0, y: 0 };
  hold([]);
}
let finger = null;
stick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  finger = e.pointerId;
  aim(e);
  stick.setPointerCapture(e.pointerId);  // keeps the moves coming when the thumb slides off the stick
});
stick.addEventListener('pointermove', (e) => { if (e.pointerId === finger) aim(e); });
const lift = (e) => { if (e.pointerId === finger) { finger = null; letGo(); } };
stick.addEventListener('pointerup', lift);
stick.addEventListener('pointercancel', lift);

// --- when it shows ----------------------------------------------------------
function update() {
  const show = touch && !state.introOpen && !state.contactOpen && list.hidden;
  if (!show && finger !== null) { finger = null; letGo(); }
  pad.style.display = show ? '' : 'none';   // not `hidden`: its Tailwind `flex` class would override that
  requestAnimationFrame(update);
}
if (touch) update();

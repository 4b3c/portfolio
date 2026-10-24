// The welcome sign's guide: three pages in the corner, like a project's card:
// choose a character, the controls, and about (with the map key). It shows when
// you walk up to the welcome sign (see cards.js), or from anywhere with help or
// H, until you press it again or walk up to something else. E flips to the next page.
import { PIXEL, PALETTES, STATUS, ANIM_FPS } from '../config.js';
import { hashXY } from '../util.js';
import { state } from '../state.js';
import { CHARACTERS, pickCharacter } from '../characters.js';
import { track } from '../visits.js';

export const guide = document.getElementById('guide');
const PAGES = ['character', 'controls', 'about'];
let page = 'character';
function showPage(name) {
  page = name;
  guide.querySelectorAll('[data-page]').forEach((el) => { el.hidden = el.dataset.page !== name; });
  guide.querySelectorAll('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.style.borderColor = on ? '#28201e' : 'transparent';
    b.style.background = on ? '#fffaf0' : '';
    b.setAttribute('aria-pressed', String(on));
  });
}
export const nextPage = () => showPage(PAGES[(PAGES.indexOf(page) + 1) % PAGES.length]);
guide.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  showPage(b.dataset.tab);
  b.blur();                            // so the arrow keys go back to walking
}));
showPage(page);
const toggleHelp = () => {
  state.guidePinned = !state.guidePinned;
  state.pinnedNear = 'new';
};
document.getElementById('help').addEventListener('click', (e) => {
  toggleHelp();
  e.currentTarget.blur();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !state.introOpen && !state.contactOpen) toggleHelp();
  if (e.code === 'Escape') state.guidePinned = false;
});

// --- character picker: each choice shows its sprite walking toward you ----
const picker = document.getElementById('characters');
const previews = CHARACTERS.map((c) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex flex-col items-center gap-1 rounded border-4 p-1.5 text-xs font-bold hover:bg-white';
  const preview = document.createElement('canvas');
  const frame0 = c.sprites.down[0];
  preview.width = frame0.width;
  preview.height = frame0.height;
  preview.style.width = frame0.width * PIXEL + 'px';
  preview.style.height = frame0.height * PIXEL + 'px';
  preview.style.imageRendering = 'pixelated';
  const label = document.createElement('span');
  label.textContent = c.name;
  button.append(preview, label);
  button.addEventListener('click', () => {
    track('character', c.name);
    pick(c);
    button.blur();                     // so the arrow keys go back to walking
  });
  picker.append(button);
  return { c, button, ctx: preview.getContext('2d') };
});
function pick(c) {
  pickCharacter(c);
  for (const p of previews) {
    const on = p.c === c;
    p.button.style.borderColor = on ? '#28201e' : 'transparent';
    p.button.style.background = on ? '#fffaf0' : '';
    p.button.setAttribute('aria-pressed', String(on));
  }
}
pick(state.character);
let previewFrame = 0;
setInterval(() => {
  if (guide.dataset.open !== 'true' || page !== 'character') return;
  previewFrame = (previewFrame + 1) % 4;
  for (const p of previews) {
    const sprite = p.c.sprites.down[previewFrame];
    p.ctx.clearRect(0, 0, sprite.width, sprite.height);
    p.ctx.drawImage(sprite, 0, 0);
  }
}, 1000 / ANIM_FPS);

// --- the map key, on the about page: what each colour of leaves means -----
for (const el of document.querySelectorAll('[data-leaf]')) {
  const status = STATUS[el.dataset.leaf];
  const p = PALETTES[status.palette];
  const img = new ImageData(8, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let colour = [130, 170, 70, 255];                       // grass behind
      if (status.leaves) colour = [p.leaves0, p.leaves1, p.leaves2][Math.floor(hashXY(x >> 1, y >> 1) * 3)];
      else if (x === 3 || x === 4 || (y < 3 && (x === y || x === 7 - y))) colour = p.trunk0;  // a bare twig
      img.data.set(colour, (y * 8 + x) * 4);
    }
  }
  el.width = el.height = 8;
  el.getContext('2d').putImageData(img, 0, 0);
}

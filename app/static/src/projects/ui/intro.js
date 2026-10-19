// The ways into the page: the welcome intro, then the forest; the list
// instead; and on phones, a note to come back on a computer.
// Everything else (choosing a character, the map key, the controls) is on the
// welcome sign at spawn: see ui/guide.js.
import { ANIM_FPS } from '../config.js';
import { state } from '../state.js';
import { CHARACTERS } from '../characters.js';
import { list, showList } from './list.js';

const intro = document.getElementById('intro');
// While the welcome is up, nothing else is: no counter, contact or help
// buttons, and no card or guide (cards.js checks introOpen). Visibility,
// not display, so it doesn't undo the phone view hiding them for good.
const hud = ['buttons'].map((id) => document.getElementById(id));
const showHud = (on) => hud.forEach((el) => { el.style.visibility = on ? '' : 'hidden'; });
showHud(false);
function showIntro() {
  intro.style.display = '';
  state.introOpen = true;
  showHud(false);
  intro.querySelector('[data-start]').focus();
}
function startExploring() {
  intro.style.display = 'none';        // not `hidden`: the overlay's Tailwind `flex` class overrides it
  state.introOpen = false;
  showHud(true);
  document.activeElement?.blur();      // so Enter and E go to the world, not the button
}
intro.querySelector('[data-start]').addEventListener('click', startExploring);
// clicking the dark area outside the panel starts too
intro.addEventListener('click', (e) => { if (e.target === intro) startExploring(); });
// and so does Enter
window.addEventListener('keydown', (e) => {
  if (state.introOpen && list.hidden && e.code === 'Enter' && e.target.tagName !== 'BUTTON') startExploring();
});

// --- "just show me a list", and back -------------------------------------
const onPhone = window.matchMedia('(max-width: 640px), (pointer: coarse) and (not (any-pointer: fine))').matches;
intro.querySelector('[data-list]').addEventListener('click', () => {
  intro.style.display = 'none';        // the list is see-through, so the intro would show between cards
  showList();
});
list.querySelector('[data-forest]').addEventListener('click', () => {
  list.hidden = true;
  if (onPhone) { showMobile(); return; }  // no forest without a keyboard: back to the desktop suggestion
  showIntro();
});

// --- phones --------------------------------------------------------------
// The forest needs a keyboard, so on a small screen or a touch-only device,
// show the Explorer and suggest a desktop, with the list as a way in. The
// list's "take me to the forest" comes back here too.
function showMobile() {
  const mobile = document.getElementById('mobile');
  const guy = document.getElementById('mobile-guy');
  const frames = CHARACTERS[0].sprites.down;
  const SCALE = 8;                          // twice the forest's pixel size
  guy.width = frames[0].width;
  guy.height = frames[0].height;
  guy.style.width = frames[0].width * SCALE + 'px';
  guy.style.height = frames[0].height * SCALE + 'px';
  const guyCtx = guy.getContext('2d');
  let step = 0;
  const walk = () => {
    guyCtx.clearRect(0, 0, guy.width, guy.height);
    guyCtx.drawImage(frames[step++ % frames.length], 0, 0);
  };
  walk();
  const walking = setInterval(walk, 1000 / ANIM_FPS);
  intro.style.display = 'none';
  hud.forEach((el) => { el.style.display = 'none'; });   // the counter and buttons are for the forest
  mobile.style.display = '';             // not `hidden`: its Tailwind `flex` class would override that
  mobile.querySelector('[data-mobile-list]').onclick = () => {  // onclick, so showing it again doesn't stack handlers
    clearInterval(walking);
    mobile.style.display = 'none';
    showList();
  };
}
if (onPhone) showMobile();

intro.querySelector('[data-start]').focus();

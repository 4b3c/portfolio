// The ways into the page: the welcome intro, then the forest; or the list
// instead. On touch screens the forest has its own buttons (ui/touch.js).
// Everything else (choosing a character, the map key, the controls) is on the
// welcome sign at spawn: see ui/guide.js.
import { state } from '../state.js';
import { list, showList } from './list.js';
import { track } from '../visits.js';

const intro = document.getElementById('intro');
// While the welcome is up, nothing else is: no counter, contact or help
// buttons, and no card or guide (cards.js checks introOpen).
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
  track('explore');
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
intro.querySelector('[data-list]').addEventListener('click', () => {
  track('list');
  intro.style.display = 'none';        // the list is see-through, so the intro would show between cards
  showList();
});
list.querySelector('[data-forest]').addEventListener('click', () => {
  list.hidden = true;
  showIntro();
});

intro.querySelector('[data-start]').focus();

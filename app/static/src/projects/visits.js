// Notes on how people use the site, for me: what they tried (which cards they
// opened, the list, the cabin, the arcade, links), how long they spent, and
// whether they've been before. It all goes to my own server (/visits/note in
// app/visits.py), nowhere else. If they send a note through the contact form,
// it's linked to their name and email there.
//
// Each browser gets a random id, kept in localStorage, so a second visit is
// known to be the same person. Nothing is sent from browsers asking not to be
// tracked (Global Privacy Control, or Do Not Track).
import { canvas } from './dom.js';

const SEND_EVERY_MS = 30000;
const off = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';

const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (d) => (d ^ (Math.random() * 16) >> (d / 4)).toString(16)));

// localStorage can be blocked (private windows, some settings): then each visit is a stranger
let visitor = null;
let before = 0;                         // visits this browser has made before this one
try {
  visitor = localStorage.getItem('visitor');
  if (!visitor) localStorage.setItem('visitor', (visitor = newId()));
  before = Number(localStorage.getItem('visits')) || 0;
  localStorage.setItem('visits', String(before + 1));
} catch {
  visitor = newId();
}
const visit = newId();
export const visitorId = () => (off ? '' : visitor);

// what happened, as [ms since the page opened, kind, detail]
const queue = [];
export function track(kind, detail = '') {
  if (off) return;
  queue.push([Math.round(performance.now()), kind, String(detail).slice(0, 200)]);
}

// Time spent counts only while the page is on screen, not sitting in a background tab.
let active = 0;
let since = document.visibilityState === 'visible' ? performance.now() : null;
function activeMs() {
  return Math.round(active + (since === null ? 0 : performance.now() - since));
}

// The first note says what the visit is: where they came from, and their screen
// and settings. The server adds the browser and system from the request.
let first = true;
function send() {
  if (off) return;
  const note = { visitor, visit, active: activeMs(), events: queue.splice(0) };
  if (first) {
    first = false;
    note.info = {
      referrer: document.referrer, path: location.pathname + location.search, before,
      language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`, window: `${innerWidth}x${innerHeight}`,
      touch: navigator.maxTouchPoints > 0,
    };
  }
  const body = JSON.stringify(note);
  // sendBeacon still gets through as the tab closes; fetch is the fallback
  if (!navigator.sendBeacon?.(canvas.dataset.visits, new Blob([body], { type: 'application/json' }))) {
    fetch(canvas.dataset.visits, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') since = performance.now();
  else {
    active = activeMs();
    since = null;
    send();                              // they may never come back to this tab
  }
});
window.addEventListener('pagehide', send);
setInterval(() => { if (since !== null) send(); }, SEND_EVERY_MS);
send();

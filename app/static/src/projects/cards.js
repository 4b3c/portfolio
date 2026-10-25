// The card in the corner: everything you can walk up to. Each tree shows its
// project, each social sign its link, and the mailbox asks you to reach out;
// inside, each thing in the room says something about me. All share one card.
// Also the visited counter: a project counts once its card has opened.
import {
  PIXEL, PLAYER_RADIUS, CARD_DISTANCE, SOCIAL_REACH, WELCOME_REACH, MAILBOX_REACH, TAGS, ABOUT, lastYear,
} from './config.js';
import { state } from './state.js';
import { player, keys } from './player.js';
import { guide, nextPage } from './ui/guide.js';
import { openContact } from './ui/contact.js';
import { arcade } from './ui/arcade.js';
import { toScreen } from './iso.js';
import { track } from './visits.js';

const card = document.getElementById('card');
const field = (name) => card.querySelector(`[data-${name}]`);
let outsideMarks = [];
let insideMarks = [];
let nearest = null;
let shown = null;

// --- visited counter: visited/total (starts fresh every visit) -------------
export const visited = new Set();
const progress = document.querySelector('[data-progress]');
let total = 0;
function updateProgress() {
  progress.textContent = `${visited.size}/${total}`;
}

// Once the world's laid out: where each card is.
export function initCards(world, projects) {
  const { trees, socials, trailSign, mailbox, arcadeMachine, room } = world;
  total = projects.length;
  updateProgress();
  outsideMarks = [
    ...trees.map((t) => ({
      x: t.x, y: t.y, reach: CARD_DISTANCE, project: t.project,
      card: {
        title: t.project.title,
        date: lastYear(t.project),
        tags: t.project.tags.map((k) => TAGS[k]).join(' · '),
        text: t.project.description,
        linkText: t.project.linkUrl && t.project.linkText + ' ↗',
        linkUrl: t.project.linkUrl,
        images: t.project.images || [],
      },
    })),
    ...socials.map((s) => ({
      x: s.x, y: s.y, reach: SOCIAL_REACH,
      card: { title: s.title, date: 'find me', text: s.note, linkUrl: s.url,
        linkText: s.url.replace(/^(https?:\/\/(www\.)?|mailto:)/, '').replace(/\/$/, '') + ' ↗' },
    })),
    { x: trailSign.x, y: trailSign.y, reach: WELCOME_REACH, guide: true },   // opens the guide, not a card
    {
      x: mailbox.x, y: mailbox.y, reach: MAILBOX_REACH,
      card: { title: 'Reach out', date: 'the mailbox', contact: true, linkText: 'send me a message ↗',
        text: "Got a question, an idea, or just want to say hi? Leave a note in the mailbox and I'll write back." },
    },
    { x: arcadeMachine.x, y: arcadeMachine.y, reach: 110, card: { ...ABOUT.arcade, arcade: true, linkText: 'play →' } },
  ];
  // inside, each piece of furniture: within `reach` of any side of it
  insideMarks = room.furniture.map((f) => ({ box: f.blocks, reach: PLAYER_RADIUS + 12, card: f.card }));
}

// E (or clicking the card's link) follows it: the arcade machine, the
// contact form, or a new tab (an email too, so a webmail handler like Gmail
// doesn't replace the forest).
function use(c) {
  track('use', c.arcade ? 'arcade' : c.contact ? 'mailbox' : c.linkUrl);
  if (c.arcade) { keys.clear(); arcade.open(); }
  else if (c.contact) openContact();
  else if (c.linkUrl) window.open(c.linkUrl, '_blank', 'noopener');
}
field('link').addEventListener('click', (e) => {
  if (!shown) return;
  e.preventDefault();
  use(shown.card);
});
window.addEventListener('keydown', (e) => {
  if (state.introOpen || state.contactOpen || arcade.isOpen) return;
  if ((e.code === 'KeyE' || e.code === 'Enter') && (nearest || state.guidePinned)) {
    e.preventDefault();              // or the E would land in the contact form as it opens
    if (guide.dataset.open === 'true') nextPage();
    else use(nearest.card);
  }
});

// Projects with several images flip through them while their card is open.
const SLIDE_MS = 2000;
let slideshow = 0;
let cardToken = 0;   // bumped each time the nearest tree changes

// how far the player is from the nearest edge of a footprint (art pixels: x0, y0, x1, y1)
function distanceToBox([x0, y0, x1, y1]) {
  const dx = Math.max(x0 * PIXEL - player.x, 0, player.x - x1 * PIXEL);
  const dy = Math.max(y0 * PIXEL - player.y, 0, player.y - y1 * PIXEL);
  return Math.hypot(dx, dy);
}

export function updateCard() {
  nearest = null;
  let best = Infinity;
  for (const l of state.inside ? insideMarks : outsideMarks) {
    // outside, measured on screen (iso.js), so the reaches look the same all round
    const off = !l.box && toScreen(player.x - l.x, player.y - l.y);
    const d = l.box ? distanceToBox(l.box) : Math.hypot(off.x, off.y * 1.5);
    if (d < l.reach && d < best) { best = d; nearest = l; }
  }
  // The welcome sign opens the guide instead of a card. Help (or H) opens
  // it anywhere, until you walk up to something else.
  if (state.guidePinned) {
    if (state.pinnedNear === 'new') state.pinnedNear = nearest;
    else if (nearest !== state.pinnedNear) state.guidePinned = false;
  }
  const guideOpen = !state.introOpen && (state.guidePinned || Boolean(nearest?.guide));
  guide.dataset.open = String(guideOpen);
  const target = guideOpen || state.introOpen ? null : nearest;   // what the card shows
  if (target === shown) return;
  shown = target;
  clearInterval(slideshow);
  if (!target) {
    cardToken++;                     // forget any card still waiting on its image
    card.dataset.open = 'false';
    return;
  }
  const { project } = target;
  const c = target.card;
  track('card', project ? project.id : c.title);
  const token = ++cardToken;
  const urls = c.images || [];
  urls.forEach((u) => { new Image().src = u; });   // start loading them all, so slideshow flips never show a gap

  // Fill in and open the card only once its first image is ready. Until then
  // the old card's picture would sit next to the new text for a moment.
  const show = () => {
    if (token !== cardToken) return;   // walked on to another tree (or away) meanwhile
    field('title').textContent = c.title;
    field('date').textContent = c.date;
    field('tags').textContent = c.tags || '';
    field('tags').hidden = !c.tags;
    field('text').textContent = c.text;
    field('link').textContent = c.linkText || '';
    field('link').href = c.linkUrl || '#';
    field('key').hidden = !c.linkText;
    // style.display, not `hidden`: the img's Tailwind `block` class overrides `hidden`
    const img = field('img');
    img.style.display = urls.length ? '' : 'none';
    if (urls.length) {
      img.src = urls[0];
      img.alt = c.title;
    } else {
      img.removeAttribute('src');
    }
    if (urls.length > 1) {
      let i = 0;
      slideshow = setInterval(() => {
        i = (i + 1) % urls.length;
        img.src = urls[i];
      }, SLIDE_MS);
    }
    card.dataset.open = 'true';
    if (project) {
      visited.add(project.id);
      updateProgress();
    }
  };
  if (!urls.length) return show();
  const first = new Image();
  first.src = urls[0];
  first.decode().then(show, show);   // a broken image still shows the card, just without it
}

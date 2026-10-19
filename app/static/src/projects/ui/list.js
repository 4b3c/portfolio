// "Just show me a list": every project as a plain card, newest first.
import { TAGS, lastYear } from '../config.js';
import { projectsLoaded } from '../assets.js';

export const list = document.getElementById('list');
const listItems = document.getElementById('list-items');
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function showList() {
  projectsLoaded.then(renderList);
  list.hidden = false;
  list.scrollTop = 0;
}

// Sizes a list image to its card, always showing the whole image, on the
// left. The image starts as tall as the text, at its own shape. That width
// narrows the text column, which can wrap to an extra line and get taller,
// so the image grows again to match, and so on. It only ever grows, so it
// settles in a few steps, at worst a little taller than the text, which
// just leaves some cream space under the text instead of a band beside the
// image. MAX_SIDE caps how much of the card it can take. Phone-width cards
// put the image on top, full width.
const MAX_SIDE = 0.6;
const sideBySide = window.matchMedia('(min-width: 640px)');
let fitted = [];
function fitImage(item, frame, body, img) {
  // the image can finish loading before the card is on the page, when
  // there's nothing to measure yet; the ResizeObserver below fits it once it is
  if (!img.naturalWidth || !item.isConnected || !item.clientWidth) return;
  const ratio = img.naturalWidth / img.naturalHeight;
  if (!sideBySide.matches) {
    frame.style.width = '';
    frame.style.height = '';
    frame.style.aspectRatio = String(ratio);
    return;
  }
  frame.style.aspectRatio = 'auto';
  const max = Math.floor(item.clientWidth * MAX_SIDE);
  let width = Math.min(Math.ceil(body.offsetHeight * ratio), max);
  for (let i = 0; i < 8; i++) {
    frame.style.width = width + 'px';
    frame.style.height = Math.round(width / ratio) + 'px';  // whole pixels: no slivers
    const needed = Math.ceil(body.offsetHeight * ratio);
    if (needed <= width || width >= max) break;
    width = Math.min(needed, max);
  }
  // The frame is the image's shape to within a pixel, so the image fills it
  // edge to edge (trimming at most a fraction of a pixel).
  img.style.objectFit = 'cover';
}

// Re-fit whenever a card's text box changes size: when it first lands on the
// page, when the window resizes, or when the image's width rewraps the text.
const refit = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const args = fitted.find((f) => f[2] === entry.target);
    if (args) fitImage(...args);
  }
});

function renderList(projects) {
  listItems.replaceChildren();
  refit.disconnect();
  fitted = [];
  // most recently worked on first (falls back to the start date)
  const newest = [...projects].sort((a, b) => (b.updated || b.start).localeCompare(a.updated || a.start));
  for (const p of newest) {
    const item = el('article', 'overflow-hidden rounded border-4 border-[#28201e] bg-[#f4ead2] text-[#28201e] shadow-[6px_6px_0_rgba(0,0,0,0.25)] sm:flex');
    const body = el('div', 'min-w-0 flex-1 p-4 sm:self-start');
    if (p.images?.length) {
      // The whole image, never cropped. Side by side, the frame is as tall as
      // the text and as wide as the image's shape needs (up to half the card);
      // on narrow screens it sits on top at full width. See fitImage().
      const frame = el('div', 'relative w-full shrink-0 overflow-hidden border-b-4 border-[#28201e] sm:w-48 sm:border-b-0 sm:border-r-4');
      frame.style.aspectRatio = '16 / 9';     // until the image loads and says its real shape
      const img = el('img', 'absolute inset-0 h-full w-full object-contain');
      img.addEventListener('load', () => fitImage(item, frame, body, img));
      img.src = p.images[0];
      img.alt = p.title;
      img.loading = 'lazy';
      frame.append(img);
      item.append(frame);
      fitted.push([item, frame, body, img]);
      refit.observe(body);
    }
    body.append(
      el('p', 'text-xs uppercase tracking-wide opacity-60', lastYear(p)),
      el('h2', 'mt-0.5 font-bold leading-snug', p.title),
      el('p', 'mt-1 text-xs opacity-70', p.tags.map((k) => TAGS[k]).join(' · ')),
      el('p', 'mt-2 text-sm leading-relaxed', p.description),
    );
    if (p.linkUrl) {
      const a = el('a', 'mt-3 inline-block text-sm font-semibold underline decoration-2 underline-offset-2 hover:text-[#aa3220]', p.linkText + ' ↗');
      a.href = p.linkUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      body.append(a);
    }
    item.append(body);
    listItems.append(item);
  }
}

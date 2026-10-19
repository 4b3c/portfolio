// A walkable world of projects: one tree per project, oldest in the west and
// newest in the east, each at a random height on every load. One cobblestone
// trail winds past them all, through the clearing you start in.
// Walking up to a tree shows that project's card.
import { FONT } from './font.js';
import { makeArcade } from './tetris.js';

(function () {
  const {
    PIXEL, PALETTES, TRUNK_WIDTH_POWER,
    Tree, count, renderLayers, outline, toCanvas, makeSprites, EXPLORER, GIRL, ROBOT, RANGER, SCOUT, VOYAGER, SKATER, SAGE,
  } = window.PixelTree;

  // --- world ------------------------------------------------------------
  const TILE = 64;
  const COLS = 72;
  const ROWS = 52;
  const SPAWN = [COLS / 2, ROWS / 2];    // where the player starts
  const SPAWN_CLEARING = 7;              // no trees within this many tiles of it
  // How much room each size of tree keeps around its trunk (cols, rows): two
  // trunks stay at least their two rooms apart. Two mediums keep 8 x 5.
  const ROOM = {
    huge: [6.5, 4], large: [5, 3], medium: [4, 2.5], small: [3, 2], tiny: [2.5, 1.5],
  };
  const TOP_ROW = 13;                    // the tallest trees need ~11 rows of sky above them

  // Bigger trees than the forest page: longer branches that shrink more slowly
  // with age (falloff), and a bigger box to draw them in. Each project's seed and
  // age live in projects.json, picked so tree height matches the effort tier.
  const BIG_TREE = {
    minLen: 14, maxLen: 44, startLen: 50, falloff: 0.5, maxNodes: 250,
    box: [960, 900], base: [480, 830],
  };
  const [BOX_W, BOX_H] = BIG_TREE.box;
  const BASE = BIG_TREE.base;

  // leaves show where a project stands
  const STATUS = {
    active:    { palette: 'green', leaves: true },
    parked:    { palette: 'autumn', leaves: true },
    complete:  { palette: 'cherry', leaves: true },
    abandoned: { palette: 'green', leaves: false },
  };

  // Each tree grows one step every n ticks, with n picked at random per tree, so
  // some grow fast and some slow. Redrawing a tree is the slow part, so trees
  // that changed wait their turn: each frame redraws as many as fit in the
  // budget, on-screen ones first.
  const MIN_TICKS = 1, MAX_TICKS = 10;
  const RENDER_BUDGET_MS = 6;
  const CARD_DISTANCE = 170;             // how close to a trunk before its card shows

  // --- player -------------------------------------------------------------
  const WALK_SPEED = 220;
  const RUN_SPEED = 420;
  const PLAYER_RADIUS = 8;
  const ANIM_FPS = 8;
  const CAMERA_EASE = 8;

  // --- trails -------------------------------------------------------------
  const MATERIALS = {
    // rounded cobbles set in earth, at grass level
    path: { style: 'cobble',
      base: [152, 152, 148], dark: [136, 136, 132], light: [172, 172, 166], gap: [118, 110, 94],
      edge: [128, 120, 102] },  // earthy, like the soil between the stones, not a grey shadow
    // the pale packed earth of the clearings at spawn and the cabin
    trailhead: { style: 'dirt',
      base: [222, 206, 160], edge: [198, 180, 132], dark: [200, 182, 136], light: [236, 224, 186] },
  };
  const MAT_INDEX = Object.fromEntries(Object.keys(MATERIALS).map((k, i) => [k, i]));
  const MAT_NAMES = Object.keys(MATERIALS);
  const TRAIL_REACH = [3, 4];            // the trail passes within this many tiles of each trunk (picked per tree)

  // Each project is tagged with the kinds of work in it, in projects.json.
  const TAGS = { coding: 'coding', mechanical: 'CAD & hardware', work: 'work' };
  // The last year I worked on a project seriously: the end of its date range
  // ("2023 - 2024" is 2024), or for one still going ("2024 - now"), the year
  // it was last updated.
  const lastYear = (p) => {
    const end = p.date.split('-').pop().trim();
    return end === 'now' ? (p.updated || p.start).slice(0, 4) : end;
  };

  // --- signs --------------------------------------------------------------
  const SIGN = {
    border: [96, 62, 34, 255], board: [184, 132, 78, 255], grain: [164, 114, 64, 255],
    text: [70, 44, 24, 255], post: [120, 80, 44, 255], outline: [40, 30, 30, 255],
  };

  // --- the cabin ----------------------------------------------------------
  // A log cabin out in the woods whose mailbox is the contact form, with a
  // clearing in front where a sign for each of these stands. Walking up to a
  // sign shows its card; E opens the link.
  const SOCIALS = [
    { sign: 'GITHUB', title: 'GitHub', note: 'All my code, old and new.', url: 'https://github.com/4b3c' },
    { sign: 'LINKEDIN', title: 'LinkedIn', note: 'Where I work and what I study.', url: 'https://www.linkedin.com/in/abram-pierce' },
    { sign: 'INSTAGRAM', title: 'Instagram', note: "What I'm up to.", url: 'https://www.instagram.com/abrammonia/' },
    { sign: 'EMAIL', title: 'Email', note: 'Or write to me directly.', url: 'mailto:awpierc2@asu.edu' },
  ];
  const TRAILHEAD_CLEARING = [2.8, 1.9]; // the spawn clearing's radii, in tiles
  const CABIN_CLEARING = [6, 3.5];       // the cabin's
  const CABIN_TREE_AGE = 380;            // how big the tree beside the cabin grows
  const SOCIAL_REACH = 80;               // how close to a sign before its card shows
  const WELCOME_REACH = 110;             // how close to the welcome sign before its guide shows
  const CABIN_DISTANCE = 16;             // tiles from spawn, at least: off screen when you start
  const CABIN = {
    ridge: [190, 106, 72, 255], roofLight: [174, 88, 60, 255], roof: [158, 76, 52, 255], roofShade: [142, 66, 46, 255],
    roofDark: [118, 54, 38, 255], eave: [92, 42, 30, 255],
    logLight: [178, 122, 72, 255], log: [150, 98, 56, 255], logDark: [112, 72, 40, 255], logEnd: [204, 160, 104, 255],
    logShadow: [92, 58, 32, 255],                                     // under the eave
    frame: [70, 44, 24, 255], door: [112, 70, 40, 255], doorShadow: [84, 52, 28, 255], plank: [90, 56, 30, 255],
    knob: [232, 192, 92, 255], glass: [150, 198, 214, 255], glassShadow: [104, 150, 170, 255], shine: [214, 236, 240, 255],
    stoneLight: [170, 166, 156, 255], stone: [138, 136, 130, 255], stoneDark: [104, 102, 98, 255],
    mail: [72, 104, 150, 255], mailLight: [106, 140, 184, 255], mailDark: [50, 74, 110, 255], flag: [204, 52, 40, 255],
  };
  const DOOR_HALF = 4;                   // half the door's width, in art pixels: walking up into it goes inside
  const MAILBOX_REACH = 90;              // how close to the mailbox before the "reach out" card shows

  // --- inside the cabin ---------------------------------------------------
  // My workshop, front on like the cabin: the back wall's logs with a window,
  // a plank floor, and the doorway at the bottom. Each thing in it has
  // a card about me; the arcade machine plays Don't Get Squished (tetris.js).
  // Sizes are in art pixels.
  const CABIN_ROOM = { w: 160, h: 104, wall: 40, door: [72, 87] };   // wall: the back wall's height; door: the doorway's columns
  const FADE_S = 0.18;                   // the fade to black going in or out, each way
  const INSIDE = {
    plank: [186, 136, 84, 255], plankLight: [200, 152, 98, 255], plankDark: [164, 116, 68, 255], seam: [118, 78, 44, 255],
    rug: [78, 80, 86, 255], rugLight: [98, 100, 108, 255], rugEdge: [52, 54, 60, 255], mat: [120, 98, 60, 255],   // a rubber shop mat
    notes: [[244, 226, 140, 255], [236, 172, 172, 255], [170, 202, 236, 255], [244, 240, 230, 255]],
    books: [[170, 50, 30, 255], [60, 110, 160, 255], [70, 130, 70, 255], [210, 170, 70, 255], [120, 70, 130, 255], [220, 214, 196, 255]],
    screen: [20, 22, 30, 255], monitor: [52, 52, 62, 255], glow: [110, 180, 210, 255],
    rgb: [[230, 60, 160, 255], [80, 200, 240, 255], [140, 90, 240, 255]], board: [40, 130, 70, 255], led: [250, 80, 60, 255],
    cabinet: [64, 44, 96, 255], cabinetLight: [96, 66, 136, 255], cabinetDark: [42, 28, 66, 255], marquee: [232, 192, 92, 255],
    button: [40, 160, 220, 255],
    grass: [130, 170, 70, 255],
  };
  const TETRIS_COLOURS = [[230, 190, 0, 255], [10, 180, 60, 255], [210, 0, 0, 255], [0, 180, 200, 255]];

  // What each thing in the room says about me.
  const ABOUT = {
    bio: {
      title: 'About me', date: 'the bookshelf',
      text: "Thanks for peeping my website. Here's a little about me. I love creating things, whether its a website, a CAD model, a circuit, or tying all three together.\n\nI started tinkering as a kid in Kenya, building fans for my room, powered by a solar panel, building a mini hydropics system with water bottles and minows I caught in a lake (RIP) (they did not last long), or my LEGO city I worked on every day for years. Eventually I moved back to the states, saved up, and bought a LEGO mindstorms kit, which introduced me to technology in the most tangible way I had ever experienced. I learned programming, gear ratios, structural integrity, and this sparked my love for science and technology.\n\nMy dream is to continue building until I have the means to integrate STEM education infrastructure around the world. My side quest dream is to be a part of building more walkable and sustainable cities, and high speed railway across the US.\n\nAnyways, I hope you enjoyed checking out my website. Don't hesitate to reach out. Cya",
    },
    pc: {
      title: 'My PC specs', date: 'the desk',
      text: [
        'CPU: AMD Ryzen 7 9700X',
        'GPU: AMD Radeon RX 9060 XT, 16 GB VRAM',
        'RAM: 32 GB',
        'Motherboard: Gigabyte B650',
        'OS: Fedora',
      ].join('\n'),
    },
    arcade: {
      title: 'I also love video games', date: 'the arcade machine',
      text: "Factorio, Minecraft, Cities: Skylines are my favorite. Here's a surprise mini game. A JS port of a C++ game I made.",
    },
  };

  // --- trail pixel art ----------------------------------------------------
  // One art pixel of a trail at world art-pixel (wx, wy). Patterns use world
  // coordinates so they line up across tile boundaries.
  const hashXY = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const STONE = 6;  // art pixels per cobble
  function nearestStone(wx, wy) {
    const cx = Math.floor(wx / STONE), cy = Math.floor(wy / STONE);
    let best = { id: 0, d: Infinity };
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const sx = (cx + ox) * STONE + 0.5 + hashXY(cx + ox, cy + oy) * (STONE - 1);
        const sy = (cy + oy) * STONE + 0.5 + hashXY(cy + oy + 101, cx + ox) * (STONE - 1);
        const d = Math.hypot(wx - sx, wy - sy);
        if (d < best.d) best = { id: (cx + ox) * 7919 + (cy + oy), d };
      }
    }
    return best;
  }

  function trailPixel(mat, wx, wy) {
    const m = MATERIALS[mat];
    if (m.style === 'cobble') {
      // Every 6x6 block of art pixels holds one stone centre, jiggled about, and
      // each pixel belongs to the nearest centre. Where the pixel to the right or
      // below belongs to a different stone, it's the 1px line of earth between
      // them, which makes the stones round and uneven.
      const here = nearestStone(wx, wy);
      if (nearestStone(wx + 1, wy).id !== here.id || nearestStone(wx, wy + 1).id !== here.id) return m.gap;
      if (here.d < 1.3) return m.light;        // a soft highlight in the middle of each stone
      return hashXY(here.id, 37) < 0.35 ? m.dark : m.base;
    }
    // dirt: plain, with the odd speck
    const n = hashXY(wx, wy);
    return n < 0.04 ? m.dark : n < 0.06 ? m.light : m.base;
  }

  const canvas = document.getElementById('projects');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rgba = (c) => (c.length === 4 ? c : [...c, 255]);

  const grass = new Image();
  grass.src = canvas.dataset.grass;

  // --- map key -------------------------------------------------------------
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

  // --- intro: a welcome, then the world -------------------------------------
  // Everything else (choosing a character, the map key, the controls) is on the
  // welcome sign at spawn: see the guide below.
  const CHARACTERS = [
    { id: 'explorer', name: 'Explorer', look: EXPLORER },
    { id: 'wanderer', name: 'Wanderer', look: GIRL },
    { id: 'robot', name: 'Robot', look: ROBOT },
    { id: 'ranger', name: 'Ranger', look: RANGER },
    { id: 'scout', name: 'Scout', look: SCOUT },
    { id: 'voyager', name: 'Voyager', look: VOYAGER },
    { id: 'skater', name: 'Skater', look: SKATER },
    { id: 'sage', name: 'Sage', look: SAGE },
  ].map((c) => ({ ...c, sprites: makeSprites(c.look) }));

  let introOpen = true;                  // the world runs behind the intro, but you can't move yet
  let character = CHARACTERS[0];
  try {
    character = CHARACTERS.find((c) => c.id === localStorage.getItem('projects.character')) || character;
  } catch (e) { /* storage blocked */ }

  const intro = document.getElementById('intro');
  // While the welcome is up, nothing else is: no counter, contact or help
  // buttons, and no card or guide (updateCard checks introOpen). Visibility,
  // not display, so it doesn't undo the phone view hiding them for good.
  const hud = ['buttons'].map((id) => document.getElementById(id));
  const showHud = (on) => hud.forEach((el) => { el.style.visibility = on ? '' : 'hidden'; });
  showHud(false);
  function showIntro() {
    intro.style.display = '';
    introOpen = true;
    showHud(false);
    intro.querySelector('[data-start]').focus();
  }
  function startExploring() {
    intro.style.display = 'none';        // not `hidden`: the overlay's Tailwind `flex` class overrides it
    introOpen = false;
    showHud(true);
    document.activeElement?.blur();      // so Enter and E go to the world, not the button
  }
  intro.querySelector('[data-start]').addEventListener('click', startExploring);
  // clicking the dark area outside the panel starts too
  intro.addEventListener('click', (e) => { if (e.target === intro) startExploring(); });
  // and so does Enter
  window.addEventListener('keydown', (e) => {
    if (introOpen && list.hidden && e.code === 'Enter' && e.target.tagName !== 'BUTTON') startExploring();
  });

  // --- the welcome sign's guide ------------------------------------------------
  // Three pages in the corner, like a project's card: choose a character, the
  // map key, the controls. It shows when you walk up to the welcome sign (see
  // updateCard), or from anywhere with help or H, until you press it again or
  // walk up to something else. E flips to the next page.
  const guide = document.getElementById('guide');
  const PAGES = ['character', 'controls', 'about'];
  let page = 'character';
  let guidePinned = false;               // opened with help or H, not by the sign
  let pinnedNear = null;                 // what you were next to when it was opened ('new' until updateCard looks)
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
  const nextPage = () => showPage(PAGES[(PAGES.indexOf(page) + 1) % PAGES.length]);
  guide.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    showPage(b.dataset.tab);
    b.blur();                            // so the arrow keys go back to walking
  }));
  showPage(page);
  const toggleHelp = () => {
    guidePinned = !guidePinned;
    pinnedNear = 'new';
  };
  document.getElementById('help').addEventListener('click', (e) => {
    toggleHelp();
    e.currentTarget.blur();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && !introOpen && !contactOpen) toggleHelp();
    if (e.code === 'Escape') guidePinned = false;
  });

  // character picker: each choice shows its sprite walking toward you
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
      pick(c);
      button.blur();                     // so the arrow keys go back to walking
    });
    picker.append(button);
    return { c, button, ctx: preview.getContext('2d') };
  });
  function pick(c) {
    character = c;
    try { localStorage.setItem('projects.character', c.id); } catch (e) { /* storage blocked */ }
    for (const p of previews) {
      const on = p.c === c;
      p.button.style.borderColor = on ? '#28201e' : 'transparent';
      p.button.style.background = on ? '#fffaf0' : '';
      p.button.setAttribute('aria-pressed', String(on));
    }
  }
  pick(character);
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

  // --- the contact form (the cabin's mailbox) ---------------------------------
  // You can't walk while it's open, so typing in it doesn't move you.
  const contact = document.getElementById('contact');
  const contactForm = contact.querySelector('[data-form]');
  const contactSent = contact.querySelector('[data-sent]');
  const contactStatus = contact.querySelector('[data-status]');
  let contactOpen = false;
  let mailSent = false;                  // raises the flag on the mailbox
  function openContact() {
    contact.style.display = '';          // not `hidden`: its Tailwind `flex` class would override that
    contactOpen = true;
    contactForm.hidden = false;
    contactSent.hidden = true;
    contactStatus.hidden = true;
    contactForm.querySelector('input').focus();
  }
  function closeContact() {
    contact.style.display = 'none';
    contactOpen = false;
    document.activeElement?.blur();      // so the arrow keys go back to walking
  }
  contact.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeContact));
  contact.addEventListener('click', (e) => { if (e.target === contact) closeContact(); });
  window.addEventListener('keydown', (e) => { if (contactOpen && e.code === 'Escape') closeContact(); });

  function contactError(text) {
    contactStatus.textContent = text;
    contactStatus.style.color = '#aa3220';
    contactStatus.hidden = false;
  }
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();                  // send it with fetch instead, so the page stays put
    const send = contactForm.querySelector('[data-send]');
    send.disabled = true;
    send.textContent = 'sending…';
    try {
      const response = await fetch(contactForm.action, { method: 'POST', body: new FormData(contactForm) });
      const reply = await response.json().catch(() => ({}));
      if (!response.ok || !reply.ok) {
        contactError(reply.error || "Couldn't send that. Try again in a bit?");
        return;
      }
      mailSent = true;
      contactForm.reset();
      contactForm.hidden = true;
      contactSent.hidden = false;
      contactSent.querySelector('[data-close]').focus();
    } catch (err) {
      contactError("Couldn't reach the mailbox. Check your connection and try again?");
    } finally {
      send.disabled = false;
      send.textContent = 'send';
    }
  });

  // --- the arcade machine (in the cabin) ---------------------------------------
  // Don't Get Squished, in its own overlay. You can't walk while it's open.
  const arcade = makeArcade(document.getElementById('arcade'), canvas.dataset.blocks);

  // --- "just show me a list" --------------------------------------------------
  const list = document.getElementById('list');
  const listItems = document.getElementById('list-items');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
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
  const onPhone = window.matchMedia('(max-width: 640px), (pointer: coarse) and (not (any-pointer: fine))').matches;
  intro.querySelector('[data-list]').addEventListener('click', () => {
    loaded.then(renderList);
    intro.style.display = 'none';        // the list is see-through, so the intro would show between cards
    list.hidden = false;
    list.scrollTop = 0;
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
      loaded.then(renderList);
      list.hidden = false;
      list.scrollTop = 0;
    };
  }
  if (onPhone) showMobile();

  intro.querySelector('[data-start]').focus();

  // A small min-heap of (item, priority), for A*.
  class Heap {
    constructor() { this.items = []; this.prio = []; }
    get size() { return this.items.length; }
    push(item, p) {
      const { items, prio } = this;
      let i = items.length;
      items.push(item);
      prio.push(p);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (prio[parent] <= prio[i]) break;
        [items[i], items[parent]] = [items[parent], items[i]];
        [prio[i], prio[parent]] = [prio[parent], prio[i]];
        i = parent;
      }
    }
    pop() {
      const { items, prio } = this;
      const top = items[0];
      const lastItem = items.pop();
      const lastPrio = prio.pop();
      if (items.length) {
        items[0] = lastItem;
        prio[0] = lastPrio;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < items.length && prio[l] < prio[m]) m = l;
          if (r < items.length && prio[r] < prio[m]) m = r;
          if (m === i) break;
          [items[i], items[m]] = [items[m], items[i]];
          [prio[i], prio[m]] = [prio[m], prio[i]];
          i = m;
        }
      }
      return top;
    }
  }
  // projects marked "hidden": true in projects.json are left out of the forest and the list
  const loaded = fetch(canvas.dataset.projects)
    .then((r) => r.json())
    .then((list) => list.filter((p) => !p.hidden));
  loaded.then(start);

  function start(projects) {
    const WORLD_W = COLS * TILE;
    const WORLD_H = ROWS * TILE;
    const at = (c, r) => r * COLS + c;
    const inWorld = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;

    // --- place the cabin ----------------------------------------------------
    // Somewhere random, but well away from spawn so you have to go and find it.
    // It's placed first so the trees leave room for it and its clearing.
    let cc, cr;                                   // the cabin's middle tile
    do {
      cc = randint(CABIN_CLEARING[0] + 3, COLS - CABIN_CLEARING[0] - 4);
      cr = randint(TOP_ROW, ROWS - CABIN_CLEARING[1] - 4);
    } while (Math.hypot(cc - SPAWN[0], cr - SPAWN[1]) < CABIN_DISTANCE);
    const cabin = { x: cc * TILE + TILE / 2, y: cr * TILE + TILE - 8, sprite: makeCabin() };
    const doorX = cabin.x;                        // see makeCabin
    const mailbox = { x: cabin.x + 150, y: cabin.y + 4, down: makeMailbox(false), up: makeMailbox(true) };
    // a tree growing just behind one side of the cabin
    const treeSide = Math.random() < 0.5 ? -1 : 1;
    const cabinTreeAt = [cc + 3 * treeSide, cr - 1];

    // --- clearings ----------------------------------------------------------
    // Packed earth around spawn and in front of the cabin, in whole tiles: a
    // rough oval, solid in the middle, that breaks up toward its edge into a
    // scatter of tiles, more of them on the checkerboard's dark squares.
    const EDGE = [0.75, 1.3];   // solid out to here, scattered out to here (1 is the oval itself)
    const clearings = [
      { c: SPAWN[0] + 0.5, r: SPAWN[1] + 0.5, rx: TRAILHEAD_CLEARING[0], ry: TRAILHEAD_CLEARING[1] },
      { c: cc + 0.5, r: cr + 1.5, rx: CABIN_CLEARING[0], ry: CABIN_CLEARING[1] },   // mostly in front of the cabin
    ];
    const cabinClearing = clearings[1];
    // how far out a tile's middle is from a clearing's: the oval is at 1
    const depthIn = (cl, c, r) => Math.hypot((c + 0.5 - cl.c) / cl.rx, (r + 0.5 - cl.r) / cl.ry);
    const core = new Uint8Array(COLS * ROWS);     // which clearing a tile is in (1, 2, ...), or 0
    clearings.forEach((cl, k) => {
      for (let r = Math.floor(cl.r - cl.ry * EDGE[1]); r <= cl.r + cl.ry * EDGE[1]; r++) {
        for (let c = Math.floor(cl.c - cl.rx * EDGE[1]); c <= cl.c + cl.rx * EDGE[1]; c++) {
          if (!inWorld(c, r)) continue;
          const d = depthIn(cl, c, r);
          const odds = (EDGE[1] - d) / (EDGE[1] - EDGE[0]) + ((c + r) % 2 ? -0.25 : 0.25);
          if (d < EDGE[0] || (d < EDGE[1] && Math.random() < odds)) core[at(c, r)] = k + 1;
        }
      }
    });

    // The social signs stand scattered about the cabin's clearing: away from
    // its middle, but not out on the grass; and not on the cabin or the
    // mailbox, in front of the door, or on top of each other.
    const socials = SOCIALS.map((s) => ({ ...s, sign: makeSign(s.sign) }));
    const boxOf = (sprite, x, y, margin) => [
      x - (sprite.width * PIXEL) / 2 - margin, y - sprite.height * PIXEL - margin,
      x + (sprite.width * PIXEL) / 2 + margin, y + margin,
    ];
    const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const taken = [
      boxOf(cabin.sprite, cabin.x, cabin.y, 16),
      boxOf(mailbox.down, mailbox.x, mailbox.y, 16),
      [(cabinTreeAt[0] - 0.5) * TILE, (cabinTreeAt[1] - 0.5) * TILE, (cabinTreeAt[0] + 1.5) * TILE, (cabinTreeAt[1] + 1.25) * TILE],
      [doorX - 56, cabin.y, doorX + 56, cabin.y + 2 * TILE],   // the doorstep, and the way up to it
    ];
    for (const s of socials) {
      // if a crowded clearing leaves no room, slowly stop being fussy about where
      for (let tries = 0; ; tries++) {
        const fussy = tries < 2000;
        const x = Math.round(((cabinClearing.c + (Math.random() * 2 - 1) * cabinClearing.rx * EDGE[1]) * TILE) / PIXEL) * PIXEL;
        const y = Math.round(((cabinClearing.r + (Math.random() * 2 - 1) * cabinClearing.ry * EDGE[1]) * TILE) / PIXEL) * PIXEL;
        const [c, r] = [Math.floor(x / TILE), Math.floor(y / TILE)];
        if (!inWorld(c, r) || core[at(c, r)] !== 2) continue;            // on the clearing's earth
        const depth = depthIn(cabinClearing, c, r);
        if (depth < (fussy ? 0.4 : 0) || depth > (fussy ? 1 : EDGE[1])) continue;   // toward its edge, not out on a stray tile
        const box = boxOf(s.sign, x, y, 12);
        if (tries < 4000 && taken.some((t) => overlaps(box, t))) continue;
        Object.assign(s, { x, y });
        taken.push(box);
        break;
      }
    }

    // Trees keep out of the clearing (with room for their own sign post, two
    // tiles to the right) and out of the rows below it: a big tree's leaves
    // reach up about eight rows, and would hide the signs.
    const around = {
      c0: Math.floor(cabinClearing.c - cabinClearing.rx * EDGE[1]), c1: Math.floor(cabinClearing.c + cabinClearing.rx * EDGE[1]),
      r0: Math.floor(cabinClearing.r - cabinClearing.ry * EDGE[1]), r1: Math.floor(cabinClearing.r + cabinClearing.ry * EDGE[1]),
    };
    const nearCabin = (c, r) =>
      c >= around.c0 - 3 && c <= around.c1 + 1 && r >= Math.min(around.r0, cr - 4) && r <= around.r1 + 8;

    // --- scatter the trees --------------------------------------------------
    // Oldest on the left, newest on the right, roughly: in order of start date,
    // each project gets its own column, spread evenly across the map (evenly,
    // not by the calendar, or the busy recent years would pile up), then nudged
    // up to X_SHUFFLE columns either way so the order isn't perfect. The row is
    // random. Biggest first, so they get the pick of the space, and each size
    // keeps its own room (ROOM): two trees stand at least their two rooms apart,
    // so big trees spread out and small ones fill in between. If a layout gets
    // too crowded to finish, start over a little less fussy about spacing.
    const X_SHUFFLE = 10;
    const byDate = [...projects].sort((a, b) => a.start.localeCompare(b.start));
    const [X0, X1] = [6, COLS - 8];
    const column = new Map(byDate.map((p, i) => [p, Math.round(X0 + ((i + 0.5) / byDate.length) * (X1 - X0))]));
    const SIZE_ORDER = ['huge', 'large', 'medium', 'small', 'tiny'];
    const order = [...projects].sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
    let spots;
    for (let loosen = 1; ; loosen *= 0.92) {
      spots = new Map();
      for (const p of order) {
        const room = ROOM[p.size] || ROOM.medium;
        for (let tries = 0; tries < 500 && !spots.has(p); tries++) {
          const c = clamp(column.get(p) + randint(-X_SHUFFLE, X_SHUFFLE), X0, X1);
          const r = randint(TOP_ROW, ROWS - 4);
          if (Math.hypot(c - SPAWN[0], r - SPAWN[1]) < SPAWN_CLEARING || nearCabin(c, r)) continue;
          const crowded = [...spots].some(([q, [sc, sr]]) => {
            const other = ROOM[q.size] || ROOM.medium;
            return ((c - sc) / ((room[0] + other[0]) * loosen)) ** 2 + ((r - sr) / ((room[1] + other[1]) * loosen)) ** 2 < 1;
          });
          if (!crowded) spots.set(p, [c, r]);
        }
      }
      if (spots.size === projects.length) break;
    }

    // Trunks and sign posts block trails.
    const material = new Int8Array(COLS * ROWS).fill(-1);
    const blocked = new Uint8Array(COLS * ROWS);
    for (const p of projects) {
      const [c, r] = spots.get(p);
      blocked[at(c, r)] = 1;
      blocked[at(c + 2, r)] = 1;          // sign post
    }

    // Clearing tiles are packed earth: trails cross them cheaply and never claim them.
    for (let i = 0; i < core.length; i++) if (core[i]) material[i] = MAT_INDEX.trailhead;

    // a signpost at the top of the spawn clearing
    const trailSign = {
      x: SPAWN[0] * TILE + TILE / 2,
      y: (SPAWN[1] - 1) * TILE + TILE - 12,
      sign: makeSign('WELCOME'),
    };
    blocked[at(SPAWN[0], SPAWN[1] - 1)] = 1;

    // Trails can't run through the cabin (or behind its roof), its tree, the mailbox, or the sign posts.
    blocked[at(...cabinTreeAt)] = 1;
    for (let dr = -3; dr <= 0; dr++) {
      for (let dc = -1; dc <= 1; dc++) blocked[at(cc + dc, cr + dr)] = 1;
    }
    blocked[at(Math.floor(mailbox.x / TILE), cr)] = 1;
    for (const s of socials) blocked[at(Math.floor(s.x / TILE), Math.floor(s.y / TILE))] = 1;

    // --- trails -------------------------------------------------------------
    // A little random cost on every tile, so two loads don't route identically.
    // Kept small: most of a trail's character comes from TURN below.
    const wander = new Float32Array(COLS * ROWS).map(() => Math.random() * 0.3);
    // Turning costs as much as a few extra tiles, so trails run in long straight
    // stretches with a few deliberate corners instead of staircasing.
    const TURN = 3;
    // A tile right next to the trail costs extra, so where it loops back it
    // leaves a strip of grass instead of running alongside itself. Crossing straight over only pays it twice, once each side.
    const BESIDE = 4;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    // Cheapest 4-way route from a tile to anywhere within `reach` tiles of
    // another (A* over tile and heading); returns the tile it got to. Stepping
    // onto the trail is expensive, so it never merges, forks, or doubles back on
    // itself: where the next tree is back the way it came, it loops round on
    // fresh ground. It only meets itself at short crossings, and walking right
    // beside it costs extra too (BESIDE). The clearings are cheap to cross.
    function route(from, to, reach = 0) {
      const besideTrail = (i) => {
        const c = i % COLS, r = Math.floor(i / COLS);
        return DIRS.some(([dc, dr]) => {
          if (!inWorld(c + dc, r + dr)) return false;
          const j = at(c + dc, r + dr);
          return material[j] !== -1 && !core[j];
        });
      };
      const cost = (i) => {
        if (blocked[i]) return Infinity;
        if (core[i]) return 0.35;
        if (material[i] !== -1) return 6;
        return 1 + wander[i] + (besideTrail(i) ? BESIDE : 0);
      };
      const away = (i) => Math.hypot((i % COLS) - to[0], Math.floor(i / COLS) - to[1]);
      const guess = (i) => Math.max(0, away(i) - reach) * 0.35;
      // state = tile * 4 + heading
      const best = new Float32Array(COLS * ROWS * 4).fill(Infinity);
      const came = new Int32Array(COLS * ROWS * 4).fill(-1);
      const open = new Heap();
      const startI = at(...from);
      for (let d = 0; d < 4; d++) {
        best[startI * 4 + d] = 0;
        open.push(startI * 4 + d, guess(startI));
      }
      let end = -1;
      while (open.size) {
        const st = open.pop();
        const i = st >> 2, d = st & 3;
        if (away(i) <= reach) { end = st; break; }
        const c = i % COLS, r = Math.floor(i / COLS);
        DIRS.forEach(([dc, dr], nd) => {
          if (!inWorld(c + dc, r + dr)) return;
          const j = at(c + dc, r + dr);
          const g = best[st] + cost(j) + (nd === d ? 0 : TURN);
          const ns = j * 4 + nd;
          if (g < best[ns]) {
            best[ns] = g;
            came[ns] = st;
            open.push(ns, g + guess(j));
          }
        });
      }
      if (end === -1) return from;
      for (let st = end; st !== -1; st = came[st]) {
        const i = st >> 2;
        if (material[i] === -1) material[i] = MAT_INDEX.path;
      }
      return [(end >> 2) % COLS, Math.floor((end >> 2) / COLS)];
    }

    // The trail: join the two closest stops (the trees and the spawn clearing),
    // then the next two closest, and so on, skipping a stop already joined on
    // both sides, or a pair already on the same piece of trail (that would
    // close a loop). What's left is one trail through them all, walked from one
    // end. It comes within a few tiles of each trunk (TRAIL_REACH) and carries
    // on from wherever it got to.
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const stops = [{ at: SPAWN, reach: 0 }, ...projects.map((p) => ({ at: spots.get(p), reach: randint(...TRAIL_REACH) }))];
    const pairs = [];
    stops.forEach((a, i) => stops.forEach((b, j) => { if (i < j) pairs.push([i, j, dist(a.at, b.at)]); }));
    pairs.sort((x, y) => x[2] - y[2]);
    const links = stops.map(() => []);
    const piece = stops.map((_, i) => i);         // which piece of trail each stop is on so far
    const pieceOf = (i) => (piece[i] === i ? i : (piece[i] = pieceOf(piece[i])));
    for (const [i, j] of pairs) {
      if (links[i].length === 2 || links[j].length === 2 || pieceOf(i) === pieceOf(j)) continue;
      links[i].push(j);
      links[j].push(i);
      piece[pieceOf(i)] = pieceOf(j);
    }
    const walk = [];
    for (let s = links.findIndex((l) => l.length < 2), prev = -1; s !== undefined;) {
      walk.push(stops[s]);
      [prev, s] = [s, links[s].find((n) => n !== prev)];
    }
    // it begins a few tiles out from its first stop, on the side away from the next
    const [first, next] = walk;
    const out = next && next.at[0] > first.at[0] ? -1 : 1;
    let here = [clamp(first.at[0] + out * first.reach, 0, COLS - 1), first.at[1]];
    for (const s of walk) here = route(here, s.at, s.reach);

    // And a path from the trailhead out to the cabin, routed last so it
    // doesn't pull the project trails off course. Left to itself it would take
    // one corner, so it goes by two: out along the longer way, across at a
    // random point partway, then on into the clearing, like a Z.
    {
      // It ends on the edge of the clearing that faces spawn, so the last
      // stretch comes straight in: through the side, or from above or below
      // through a gap beside the cabin or between the signs, never at the roof.
      const across = Math.abs(cc - SPAWN[0]) >= Math.abs(cr - SPAWN[1]);   // mostly sideways?
      const step = across ? [SPAWN[0] < cc ? -1 : 1, 0] : [0, SPAWN[1] < cr ? -1 : 1];   // toward spawn
      const edgeTiles = (strict) => {
        const edges = [];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const i = at(c, r), n = [c + step[0], r + step[1]];
            if (core[i] !== 2 || blocked[i] || depthIn(cabinClearing, c, r) >= EDGE[0]) continue;   // the solid middle
            if (!inWorld(...n) || blocked[at(...n)] || depthIn(cabinClearing, ...n) < EDGE[0]) continue;   // facing out of it
            if (strict && (across ? r < cr : Math.abs(c - cc) <= 2)) continue;    // not behind the cabin, or right by it
            edges.push([c, r]);
          }
        }
        return edges;
      };
      // a narrow clearing may have no edge to spare beside the cabin: then take any edge facing spawn
      const edges = edgeTiles(true).length ? edgeTiles(true) : edgeTiles(false);
      const goal = edges.length ? edges[randint(0, edges.length - 1)] : [cc, cr + 1];
      const [a, b] = across ? [0, 1] : [1, 0];   // a: the long way, b: the short way
      const turn = Math.round(SPAWN[a] + (goal[a] - SPAWN[a]) * (0.3 + Math.random() * 0.4));
      // if the short way is too short to see the jog, swing out a few tiles past the goal
      let side = goal[b];
      if (Math.abs(goal[b] - SPAWN[b]) < 4) side = clamp(goal[b] + (goal[b] >= SPAWN[b] ? 4 : -4), 2, (b ? ROWS : COLS) - 3);
      const corner1 = [], corner2 = [];
      corner1[a] = turn; corner1[b] = SPAWN[b];
      corner2[a] = turn; corner2[b] = side;
      // a corner can land on a trunk or post; use the nearest open tile instead
      const open = ([c, r]) => {
        for (let d = 0; d < 4; d++) {
          for (let dr = -d; dr <= d; dr++) {
            for (let dc = -d; dc <= d; dc++) if (inWorld(c + dc, r + dr) && !blocked[at(c + dc, r + dr)]) return [c + dc, r + dr];
          }
        }
        return [c, r];
      };
      const stops = [SPAWN, open(corner1), open(corner2), goal];
      for (let i = 1; i < stops.length; i++) route(stops[i - 1], stops[i]);
    }


    // --- path tiles -----------------------------------------------------------
    // Drawn once per tile and cached. Edges go ragged wherever a trail meets
    // grass, letting the grass tile underneath show through.
    const isTrail = (c, r) => inWorld(c, r) && material[at(c, r)] !== -1;
    const trailCanvases = new Map();
    function trailTile(c, r) {
      const key = at(c, r);
      if (trailCanvases.has(key)) return trailCanvases.get(key);
      const mat = MAT_NAMES[material[key]];
      const n = TILE / PIXEL;
      const img = new ImageData(n, n);
      const grassUp = !isTrail(c, r - 1), grassDown = !isTrail(c, r + 1);
      const grassLeft = !isTrail(c - 1, r), grassRight = !isTrail(c + 1, r);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const wx = c * n + x, wy = r * n + y;
          // how many art pixels to the nearest grass edge
          const edge = Math.min(
            grassUp ? y : n, grassDown ? n - 1 - y : n,
            grassLeft ? x : n, grassRight ? n - 1 - x : n
          );
          const roll = hashXY(wx + 9001, wy);
          let colour = trailPixel(mat, wx, wy);
          if (edge === 0) colour = roll < 0.55 ? null : MATERIALS[mat].edge;
          else if (edge === 1 && roll < 0.35) colour = MATERIALS[mat].edge;
          if (colour) img.data.set(rgba(colour), (y * n + x) * 4);
        }
      }
      const tile = toCanvas(img);
      trailCanvases.set(key, tile);
      return tile;
    }

    // --- grass ----------------------------------------------------------------
    // Same weighting as TileWorld's `grasses` list: tile i gets i // 2 + 1 tickets.
    const tickets = [];
    for (let i = 0; i < 7; i++) for (let k = 0; k <= Math.floor(i / 2); k++) tickets.push(i);
    const grassTile = new Uint8Array(COLS * ROWS).map(() => tickets[randint(0, tickets.length - 1)]);

    // --- signs ----------------------------------------------------------------
    // A wooden board with the project's name in the 3x6 pixel font, on a post.
    function makeSign(text) {
      const textW = text.length * 4 - 1;
      const boardW = textW + 6;
      const boardH = 9;
      const postH = 5;
      const img = new ImageData(boardW + 2, boardH + postH + 2);  // 1px border for the outline
      const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
      for (let y = 0; y < boardH; y++) {
        for (let x = 0; x < boardW; x++) {
          const edge = x === 0 || y === 0 || x === boardW - 1 || y === boardH - 1;
          set(x, y, edge ? SIGN.border : y === 4 && hashXY(x, text.length) < 0.3 ? SIGN.grain : SIGN.board);
        }
      }
      [...text].forEach((ch, i) => {
        const glyph = FONT[ch] || FONT[ch.toUpperCase()];
        if (!glyph) return;
        glyph.slice(0, 5).forEach((row, gy) => [...row].forEach((px, gx) => {
          if (px === '#') set(3 + i * 4 + gx, 2 + gy, SIGN.text);
        }));
      });
      const postX = Math.floor(boardW / 2) - 1;
      for (let y = boardH; y < boardH + postH; y++) {
        set(postX, y, SIGN.post);
        set(postX + 1, y, SIGN.border);
      }
      return toCanvas(outline(img, SIGN.outline));
    }

    // A log cabin, front on, with its gable end facing you. The roof's two
    // slopes run back from the peaked front edge to a ridge, so you see its
    // depth (like the houses in Stardew Valley): the left slope in light, the
    // right in shade. Under the front edge, the gable has a little window; the
    // wall below has a door in the middle between two windows. The door's
    // middle is the sprite's middle (doorX).
    function makeCabin() {
      const W = 64, H = 58;
      const PEAK = [31.5, 14];                     // the top of the roof's front edge
      const SLOPE = 0.75;                          // rows down per column out from the peak
      const DEPTH = 12;                            // how far back the roof runs, in rows
      const WALL = [5, 58];                        // the wall's columns
      const img = new ImageData(W + 2, H + 2);     // 1px border for the outline
      const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
      const box = (x0, y0, x1, y1, colour) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, colour);
      };
      const front = (x) => Math.floor(PEAK[1] + Math.abs(x - PEAK[0]) * SLOPE);   // the roof's front edge in column x
      const stone = (x, y, light) => (hashXY(x, y + 77) < 0.3 ? CABIN.stoneDark : light ? CABIN.stoneLight : CABIN.stone);

      // the wall, gable and all, in logs, shaded just under the roof
      for (let x = WALL[0]; x <= WALL[1]; x++) {
        for (let y = front(x) + 3; y <= 55; y++) {
          const shaded = y <= front(x) + 4;
          set(x, y, shaded ? CABIN.logShadow : [CABIN.logLight, CABIN.log, CABIN.logDark][y % 3]);
        }
      }
      // log ends poking out at the corners, under the eaves
      for (let y = 40; y <= 55; y++) {
        for (const x of [3, 4, WALL[1] + 1, WALL[1] + 2]) set(x, y, y % 3 === 2 ? CABIN.logDark : CABIN.logEnd);
      }
      for (let x = 3; x <= WALL[1] + 2; x++) {    // the foundation
        set(x, 56, stone(x, 56, true));
        set(x, 57, stone(x, 57, false));
      }

      // the roof: each slope in courses running back from the front edge, with
      // staggered seams; a light ridge down the middle; a dark board along the front
      for (let x = 0; x < W; x++) {
        const lit = x < 32;
        for (let y = front(x) - DEPTH; y < front(x); y++) {
          const back = front(x) - 1 - y;            // rows back from the front edge
          const course = Math.floor(back / 3);
          let colour = lit ? CABIN.roof : CABIN.roofShade;
          if (back % 3 === 2) colour = lit ? CABIN.roofDark : CABIN.eave;
          else if (back % 3 === 0) colour = lit ? CABIN.roofLight : CABIN.roof;
          else if ((x + course * 3) % 6 === 0) colour = lit ? CABIN.roofDark : CABIN.eave;
          if (x === 31 || x === 32) colour = lit ? CABIN.ridge : CABIN.roofLight;
          set(x, y, colour);
        }
        set(x, front(x), CABIN.roofDark);
        set(x, front(x) + 1, CABIN.eave);
        set(x, front(x) + 2, CABIN.eave);
      }

      // the chimney, standing on the lit slope: a lit front, a shaded side, a dark cap
      for (let y = 3; y <= 17; y++) {
        for (let x = 15; x <= 20; x++) set(x, y, y <= 4 || x >= 19 ? CABIN.stoneDark : stone(x, y, true));
      }

      // windows, set in: shade along the top and left of the glass, a glint, a sill
      const windowAt = (x0, y0, w, h, sill) => {
        box(x0, y0, x0 + w - 1, y0 + h - 1, CABIN.frame);
        box(x0 + 1, y0 + 1, x0 + w - 2, y0 + h - 2, CABIN.glass);
        box(x0 + 1, y0 + 1, x0 + w - 2, y0 + 1, CABIN.glassShadow);
        box(x0 + 1, y0 + 1, x0 + 1, y0 + h - 2, CABIN.glassShadow);
        const mx = x0 + Math.floor(w / 2), my = y0 + Math.floor(h / 2);
        box(mx, y0 + 1, mx, y0 + h - 2, CABIN.frame);
        box(x0 + 1, my, x0 + w - 2, my, CABIN.frame);
        set(mx + 2, my - 2, CABIN.shine);
        if (!sill) return;
        box(x0 - 1, y0 + h, x0 + w, y0 + h, CABIN.logEnd);
        box(x0, y0 + h + 1, x0 + w - 1, y0 + h + 1, CABIN.logShadow);
      };
      windowAt(9, 40, 10, 9, true);
      windowAt(45, 40, 10, 9, true);
      windowAt(28, 23, 8, 8, false);               // up in the gable

      // the door, set in, in planks, with a brass knob and a stone step
      box(27, 39, 36, 55, CABIN.frame);
      box(28, 40, 35, 55, CABIN.door);
      box(28, 40, 35, 40, CABIN.doorShadow);
      box(28, 40, 28, 55, CABIN.doorShadow);
      box(31, 41, 31, 55, CABIN.plank);
      box(34, 41, 34, 55, CABIN.plank);
      set(33, 48, CABIN.knob);
      box(25, 56, 38, 56, CABIN.stoneLight);
      box(24, 57, 39, 57, CABIN.stone);

      return toCanvas(outline(img, SIGN.outline));
    }

    // A mailbox on a post, its red flag up once you've sent a note.
    function makeMailbox(flagUp) {
      const W = 10, H = 15;
      const img = new ImageData(W + 2, H + 2);
      const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
      for (let y = 7; y < H; y++) {
        set(3, y, SIGN.post);
        set(4, y, SIGN.border);
      }
      for (let y = 1; y < 7; y++) {
        for (let x = 0; x < 8; x++) {
          if (y === 1 && (x === 0 || x === 7)) continue;          // rounded top
          set(x, y, y === 1 ? CABIN.mailLight : y === 6 || x === 0 ? CABIN.mailDark : CABIN.mail);
        }
      }
      if (flagUp) {
        for (let y = 0; y < 6; y++) set(8, y, SIGN.border);
        set(9, 0, CABIN.flag); set(9, 1, CABIN.flag);
      } else {
        set(8, 5, SIGN.border);
        set(8, 4, CABIN.flag); set(9, 4, CABIN.flag);
      }
      return toCanvas(outline(img, SIGN.outline));
    }

    // The inside of the cabin, everything that doesn't stand on the floor: the
    // back wall in logs with a window;
    // the plank floor with a rug; the side walls; and the front wall with the
    // doorway, grass showing through it.
    function makeRoom() {
      const { w: W, h: H, wall: WALL, door: DOOR } = CABIN_ROOM;
      const img = new ImageData(W, H);
      const set = (x, y, colour) => img.data.set(colour, (y * W + x) * 4);
      const box = (x0, y0, x1, y1, colour) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, colour);
      };

      // the back wall's logs, shaded under the ceiling, and a baseboard
      for (let y = 0; y < WALL; y++) {
        for (let x = 0; x < W; x++) set(x, y, y < 3 ? CABIN.logShadow : [CABIN.logLight, CABIN.log, CABIN.logDark][y % 3]);
      }
      box(0, WALL, W - 1, WALL + 1, CABIN.frame);

      // the floor: planks six rows wide, their ends staggered, with the odd darker board
      for (let y = WALL + 2; y < H; y++) {
        const plank = Math.floor((y - WALL - 2) / 6);
        for (let x = 0; x < W; x++) {
          const end = (x + plank * 11) % 27 === 0;
          const shade = hashXY(Math.floor((x + plank * 11) / 27), plank);
          let colour = shade < 0.25 ? INSIDE.plankDark : shade > 0.8 ? INSIDE.plankLight : INSIDE.plank;
          if ((y - WALL - 2) % 6 === 5 || end) colour = INSIDE.seam;
          set(x, y, colour);
        }
      }

      // a rug in the middle, with a border and a band of light near its edge
      const rug = [52, 58, 107, 86];
      for (let y = rug[1]; y <= rug[3]; y++) {
        for (let x = rug[0]; x <= rug[2]; x++) {
          const inset = Math.min(x - rug[0], rug[2] - x, y - rug[1], rug[3] - y);
          set(x, y, inset === 0 ? INSIDE.rugEdge : inset === 2 ? INSIDE.rugLight : INSIDE.rug);
        }
      }
      box(DOOR[0] + 2, H - 9, DOOR[1] - 2, H - 5, INSIDE.mat);   // the doormat

      // the side walls, and the front wall either side of the doorway
      box(0, 0, 3, H - 1, CABIN.logDark);
      box(W - 4, 0, W - 1, H - 1, CABIN.logDark);
      box(4, 3, 4, H - 1, CABIN.logShadow);
      box(W - 5, 3, W - 5, H - 1, CABIN.logShadow);
      for (let y = H - 4; y < H; y++) {
        for (let x = 0; x < W; x++) set(x, y, x >= DOOR[0] && x <= DOOR[1] ? INSIDE.grass : y === H - 4 ? CABIN.logLight : CABIN.log);
      }
      box(DOOR[0] - 1, H - 4, DOOR[0] - 1, H - 1, CABIN.frame);
      box(DOOR[1] + 1, H - 4, DOOR[1] + 1, H - 1, CABIN.frame);

      // the window, set in like the cabin's, in the middle of the back wall
      const wx = 70, wy = 9, ww = 20, wh = 15;
      box(wx, wy, wx + ww - 1, wy + wh - 1, CABIN.frame);
      box(wx + 1, wy + 1, wx + ww - 2, wy + wh - 2, CABIN.glass);
      box(wx + 1, wy + 1, wx + ww - 2, wy + 1, CABIN.glassShadow);
      box(wx + 1, wy + 1, wx + 1, wy + wh - 2, CABIN.glassShadow);
      box(wx + ww / 2, wy + 1, wx + ww / 2, wy + wh - 2, CABIN.frame);
      box(wx + 1, wy + 7, wx + ww - 2, wy + 7, CABIN.frame);
      set(wx + ww / 2 + 3, wy + 4, CABIN.shine);
      set(wx + ww / 2 + 4, wy + 3, CABIN.shine);
      box(wx - 1, wy + wh, wx + ww, wy + wh, CABIN.logEnd);

      return toCanvas(img);
    }

    // A bookshelf: three shelves of books, all different heights and colours.
    function makeBookshelf() {
      const W = 24, H = 36;
      const img = new ImageData(W + 2, H + 2);
      const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const side = x < 2 || x >= W - 2 || y < 2;
          set(x, y, side ? CABIN.log : y % 11 >= 9 ? CABIN.logLight : CABIN.doorShadow);
        }
      }
      for (let shelf = 0; shelf < 3; shelf++) {
        const floor = shelf * 11 + 8;     // the row each shelf's books stand on
        let x = 2 + Math.floor(hashXY(shelf, 3) * 2);
        for (let i = 0; x < W - 3; i++) {
          const wide = 2 + (hashXY(shelf, i) < 0.4 ? 1 : 0);
          const tall = 5 + Math.floor(hashXY(i, shelf + 9) * 3);
          const colour = INSIDE.books[Math.floor(hashXY(i * 3, shelf * 7) * INSIDE.books.length)];
          for (let y = floor - tall + 1; y <= floor; y++) {
            for (let dx = 0; dx < wide; dx++) set(x + dx, y, y === floor - tall + 2 ? CABIN.logEnd : colour);
          }
          x += wide + (hashXY(i, shelf) < 0.2 ? 1 : 0);
        }
      }
      return toCanvas(outline(img, SIGN.outline));
    }

    // My desk: the monitor, the PC I built with its fans lit up, and a
    // breadboard with an LED on it.
    function makeDesk() {
      const W = 32, H = 24;
      const img = new ImageData(W + 2, H + 2);
      const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
      const box = (x0, y0, x1, y1, colour) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, colour);
      };
      // the monitor on its stand
      box(9, 0, 22, 9, INSIDE.monitor);
      box(10, 1, 21, 8, INSIDE.screen);
      for (let y = 2; y <= 7; y += 2) box(11, y, 11 + 3 + Math.floor(hashXY(y, 4) * 7), y, INSIDE.glow);   // lines of code
      box(15, 10, 16, 11, INSIDE.monitor);
      box(13, 11, 18, 11, INSIDE.monitor);
      // the tower, its glass side showing three lit fans
      box(24, 0, 31, 11, INSIDE.monitor);
      box(25, 1, 29, 10, INSIDE.screen);
      [2, 5, 8].forEach((y, i) => box(26, y, 28, y + 1, INSIDE.rgb[i]));
      set(30, 2, INSIDE.glow);                              // the power light
      // the breadboard, with an LED and a couple of wires
      box(0, 9, 6, 11, INSIDE.board);
      set(2, 8, INSIDE.led);
      set(1, 10, INSIDE.rgb[1]);
      set(4, 10, INSIDE.notes[0]);
      // the desktop, and the front with drawers on legs
      box(0, 12, W - 1, 13, CABIN.logEnd);
      box(0, 14, W - 1, 14, CABIN.logLight);
      box(1, 15, W - 2, 19, CABIN.log);
      box(2, 15, 2, H - 1, CABIN.logDark);
      box(W - 3, 15, W - 3, H - 1, CABIN.logDark);
      box(19, 16, 27, 18, CABIN.logLight);                  // a drawer
      set(23, 17, CABIN.knob);
      return toCanvas(outline(img, SIGN.outline));
    }

    // An arcade machine with a game of Tetris on its screen.
    function makeArcadeMachine() {
      const W = 18, H = 34;
      const img = new ImageData(W + 2, H + 2);
      const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
      const box = (x0, y0, x1, y1, colour) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, colour);
      };
      box(0, 0, W - 1, H - 1, INSIDE.cabinet);
      box(0, 0, 1, H - 1, INSIDE.cabinetLight);             // the lit side
      box(W - 2, 0, W - 1, H - 1, INSIDE.cabinetDark);
      box(2, 2, W - 3, 6, INSIDE.marquee);                  // the sign on top
      box(5, 4, W - 6, 4, CABIN.flag);
      box(3, 9, W - 4, 19, INSIDE.cabinetDark);
      box(4, 10, W - 5, 18, INSIDE.screen);
      // a few pieces stacked up on the screen
      [[5, 17, 0], [6, 17, 0], [7, 17, 1], [8, 17, 1], [8, 16, 1], [10, 17, 3], [11, 17, 3], [12, 17, 2], [11, 16, 2],
        [7, 12, 3], [8, 12, 3], [8, 13, 3]].forEach(([x, y, k]) => set(x, y, TETRIS_COLOURS[k]));
      box(1, 21, W - 2, 23, INSIDE.cabinetLight);           // the control panel
      set(5, 21, CABIN.flag);                               // the joystick
      set(5, 22, INSIDE.cabinetDark);
      set(10, 22, INSIDE.button);
      set(12, 22, INSIDE.marquee);
      box(3, 26, W - 4, 27, INSIDE.cabinetDark);            // the coin slot
      set(W / 2 - 1, 26, INSIDE.marquee);
      return toCanvas(outline(img, SIGN.outline));
    }

    // --- visited counter ------------------------------------------------------
    // A project counts as visited once its card has opened. The counter shows
    // visited/total (starts fresh every visit).
    const visited = new Set();
    const progress = document.querySelector('[data-progress]');
    function updateProgress() {
      progress.textContent = `${visited.size}/${projects.length}`;
    }
    updateProgress();

    // Clicking the counter shows arrows around the player, one toward each
    // project not visited yet, for a few seconds (and contact, toward the cabin).
    const POINT_MS = 3000;
    let pointing = { kind: null, until: 0 };
    document.querySelectorAll('[data-point]').forEach((b) => b.addEventListener('click', () => {
      pointing = { kind: b.dataset.point, until: performance.now() + POINT_MS };
      b.blur();   // so the arrow keys go back to walking
    }));

    // --- trees ----------------------------------------------------------------
    const trees = projects.map((p, i) => {
      const [c, r] = spots.get(p);
      const status = STATUS[p.status] || STATUS.active;
      return {
        project: p,
        x: c * TILE + TILE / 2,            // trunk base, in world px
        y: r * TILE + TILE - 16,
        signX: (c + 2) * TILE + TILE / 2,  // sign post foot
        signY: r * TILE + TILE - 12,
        sign: makeSign(p.sign),
        tree: new Tree(p.tree.seed, PALETTES[status.palette],
          { ...BIG_TREE, maxAge: p.tree.maxAge, leaves: status.leaves }),
        growing: true,
        every: randint(MIN_TICKS, MAX_TICKS),  // ticks between growth steps
        wait: randint(1, MAX_TICKS),           // so they don't all start on the same tick
        dirty: false,
        rendered: 0,
        layers: null,
        trunkR: 0,
      };
    });
    // The tree beside the cabin isn't a project: no sign, no card. It grows and
    // draws with the others (allTrees).
    const cabinTree = {
      x: cabinTreeAt[0] * TILE + TILE / 2,
      y: cabinTreeAt[1] * TILE + TILE - 16,
      tree: new Tree(randint(1, 9999999), PALETTES.green, { ...BIG_TREE, maxAge: CABIN_TREE_AGE, leaves: true }),
      growing: true, every: randint(MIN_TICKS, MAX_TICKS), wait: randint(1, MAX_TICKS),
      dirty: false, rendered: 0, layers: null, trunkR: 0,
    };
    const allTrees = [...trees, cabinTree];
    const boxLeft = (t) => t.x - BASE[0];
    const boxTop = (t) => t.y - BASE[1];

    let tick = 0;
    function updateTrees() {
      tick++;
      for (const t of allTrees) {
        if (!t.growing || --t.wait > 0) continue;
        t.wait = t.every;
        if (!t.tree.grow()) { t.growing = false; continue; }
        const nodes = count(t.tree.root);
        t.trunkR = nodes < 4 ? 0 : (nodes ** TRUNK_WIDTH_POWER) / 2 + 2;
        t.dirty = true;
      }

      // redraw changed trees: on screen first, then whichever has waited longest
      const todo = allTrees.filter((t) => t.dirty);
      todo.sort((a, b) => (onScreen(b) - onScreen(a)) || (a.rendered - b.rendered));
      const begin = performance.now();
      for (const t of todo) {
        if (performance.now() - begin > RENDER_BUDGET_MS) break;
        t.layers = renderLayers(t.tree);
        t.dirty = false;
        t.rendered = tick;
      }
    }

    // --- inside the cabin -------------------------------------------------------
    // The room has its own coordinates, in screen pixels from its top-left. The
    // furniture stands with its feet at (x, y), in art pixels, and keeps you off
    // its footprint (`blocks`, art pixels: x0, y0, x1, y1).
    const room = {
      floor: makeRoom(),
      w: CABIN_ROOM.w * PIXEL,
      h: CABIN_ROOM.h * PIXEL,
      furniture: [
        { sprite: makeBookshelf(), x: 18, y: 47, blocks: [5, 40, 31, 47] },
        { sprite: makeDesk(), x: 138, y: 51, blocks: [121, 40, 155, 51] },
        { sprite: makeArcadeMachine(), x: 146, y: 92, blocks: [136, 84, 156, 92] },
      ],
    };
    let inside = false;
    // Going in or out fades to black, swaps scenes, and fades back.
    let fade = 0;
    let fadeThen = null;                 // what to do once it's black
    const fadeTo = (then) => { if (!fadeThen) fadeThen = then; };
    function goInside() {
      fadeTo(() => {
        inside = true;
        player.x = ((CABIN_ROOM.door[0] + CABIN_ROOM.door[1] + 1) / 2) * PIXEL;
        player.y = (CABIN_ROOM.h - 8) * PIXEL;
        player.dir = 'up';
      });
    }
    function goOutside() {
      fadeTo(() => {
        inside = false;
        player.x = doorX;
        player.y = cabin.y + 28;
        player.dir = 'down';
        firstFrame = true;               // the camera jumps straight back to the door
      });
    }

    // --- player & input -------------------------------------------------------
    const player = { x: SPAWN[0] * TILE + TILE / 2, y: SPAWN[1] * TILE + TILE / 2, dir: 'down', anim: 0 };

    const keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (introOpen || contactOpen || arcade.isOpen) return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      keys.add(e.code);
      if ((e.code === 'KeyE' || e.code === 'Enter') && (nearest || guidePinned)) {
        e.preventDefault();              // or the E would land in the contact form as it opens
        if (guide.dataset.open === 'true') nextPage();
        else use(nearest.card);
      }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
    const held = (...codes) => codes.some((c) => keys.has(c));

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

    function movePlayer(dt) {
      if (introOpen || contactOpen || arcade.isOpen || fadeThen) { player.anim = 0; return; }
      const dx = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
      const dy = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
      if (!dx && !dy) { player.anim = 0; return; }

      if (dx) player.dir = dx > 0 ? 'right' : 'left';
      else player.dir = dy > 0 ? 'down' : 'up';

      const speed = held('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED;
      const len = Math.hypot(dx, dy);
      player.x += (dx / len) * speed * dt;
      player.y += (dy / len) * speed * dt;
      player.anim += dt * ANIM_FPS * (speed / WALK_SPEED);

      if (inside) {
        // the walls, the furniture, and out through the doorway at the bottom
        for (const f of room.furniture) {
          const [x0, y0, x1, y1] = f.blocks;
          pushOutBox(x0 * PIXEL - PLAYER_RADIUS, y0 * PIXEL, x1 * PIXEL + PLAYER_RADIUS, y1 * PIXEL + PLAYER_RADIUS / 2);
        }
        const inDoorway = player.x > CABIN_ROOM.door[0] * PIXEL + PLAYER_RADIUS && player.x < (CABIN_ROOM.door[1] + 1) * PIXEL - PLAYER_RADIUS;
        player.x = clamp(player.x, 5 * PIXEL + PLAYER_RADIUS, (CABIN_ROOM.w - 5) * PIXEL - PLAYER_RADIUS);
        player.y = clamp(player.y, (CABIN_ROOM.wall + 4) * PIXEL, (inDoorway ? CABIN_ROOM.h + 4 : CABIN_ROOM.h - 5) * PIXEL);
        if (player.y > CABIN_ROOM.h * PIXEL) goOutside();
        return;
      }

      for (const t of allTrees) {
        if (t.trunkR) pushOut(t.x, t.y, t.trunkR + PLAYER_RADIUS);
        if (t.sign) pushOut(t.signX, t.signY, 6 + PLAYER_RADIUS);
      }
      pushOut(trailSign.x, trailSign.y, 6 + PLAYER_RADIUS);
      for (const s of socials) pushOut(s.x, s.y, 6 + PLAYER_RADIUS);
      pushOut(mailbox.x, mailbox.y, 6 + PLAYER_RADIUS);
      pushOutBox(cabin.x - 108 - PLAYER_RADIUS, cabin.y - 40, cabin.x + 108 + PLAYER_RADIUS, cabin.y + PLAYER_RADIUS / 2);
      // walking up into the door goes straight in
      if (dy < 0 && Math.abs(player.x - doorX) < DOOR_HALF * PIXEL && player.y <= cabin.y + PLAYER_RADIUS / 2) goInside();
      player.x = clamp(player.x, 16, WORLD_W - 16);
      player.y = clamp(player.y, 48, WORLD_H - 8);
    }

    // --- the card -------------------------------------------------------------
    // Everything you can walk up to: each tree shows its project, each social
    // sign its link, and the mailbox asks you to reach out; inside, each thing in the room says something about me. All
    // share one card.
    const card = document.getElementById('card');
    const field = (name) => card.querySelector(`[data-${name}]`);
    const outsideMarks = [
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
    ];
    // inside, in the room's screen pixels: in front of each thing, and the doorway
    const artAt = (x, y) => ({ x: x * PIXEL, y: y * PIXEL });
    const insideMarks = [
      { ...artAt(18, 52), reach: 90, card: ABOUT.bio },
      { ...artAt(138, 56), reach: 90, card: ABOUT.pc },
      { ...artAt(140, 96), reach: 90, card: { ...ABOUT.arcade, arcade: true, linkText: 'play →' } },
    ];
    let nearest = null;
    let shown = null;

    // E (or clicking the card's link) follows it: the arcade machine, the
    // contact form, or a new tab (an email too, so a webmail handler like Gmail
    // doesn't replace the forest).
    function use(c) {
      if (c.arcade) { keys.clear(); arcade.open(); }
      else if (c.contact) openContact();
      else if (c.linkUrl) window.open(c.linkUrl, '_blank', 'noopener');
    }
    field('link').addEventListener('click', (e) => {
      if (!shown) return;
      e.preventDefault();
      use(shown.card);
    });

    // Projects with several images flip through them while their card is open.
    const SLIDE_MS = 2000;
    let slideshow = 0;
    let cardToken = 0;   // bumped each time the nearest tree changes

    function updateCard() {
      nearest = null;
      let best = Infinity;
      for (const l of inside ? insideMarks : outsideMarks) {
        const d = Math.hypot(player.x - l.x, (player.y - l.y) * 1.5);
        if (d < l.reach && d < best) { best = d; nearest = l; }
      }
      // The welcome sign opens the guide instead of a card. Help (or H) opens
      // it anywhere, until you walk up to something else.
      if (guidePinned) {
        if (pinnedNear === 'new') pinnedNear = nearest;
        else if (nearest !== pinnedNear) guidePinned = false;
      }
      const guideOpen = !introOpen && (guidePinned || Boolean(nearest?.guide));
      guide.dataset.open = String(guideOpen);
      const target = guideOpen || introOpen ? null : nearest;   // what the card shows
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

    // --- drawing --------------------------------------------------------------
    let w = 0;
    let h = 0;
    const cam = { x: 0, y: 0 };
    const shadows = document.createElement('canvas');
    const shadowsCtx = shadows.getContext('2d');

    const onScreen = (t) =>
      boxLeft(t) < cam.x + w && boxLeft(t) + BOX_W > cam.x &&
      boxTop(t) < cam.y + h && boxTop(t) + BOX_H > cam.y;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      shadows.width = w;
      shadows.height = h;
    }

    function drawGround(cx, cy) {
      const c0 = Math.max(Math.floor(cx / TILE), 0), c1 = Math.min(Math.ceil((cx + w) / TILE), COLS);
      const r0 = Math.max(Math.floor(cy / TILE), 0), r1 = Math.min(Math.ceil((cy + h) / TILE), ROWS);
      const grassReady = grass.complete && grass.naturalWidth;
      ctx.fillStyle = 'rgb(130, 170, 70)';
      for (let r = r0; r < r1; r++) {
        for (let c = c0; c < c1; c++) {
          const x = c * TILE - cx;
          const y = r * TILE - cy;
          if (grassReady) ctx.drawImage(grass, grassTile[at(c, r)] * TILE, 0, TILE, TILE, x, y, TILE, TILE);
          else ctx.fillRect(x, y, TILE, TILE);
          if (material[at(c, r)] !== -1) ctx.drawImage(trailTile(c, r), x, y, TILE, TILE);
        }
      }
    }

    // a little pixel oval on the shadow layer
    function footShadow(x, y, widths) {
      widths.forEach((wide, i) => {
        shadowsCtx.fillRect(x - (wide / 2) * PIXEL, y + (i - widths.length + 1) * PIXEL + 4, wide * PIXEL, PIXEL);
      });
    }

    function drawScene() {
      // The camera moves in single screen pixels, not whole art pixels, so the
      // grid can sit 0-7 device pixels off the screen's. Everything in the world
      // is still on the art-pixel grid, so it all shifts together.
      const cx = Math.round(cam.x * dpr) / dpr;
      const cy = Math.round(cam.y * dpr) / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawGround(cx, cy);

      // shadows share one layer so overlaps don't get darker
      shadowsCtx.clearRect(0, 0, w, h);
      shadowsCtx.imageSmoothingEnabled = false;
      shadowsCtx.fillStyle = '#000';
      const things = [];
      // a sprite standing with its feet at world (x, y), with a little shadow
      const stand = (sprite, x, y, shadow) => {
        const sx = x - cx, sy = y - cy;
        if (sx < -300 || sx > w + 300 || sy < -100 || sy > h + 200) return;
        footShadow(sx, sy, shadow);
        things.push({ y, draw: () => {
          ctx.drawImage(sprite, sx - (sprite.width * PIXEL) / 2, sy - sprite.height * PIXEL + PIXEL,
            sprite.width * PIXEL, sprite.height * PIXEL);
        } });
      };
      stand(trailSign.sign, trailSign.x, trailSign.y, [3, 5]);
      stand(cabin.sprite, cabin.x, cabin.y, [60, 64]);
      stand(mailSent ? mailbox.up : mailbox.down, mailbox.x, mailbox.y, [3, 5]);
      for (const s of socials) stand(s.sign, s.x, s.y, [3, 5]);
      for (const t of allTrees) {
        if (t.sign) stand(t.sign, t.signX, t.signY, [3, 5]);
        if (!t.layers || !onScreen(t)) continue;
        const left = boxLeft(t) - cx;
        const top = boxTop(t) - cy;
        const { shadow, shadowY, branches, leaves } = t.layers;
        shadowsCtx.drawImage(shadow, left, top + shadowY, shadow.width * PIXEL, shadow.height * PIXEL);
        things.push({ y: t.y, draw: () => {
          ctx.drawImage(branches, left, top, branches.width * PIXEL, branches.height * PIXEL);
          ctx.drawImage(leaves, left, top, leaves.width * PIXEL, leaves.height * PIXEL);
        } });
      }
      // the player is drawn where they really are, rounded only to a screen pixel
      const px = Math.round((player.x - cx) * dpr) / dpr;
      const py = Math.round((player.y - cy) * dpr) / dpr;
      footShadow(px, py, [4, 6, 4]);
      things.push({ y: player.y, draw: () => drawPlayer(px, py) });

      ctx.globalAlpha = PALETTES.green.shadow_color[3] / 255;
      ctx.drawImage(shadows, 0, 0, w, h);
      ctx.globalAlpha = 1;

      things.sort((a, b) => a.y - b.y);
      for (const thing of things) thing.draw();
      drawArrows(cx, cy);
    }

    // the player's sprite with its feet at screen (x, y)
    function drawPlayer(x, y) {
      const frames = character.sprites[player.dir];
      const sprite = frames[Math.floor(player.anim) % frames.length];
      ctx.drawImage(sprite, x - (sprite.width * PIXEL) / 2, y - sprite.height * PIXEL + PIXEL,
        sprite.width * PIXEL, sprite.height * PIXEL);
    }

    // Inside the cabin: the room in the middle of the screen, or following you
    // if the screen is smaller than it, with the furniture and you in front-to-back order.
    function drawRoom() {
      const offset = (screen, size, at) => (screen >= size ? (screen - size) / 2 : clamp(screen / 2 - at, screen - size, 0));
      const ox = Math.round(offset(w, room.w, player.x));
      const oy = Math.round(offset(h, room.h, player.y));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#1d1612';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(room.floor, ox, oy, room.w, room.h);

      const things = room.furniture.map((f) => ({ y: f.y * PIXEL, draw: () => {
        const { sprite } = f;
        ctx.drawImage(sprite, ox + f.x * PIXEL - (sprite.width * PIXEL) / 2, oy + f.y * PIXEL - sprite.height * PIXEL + PIXEL,
          sprite.width * PIXEL, sprite.height * PIXEL);
      } }));
      const px = Math.round((ox + player.x) * dpr) / dpr;
      const py = Math.round((oy + player.y) * dpr) / dpr;
      things.push({ y: player.y, draw: () => {
        ctx.globalAlpha = PALETTES.green.shadow_color[3] / 255;
        ctx.fillStyle = '#000';
        [4, 6, 4].forEach((wide, i) => ctx.fillRect(px - (wide / 2) * PIXEL, py + (i - 2) * PIXEL + 4, wide * PIXEL, PIXEL));
        ctx.globalAlpha = 1;
        drawPlayer(px, py);
      } });
      things.sort((a, b) => a.y - b.y);
      for (const thing of things) thing.draw();
    }

    // The counter's arrows: a ring around the player pointing at the nearest few
    // unvisited trees, the closest biggest. An arrow pointing almost the same way as a nearer one is left
    // out, so the ring stays readable. They fade out over the last half second.
    const MAX_ARROWS = 5;
    const MIN_GAP = (15 * Math.PI) / 180;
    function drawArrows(cx, cy) {
      const left = pointing.until - performance.now();
      if (left <= 0) return;
      const kind = pointing.kind;
      const px = player.x - cx;
      const py = player.y - cy - 28;          // around the middle of the sprite
      // the contact button points to the cabin, in the mailbox flag's red; the counter in the cards' cream
      const toCabin = kind === 'cabin';
      const [r, g, b] = toCabin ? CABIN.flag : [244, 234, 210];
      ctx.save();
      ctx.globalAlpha = Math.min(1, left / 500);
      ctx.lineJoin = 'round';
      const targets = (toCabin ? [cabin] : trees.filter((t) => !visited.has(t.project.id)))
        .map((t) => ({ angle: Math.atan2(t.y - player.y, t.x - player.x), d: Math.hypot(t.x - player.x, t.y - player.y) }))
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

    // --- main loop ------------------------------------------------------------
    let last = performance.now();
    let firstFrame = true;

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      movePlayer(dt);
      const tx = clamp(player.x - w / 2, 0, Math.max(WORLD_W - w, 0));
      const ty = clamp(player.y - h / 2, 0, Math.max(WORLD_H - h, 0));
      const ease = firstFrame ? 1 : 1 - Math.exp(-dt * CAMERA_EASE);
      cam.x += (tx - cam.x) * ease;
      cam.y += (ty - cam.y) * ease;
      firstFrame = false;

      updateTrees();
      updateCard();
      if (inside) drawRoom();
      else drawScene();

      // fade to black, swap scenes, fade back in
      if (fadeThen) {
        fade = Math.min(1, fade + dt / FADE_S);
        if (fade === 1) { fadeThen(); fadeThen = null; }
      } else {
        fade = Math.max(0, fade - dt / FADE_S);
      }
      if (fade) {
        ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
        ctx.fillRect(0, 0, w, h);
      }
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
  }

})();

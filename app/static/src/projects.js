// A walkable world of projects: one tree per project, scattered at random on every
// load. Three kinds of trail join the trees that share a kind of work: dirt for
// CAD and hardware, stone for coding, gravel for work (Luminosity Lab, PBB Lab).
// Walking up to a tree shows that project's card.
import { FONT } from './font.js';

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
  const SPACING = [8, 5];                // trunks stay at least this far apart (cols, rows)
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
  // Each kind of work gets its own material.
  const MATERIALS = {
    mechanical: { style: 'dirt', label: 'CAD & hardware',
      base: [200, 165, 105], edge: [176, 140, 84], dark: [170, 134, 80], light: [224, 194, 136] },
    // rounded cobbles set in earth, at grass level
    coding: { style: 'cobble', label: 'coding',
      base: [152, 152, 148], dark: [136, 136, 132], light: [172, 172, 166], gap: [118, 110, 94],
      edge: [128, 120, 102] },  // earthy, like the soil between the stones, not a grey shadow
    work: { style: 'gravel', label: 'work',
      base: [176, 168, 150], edge: [154, 146, 130], dark: [160, 152, 136], light: [192, 186, 170], darker: [140, 132, 118] },
    // the pale packed-earth clearing at spawn that every trail starts from
    trailhead: { style: 'dirt', label: 'trailhead',
      base: [222, 206, 160], edge: [198, 180, 132], dark: [200, 182, 136], light: [236, 224, 186] },
  };
  const KINDS = ['work', 'mechanical', 'coding'];  // routed in this order; earlier ones keep shared tiles
  const MAT_INDEX = Object.fromEntries(Object.keys(MATERIALS).map((k, i) => [k, i]));
  const MAT_NAMES = Object.keys(MATERIALS);

  // --- signs --------------------------------------------------------------
  const SIGN = {
    border: [96, 62, 34, 255], board: [184, 132, 78, 255], grain: [164, 114, 64, 255],
    text: [70, 44, 24, 255], post: [120, 80, 44, 255], outline: [40, 30, 30, 255],
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
    if (m.style === 'gravel') {
      const n = hashXY(wx, wy);
      // mostly plain, with sparse, soft specks
      return n < 0.03 ? m.darker : n < 0.15 ? m.dark : n < 0.24 ? m.light : m.base;
    }
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

  // Image paths in projects.json are either our own (/static/...) or relative
  // to the digitalQuiver site.
  const imageUrl = (path) =>
    path.startsWith('/') || /^https?:/.test(path) ? path : canvas.dataset.imageBase + path;

  // --- map key -------------------------------------------------------------
  // Swatches are drawn with the same pixel art as the world, so they match.
  for (const el of document.querySelectorAll('[data-swatch]')) {
    const img = new ImageData(8, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) img.data.set(rgba(trailPixel(el.dataset.swatch, x + 40, y + 40)), (y * 8 + x) * 4);
    }
    el.width = el.height = 8;
    el.getContext('2d').putImageData(img, 0, 0);
  }
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

  // --- intro: welcome, how it works, pick a character, controls -------------
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
  const slides = [...intro.querySelectorAll('[data-slide]')];
  let slide = 0;
  function showSlide(n) {
    slide = clamp(n, 0, slides.length - 1);
    slides.forEach((el, i) => { el.hidden = i !== slide; });
    slides[slide].querySelector('[data-next], [data-start]')?.focus();
  }
  intro.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => showSlide(slide + 1)));
  intro.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => showSlide(slide - 1)));
  function startExploring() {
    intro.style.display = 'none';        // not `hidden`: the overlay's Tailwind `flex` class overrides it
    introOpen = false;
  }
  intro.querySelector('[data-start]').addEventListener('click', startExploring);
  // the help button (or H) plays the intro again from the start
  function replayIntro() {
    intro.style.display = '';
    introOpen = true;
    showSlide(0);
  }
  document.getElementById('help').addEventListener('click', replayIntro);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && !introOpen) replayIntro();
  });
  // clicking the dark area outside the panel skips the intro, as the first character
  intro.addEventListener('click', (e) => {
    if (e.target !== intro) return;
    pick(CHARACTERS[0]);
    startExploring();
  });

  // character picker: each choice shows its sprite walking toward you
  const picker = document.getElementById('characters');
  const previews = CHARACTERS.map((c) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flex flex-col items-center gap-2 rounded border-4 p-3 font-bold hover:bg-white';
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
    button.addEventListener('click', () => pick(c));
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
    if (!introOpen) return;
    previewFrame = (previewFrame + 1) % 4;
    for (const p of previews) {
      const sprite = p.c.sprites.down[previewFrame];
      p.ctx.clearRect(0, 0, sprite.width, sprite.height);
      p.ctx.drawImage(sprite, 0, 0);
    }
  }, 1000 / ANIM_FPS);

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
        img.src = imageUrl(p.images[0]);
        img.alt = p.title;
        img.loading = 'lazy';
        frame.append(img);
        item.append(frame);
        fitted.push([item, frame, body, img]);
        refit.observe(body);
      }
      body.append(
        el('p', 'text-xs uppercase tracking-wide opacity-60', `${p.date} · ${p.status}`),
        el('h2', 'mt-0.5 font-bold leading-snug', p.title),
        el('p', 'mt-1 text-xs opacity-70', p.paths.map((k) => MATERIALS[k].label).join(' · ')),
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
  intro.querySelector('[data-list]').addEventListener('click', () => {
    loaded.then(renderList);
    intro.style.display = 'none';        // the list is see-through, so the intro would show between cards
    list.hidden = false;
    list.scrollTop = 0;
  });
  list.querySelector('[data-forest]').addEventListener('click', () => {
    list.hidden = true;
    intro.style.display = '';
    showSlide(0);
  });

  // Enter moves the intro along
  window.addEventListener('keydown', (e) => {
    if (!introOpen || !list.hidden || e.code !== 'Enter' || e.target.tagName === 'BUTTON') return;
    slides[slide].querySelector('[data-next], [data-start]')?.click();
  });
  showSlide(0);

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

    // --- scatter the trees --------------------------------------------------
    // Biggest first, so they get the pick of the space. If a layout gets too
    // crowded to finish, start over a little less fussy about spacing.
    const SIZE_ORDER = ['huge', 'large', 'medium', 'small', 'tiny'];
    const order = [...projects].sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
    let spots;
    for (let loosen = 1; ; loosen *= 0.92) {
      spots = new Map();
      for (const p of order) {
        for (let tries = 0; tries < 500 && !spots.has(p); tries++) {
          const c = randint(6, COLS - 8);
          const r = randint(TOP_ROW, ROWS - 4);
          if (Math.hypot(c - SPAWN[0], r - SPAWN[1]) < SPAWN_CLEARING) continue;
          const crowded = [...spots.values()].some(([sc, sr]) =>
            ((c - sc) / (SPACING[0] * loosen)) ** 2 + ((r - sr) / (SPACING[1] * loosen)) ** 2 < 1);
          if (!crowded) spots.set(p, [c, r]);
        }
      }
      if (spots.size === projects.length) break;
    }

    // Trunks and sign posts block trails. Trails pass beside trees rather than
    // ending at them: each kind a tree belongs to gets its own side of the trunk
    // to pass on, so a tree with two kinds stands where two trails meet, and one
    // with three has trails running around it. `near` marks the ring of tiles
    // around each trunk, so a trail can keep its distance from trees that aren't
    // its kind (otherwise it looks like it belongs to them too).
    const material = new Int8Array(COLS * ROWS).fill(-1);
    const blocked = new Uint8Array(COLS * ROWS);
    const near = new Int16Array(COLS * ROWS).fill(-1);
    const SIDES = [[-1, 0], [0, 1], [1, 1]];  // left of the trunk, below it, below-right
    const passBy = new Map();                  // project -> { kind: tile the trail passes through }
    projects.forEach((p, k) => {
      const [c, r] = spots.get(p);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) if (inWorld(c + dc, r + dr)) near[at(c + dc, r + dr)] = k;
      }
      blocked[at(c, r)] = 1;
      blocked[at(c + 2, r)] = 1;          // sign post
      const turn = randint(0, SIDES.length - 1);
      passBy.set(p, Object.fromEntries(p.paths.map((kind, i) => {
        const [dc, dr] = SIDES[(turn + i) % SIDES.length];
        return [kind, [c + dc, r + dr]];
      })));
    });

    // The trailhead: a small clearing around the spawn point with a signpost on
    // its top row. Every trail starts in the middle of it and heads out on
    // whichever side faces its first tree, so no trail starts on bare grass.
    const TRAILHEAD = { cols: [-2, 2], rows: [-1, 1] };   // tiles around SPAWN
    for (let dr = TRAILHEAD.rows[0]; dr <= TRAILHEAD.rows[1]; dr++) {
      for (let dc = TRAILHEAD.cols[0]; dc <= TRAILHEAD.cols[1]; dc++) {
        material[at(SPAWN[0] + dc, SPAWN[1] + dr)] = MAT_INDEX.trailhead;
      }
    }
    const trailSign = {
      x: SPAWN[0] * TILE + TILE / 2,
      y: (SPAWN[1] - 1) * TILE + TILE - 12,
      sign: makeSign('WELCOME'),
    };
    blocked[at(SPAWN[0], SPAWN[1] - 1)] = 1;

    // --- trails -------------------------------------------------------------
    // A little random cost on every tile, so two loads don't route identically.
    // Kept small: most of a trail's character comes from TURN below.
    const wander = new Float32Array(COLS * ROWS).map(() => Math.random() * 0.3);
    // Turning costs as much as a few extra tiles, so trails run in long straight
    // stretches with a few deliberate corners instead of staircasing.
    const TURN = 3;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    // Cheapest 4-way route between two tiles (A* over tile and heading).
    // Following a trail of the same kind is cheap, so trails merge. Stepping onto
    // another kind's trail is expensive, so different kinds only meet at short
    // crossings instead of running together (where one would hide the other).
    function route(from, to, kind) {
      const mine = MAT_INDEX[kind];
      const cost = (i) => {
        if (blocked[i]) return Infinity;
        const m = material[i];
        if (m === mine || m === MAT_INDEX.trailhead) return 0.35;
        if (m !== -1) return 6;
        const k = near[i];
        const foreign = k !== -1 && !projects[k].paths.includes(kind);
        return 1 + wander[i] + (foreign ? 6 : 0);
      };
      const goal = at(...to);
      const guess = (i) => (Math.abs((i % COLS) - to[0]) + Math.abs(Math.floor(i / COLS) - to[1])) * 0.35;
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
        if (i === goal) { end = st; break; }
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
      for (let st = end; st !== -1; st = came[st]) {
        const i = st >> 2;
        if (material[i] === -1) material[i] = mine;
      }
    }

    // Each kind is one trail. It starts at the spawn point (the trailhead) and
    // passes all its trees, ending beside the last one rather than at it. The order is the shortest walk we can find:
    // nearest tree first, then 2-opt (reverse any stretch that makes it shorter),
    // which also untangles the trail where it would cross itself.
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    function walkOrder(head, stops) {
      const order = [head];
      const left = [...stops];
      while (left.length) {
        const here = order[order.length - 1];
        let n = 0;
        left.forEach((s, i) => { if (dist(s, here) < dist(left[n], here)) n = i; });
        order.push(...left.splice(n, 1));
      }
      for (let better = true; better;) {
        better = false;
        for (let i = 1; i < order.length - 1; i++) {
          for (let j = i + 1; j < order.length; j++) {
            const after = order[j + 1];
            const before = dist(order[i - 1], order[i]) + (after ? dist(order[j], after) : 0);
            const swapped = dist(order[i - 1], order[j]) + (after ? dist(order[i], after) : 0);
            if (swapped < before - 0.01) {
              order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
              better = true;
            }
          }
        }
      }
      return order;
    }

    KINDS.forEach((kind, k) => {
      const stops = projects.filter((p) => p.paths.includes(kind)).map((p) => passBy.get(p)[kind]);
      if (!stops.length) return;
      const head = SPAWN;
      const walk = walkOrder(head, stops);
      // Following its own trail is cheap, so where the next tree is back the
      // way it came, a trail walks back along itself: one two-way path, not two.
      for (let i = 1; i < walk.length; i++) route(walk[i - 1], walk[i], kind);
    });


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

    // --- visited counter ------------------------------------------------------
    // A project counts as visited once its card has opened. Each kind shows
    // visited/total of the projects whose trail it is (starts fresh every visit).
    const visited = new Set();
    function updateProgress() {
      for (const kind of KINDS) {
        const mine = projects.filter((p) => p.paths.includes(kind));
        const seen = mine.filter((p) => visited.has(p.id)).length;
        document.querySelector(`[data-progress="${kind}"]`).textContent = `${seen}/${mine.length}`;
      }
    }
    updateProgress();

    // Clicking a kind in the counter shows arrows around the player, one toward
    // each project of that kind not visited yet, for a few seconds.
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
    const boxLeft = (t) => t.x - BASE[0];
    const boxTop = (t) => t.y - BASE[1];

    let tick = 0;
    function updateTrees() {
      tick++;
      for (const t of trees) {
        if (!t.growing || --t.wait > 0) continue;
        t.wait = t.every;
        if (!t.tree.grow()) { t.growing = false; continue; }
        const nodes = count(t.tree.root);
        t.trunkR = nodes < 4 ? 0 : (nodes ** TRUNK_WIDTH_POWER) / 2 + 2;
        t.dirty = true;
      }

      // redraw changed trees: on screen first, then whichever has waited longest
      const todo = trees.filter((t) => t.dirty);
      todo.sort((a, b) => (onScreen(b) - onScreen(a)) || (a.rendered - b.rendered));
      const begin = performance.now();
      for (const t of todo) {
        if (performance.now() - begin > RENDER_BUDGET_MS) break;
        t.layers = renderLayers(t.tree);
        t.dirty = false;
        t.rendered = tick;
      }
    }

    // --- player & input -------------------------------------------------------
    const player = { x: SPAWN[0] * TILE + TILE / 2, y: SPAWN[1] * TILE + TILE / 2, dir: 'down', anim: 0 };

    const keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (introOpen) return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      keys.add(e.code);
      const link = nearest?.project.linkUrl;
      if ((e.code === 'KeyE' || e.code === 'Enter') && link) window.open(link, '_blank', 'noopener');
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

    function movePlayer(dt) {
      if (introOpen) { player.anim = 0; return; }
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

      for (const t of trees) {
        if (t.trunkR) pushOut(t.x, t.y, t.trunkR + PLAYER_RADIUS);
        pushOut(t.signX, t.signY, 6 + PLAYER_RADIUS);
      }
      pushOut(trailSign.x, trailSign.y, 6 + PLAYER_RADIUS);
      player.x = clamp(player.x, 16, WORLD_W - 16);
      player.y = clamp(player.y, 48, WORLD_H - 8);
    }

    // --- project card ---------------------------------------------------------
    const card = document.getElementById('card');
    const field = (name) => card.querySelector(`[data-${name}]`);
    let nearest = null;
    let shown = null;

    // Projects with several images flip through them while their card is open.
    const SLIDE_MS = 2000;
    let slideshow = 0;
    let cardToken = 0;   // bumped each time the nearest tree changes

    function updateCard() {
      nearest = null;
      let best = CARD_DISTANCE;
      for (const t of trees) {
        const d = Math.hypot(player.x - t.x, (player.y - t.y) * 1.5);
        if (d < best) { best = d; nearest = t; }
      }
      if (nearest === shown) return;
      shown = nearest;
      clearInterval(slideshow);
      if (!nearest) {
        cardToken++;                     // forget any card still waiting on its image
        card.dataset.open = 'false';
        return;
      }
      const p = nearest.project;
      const token = ++cardToken;
      const urls = (p.images || []).map(imageUrl);
      urls.forEach((u) => { new Image().src = u; });   // start loading them all, so slideshow flips never show a gap

      // Fill in and open the card only once its first image is ready. Until then
      // the old card's picture would sit next to the new text for a moment.
      const show = () => {
        if (token !== cardToken) return;   // walked on to another tree (or away) meanwhile
        field('title').textContent = p.title;
        field('date').textContent = `${p.date} · ${p.status}`;
        field('paths').textContent = p.paths.map((k) => MATERIALS[k].label).join(' · ');
        field('text').textContent = p.description;
        field('link').textContent = p.linkUrl ? p.linkText + ' ↗' : '';
        field('link').href = p.linkUrl || '#';
        field('key').hidden = !p.linkUrl;
        // style.display, not `hidden`: the img's Tailwind `block` class overrides `hidden`
        const img = field('img');
        img.style.display = urls.length ? '' : 'none';
        if (urls.length) {
          img.src = urls[0];
          img.alt = p.title;
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
        visited.add(p.id);
        updateProgress();
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
      {
        const sx = trailSign.x - cx, sy = trailSign.y - cy;
        footShadow(sx, sy, [3, 5]);
        things.push({ y: trailSign.y, draw: () => {
          const s = trailSign.sign;
          ctx.drawImage(s, sx - (s.width * PIXEL) / 2, sy - s.height * PIXEL + PIXEL, s.width * PIXEL, s.height * PIXEL);
        } });
      }
      for (const t of trees) {
        const sx = t.signX - cx, sy = t.signY - cy;
        if (sx > -200 && sx < w + 200 && sy > -100 && sy < h + 100) {
          footShadow(sx, sy, [3, 5]);
          things.push({ y: t.signY, draw: () => {
            const s = t.sign;
            ctx.drawImage(s, sx - (s.width * PIXEL) / 2, sy - s.height * PIXEL + PIXEL, s.width * PIXEL, s.height * PIXEL);
          } });
        }
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
      things.push({ y: player.y, draw: () => {
        const frames = character.sprites[player.dir];
        const sprite = frames[Math.floor(player.anim) % frames.length];
        ctx.drawImage(sprite, px - (sprite.width * PIXEL) / 2, py - sprite.height * PIXEL + PIXEL,
          sprite.width * PIXEL, sprite.height * PIXEL);
      } });

      ctx.globalAlpha = PALETTES.green.shadow_color[3] / 255;
      ctx.drawImage(shadows, 0, 0, w, h);
      ctx.globalAlpha = 1;

      things.sort((a, b) => a.y - b.y);
      for (const thing of things) thing.draw();
      drawArrows(cx, cy);
    }

    // The counter's arrows: a ring around the player pointing at the nearest few
    // unvisited trees of the chosen kind, in that trail's colour, the closest
    // biggest. An arrow pointing almost the same way as a nearer one is left
    // out, so the ring stays readable. They fade out over the last half second.
    const MAX_ARROWS = 5;
    const MIN_GAP = (15 * Math.PI) / 180;
    function drawArrows(cx, cy) {
      const left = pointing.until - performance.now();
      if (left <= 0) return;
      const kind = pointing.kind;
      const px = player.x - cx;
      const py = player.y - cy - 28;          // around the middle of the sprite
      const [r, g, b] = MATERIALS[kind].base;
      ctx.save();
      ctx.globalAlpha = Math.min(1, left / 500);
      ctx.lineJoin = 'round';
      const targets = trees
        .filter((t) => !visited.has(t.project.id) && t.project.paths.includes(kind))
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
      drawScene();
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
  }

})();

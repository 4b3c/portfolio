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

  const key = document.getElementById('key');
  const keyToggle = document.getElementById('key-toggle');
  // starts closed, since the intro already explained everything in it
  function showKey(open) {
    key.dataset.open = String(open);
    keyToggle.setAttribute('aria-expanded', String(open));
  }
  keyToggle.addEventListener('click', () => showKey(key.dataset.open !== 'true'));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && !introOpen) showKey(key.dataset.open !== 'true');
  });

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
  intro.querySelector('[data-start]').addEventListener('click', () => {
    intro.style.display = 'none';        // not `hidden`: the overlay's Tailwind `flex` class overrides it
    introOpen = false;
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
  function renderList(projects) {
    listItems.replaceChildren();
    const newest = [...projects].sort((a, b) => b.start.localeCompare(a.start));
    for (const p of newest) {
      const item = el('article', 'overflow-hidden rounded border-4 border-[#28201e] bg-[#f4ead2] text-[#28201e] shadow-[6px_6px_0_rgba(0,0,0,0.25)] sm:flex');
      if (p.images?.length) {
        const img = el('img', 'block h-40 w-full object-cover border-b-4 border-[#28201e] sm:h-auto sm:w-48 sm:border-b-0 sm:border-r-4');
        img.src = canvas.dataset.imageBase + p.images[0];
        img.alt = p.title;
        img.loading = 'lazy';
        item.append(img);
      }
      const body = el('div', 'p-4');
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
    list.hidden = false;
    list.scrollTop = 0;
  });
  list.querySelector('[data-forest]').addEventListener('click', () => {
    list.hidden = true;
    showSlide(0);
  });

  // Enter moves the intro along
  window.addEventListener('keydown', (e) => {
    if (!introOpen || !list.hidden || e.code !== 'Enter' || e.target.tagName === 'BUTTON') return;
    slides[slide].querySelector('[data-next], [data-start]')?.click();
  });
  showSlide(0);

  const loaded = fetch(canvas.dataset.projects).then((r) => r.json());
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

    // --- trails -------------------------------------------------------------
    // Trails are drawn in art pixels, not tiles, so they can curve. Each kind is
    // one trail: a smooth curve in from the edge of the world, through the spawn
    // point, past each of its trees and out to the edge again, so it never
    // dead-ends. Each kind a tree belongs to passes it on its own side, so a tree with
    // two kinds stands where two trails meet, and Charlotte has three around it.
    const N = TILE / PIXEL;                      // art pixels per tile
    const AW = COLS * N, AH = ROWS * N;
    const art = new Int8Array(AW * AH).fill(-1); // material of each art pixel
    const hasTrail = new Uint8Array(COLS * ROWS);
    const TRAIL_WIDTH = 5.5;                     // half-width, art pixels
    const MEANDER = 9;                           // how far a trail swings between nearby trees
    const TRUNK_ROOM = 20;                       // trails keep this far from other trees' trunks

    // trunk bases in art pixels
    const trunks = projects.map((p) => {
      const [c, r] = spots.get(p);
      return [c * N + N / 2, r * N + N - 4];
    });
    const SIDES = [[-15, 1], [0, 12], [15, 8]];  // left of the trunk, below it, below-right
    const passBy = new Map();
    projects.forEach((p, k) => {
      const [x, y] = trunks[k];
      const turn = randint(0, SIDES.length - 1);
      passBy.set(p, Object.fromEntries(p.paths.map((kind, i) => {
        const [dx, dy] = SIDES[(turn + i) % SIDES.length];
        return [kind, [x + dx, y + dy]];
      })));
    });

    // The order a trail visits its trees: nearest first, then 2-opt (reverse
    // any stretch that makes the walk shorter), which untangles the trail
    // where it would otherwise loop back across itself.
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

    // A Catmull-Rom curve through the points, sampled about every art pixel.
    // Between two trees the trail swings gently to one side and back (zero at
    // each tree, so it still passes where it should).
    function curve(points) {
      const out = [];
      const pts = [points[0], ...points, points[points.length - 1]];
      const phase = Math.random() * Math.PI * 2;
      for (let i = 1; i < pts.length - 2; i++) {
        const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
        const steps = Math.ceil(dist(p1, p2) * 1.5) + 1;
        const swing = MEANDER * Math.sin(phase + i * 2.1) * Math.min(3, dist(p1, p2) / 60);  // longer stretches swing wider
        for (let s = 0; s < steps; s++) {
          const t = s / steps, t2 = t * t, t3 = t2 * t;
          const axis = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
          const [dx, dy] = [p2[0] - p1[0], p2[1] - p1[1]];
          const len = Math.hypot(dx, dy) || 1;
          const off = swing * Math.sin(Math.PI * t);
          out.push([axis(0) - (dy / len) * off, axis(1) + (dx / len) * off]);
        }
      }
      return out;
    }

    // Lay a trail of this kind along the curve: a disc at every sample, a
    // little wider or narrower as it goes. First trail laid keeps a pixel.
    function lay(points, kind) {
      const mine = MAT_INDEX[kind];
      const ok = new Set(projects.map((p, k) => (p.paths.includes(kind) ? k : -1)));
      points.forEach(([x, y], s) => {
        // step around trunks of trees that aren't this kind's
        trunks.forEach(([tx, ty], k) => {
          if (ok.has(k)) return;
          const d = Math.hypot(x - tx, y - ty);
          if (d < TRUNK_ROOM && d > 0) { x = tx + ((x - tx) / d) * TRUNK_ROOM; y = ty + ((y - ty) / d) * TRUNK_ROOM; }
        });
        const w = TRAIL_WIDTH + Math.sin(s / 23) * 0.8 + Math.sin(s / 7.3) * 0.4;
        const R = Math.ceil(w);
        for (let oy = -R; oy <= R; oy++) {
          for (let ox = -R; ox <= R; ox++) {
            const px = Math.round(x) + ox, py = Math.round(y) + oy;
            if (px < 0 || py < 0 || px >= AW || py >= AH) continue;
            if (ox * ox + oy * oy > w * w) continue;
            const i = py * AW + px;
            if (art[i] === -1) art[i] = mine;
            hasTrail[Math.floor(py / N) * COLS + Math.floor(px / N)] = 1;
          }
        }
      });
    }

    // From `from`, heading along `dir`, the point just past the edge of the world.
    function toEdge(from, dir) {
      const len = Math.hypot(...dir) || 1;
      const [ux, uy] = [dir[0] / len, dir[1] / len];
      const tx = ux > 0 ? (AW - from[0]) / ux : ux < 0 ? -from[0] / ux : Infinity;
      const ty = uy > 0 ? (AH - from[1]) / uy : uy < 0 ? -from[1] / uy : Infinity;
      const t = Math.min(tx, ty) + 30;
      return [from[0] + ux * t, from[1] + uy * t];
    }

    KINDS.forEach((kind, k) => {
      const stops = projects.filter((p) => p.paths.includes(kind)).map((p) => passBy.get(p)[kind]);
      if (!stops.length) return;
      const head = [SPAWN[0] * N + (k - 1) * 14, SPAWN[1] * N + N];
      const order = walkOrder(head, stops);
      // carry on the way it was heading, out to the edge of the world
      const [prev, last] = order.slice(-2);
      const exit = toEdge(last, [last[0] - prev[0], last[1] - prev[1]]);
      // and comes in from the edge behind the spawn point, so it doesn't stop there either
      const entry = toEdge(head, [head[0] - order[1][0], head[1] - order[1][1]]);
      lay(curve([entry, ...order, exit]), kind);
    });

    // --- path tiles -----------------------------------------------------------
    // Drawn once per tile and cached. Edges go ragged wherever a trail meets
    // grass, letting the grass tile underneath show through.
    const artAt = (x, y) => (x < 0 || y < 0 || x >= AW || y >= AH ? -1 : art[y * AW + x]);
    const trailCanvases = new Map();
    function trailTile(c, r) {
      const key = at(c, r);
      if (trailCanvases.has(key)) return trailCanvases.get(key);
      const img = new ImageData(N, N);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const wx = c * N + x, wy = r * N + y;
          const m = artAt(wx, wy);
          if (m === -1) continue;
          const mat = MAT_NAMES[m];
          const edge = artAt(wx + 1, wy) === -1 || artAt(wx - 1, wy) === -1 ||
            artAt(wx, wy + 1) === -1 || artAt(wx, wy - 1) === -1;
          const roll = hashXY(wx + 9001, wy);
          let colour = trailPixel(mat, wx, wy);
          if (edge) colour = roll < 0.45 ? null : MATERIALS[mat].edge;
          if (colour) img.data.set(rgba(colour), (y * N + x) * 4);
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
      player.x = clamp(player.x, 16, WORLD_W - 16);
      player.y = clamp(player.y, 48, WORLD_H - 8);
    }

    // --- project card ---------------------------------------------------------
    const card = document.getElementById('card');
    const field = (name) => card.querySelector(`[data-${name}]`);
    const imageBase = canvas.dataset.imageBase;
    let nearest = null;
    let shown = null;

    function updateCard() {
      nearest = null;
      let best = CARD_DISTANCE;
      for (const t of trees) {
        const d = Math.hypot(player.x - t.x, (player.y - t.y) * 1.5);
        if (d < best) { best = d; nearest = t; }
      }
      if (nearest === shown) return;
      shown = nearest;
      if (!nearest) {
        card.dataset.open = 'false';
        return;
      }
      const p = nearest.project;
      field('title').textContent = p.title;
      field('date').textContent = `${p.date} · ${p.status}`;
      field('paths').textContent = p.paths.map((k) => MATERIALS[k].label).join(' · ');
      field('text').textContent = p.description;
      field('link').textContent = p.linkUrl ? p.linkText + ' ↗' : '';
      field('link').href = p.linkUrl || '#';
      field('key').hidden = !p.linkUrl;
      // style.display, not `hidden`: the img's Tailwind `block` class overrides `hidden`
      const img = field('img');
      const hasImage = p.images?.length > 0;
      img.style.display = hasImage ? '' : 'none';
      if (hasImage) {
        img.src = imageBase + p.images[0];
        img.alt = p.title;
      } else {
        img.removeAttribute('src');
      }
      card.dataset.open = 'true';
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
          if (hasTrail[at(c, r)]) ctx.drawImage(trailTile(c, r), x, y, TILE, TILE);
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

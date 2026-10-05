// A walkable world of projects: one tree per project, scattered at random on every
// load. Three kinds of trail join the trees that share a kind of work: dirt for
// CAD and hardware, stone for coding, gravel for work (Luminosity Lab, PBB Lab).
// Walking up to a tree shows that project's card.
import { FONT } from './font.js';

(function () {
  const {
    PIXEL, PALETTES, TRUNK_WIDTH_POWER,
    Tree, count, renderLayers, outline, toCanvas, makeSprites, EXPLORER,
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

  // While trees are growing, each frame one random tree takes this many growth
  // steps and gets redrawn. Redrawing is the slow part, so only one per frame.
  const STEPS_PER_TURN = 1;
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
    coding: { style: 'cobble', label: 'coding',
      base: [156, 158, 160], edge: [110, 112, 115], dark: [132, 134, 137], light: [186, 188, 190], mortar: [96, 98, 100] },
    work: { style: 'gravel', label: 'work',
      base: [168, 158, 140], edge: [140, 132, 118], dark: [132, 124, 110], light: [196, 188, 172], darker: [110, 104, 94] },
  };
  const KINDS = ['work', 'mechanical', 'coding'];  // routed in this order; earlier ones keep shared tiles
  const MAT_INDEX = Object.fromEntries(Object.keys(MATERIALS).map((k, i) => [k, i]));
  const MAT_NAMES = Object.keys(MATERIALS);

  // --- signs --------------------------------------------------------------
  const SIGN = {
    border: [96, 62, 34, 255], board: [184, 132, 78, 255], grain: [164, 114, 64, 255],
    text: [70, 44, 24, 255], post: [120, 80, 44, 255], outline: [40, 30, 30, 255],
  };

  const canvas = document.getElementById('projects');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rgba = (c) => (c.length === 4 ? c : [...c, 255]);

  const grass = new Image();
  grass.src = canvas.dataset.grass;

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
  fetch(canvas.dataset.projects).then((r) => r.json()).then(start);

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

    // Tiles a trail can't use: trunks and sign posts. Each tree's "door" is the
    // tile just below its trunk, which is where its trails arrive.
    const blocked = new Uint8Array(COLS * ROWS);
    const door = new Map();
    for (const [p, [c, r]] of spots) {
      blocked[at(c, r)] = 1;
      blocked[at(c + 2, r)] = 1;          // sign post
      door.set(p, [c, r + 1]);
    }

    // --- trails -------------------------------------------------------------
    const material = new Int8Array(COLS * ROWS).fill(-1);

    // A little random cost on every tile makes trails wander instead of running
    // in straight lines. It's re-rolled on every load, like the tree layout.
    const wander = new Float32Array(COLS * ROWS).map(() => Math.random() * 1.2);

    // Cheapest 4-way route from `from` to `to` (A*). Following a trail of the
    // same kind is cheap, so trails merge; crossing another kind costs extra.
    function route(from, to, kind) {
      const mine = MAT_INDEX[kind];
      const cost = (i) => {
        if (blocked[i]) return Infinity;
        const m = material[i];
        if (m === mine) return 0.35;
        if (m !== -1) return 2.5;
        return 1 + wander[i];
      };
      const goal = at(...to);
      const guess = (i) => (Math.abs((i % COLS) - to[0]) + Math.abs(Math.floor(i / COLS) - to[1])) * 0.35;
      const best = new Float32Array(COLS * ROWS).fill(Infinity);
      const came = new Int32Array(COLS * ROWS).fill(-1);
      const open = new Heap();
      const startI = at(...from);
      best[startI] = 0;
      open.push(startI, guess(startI));
      while (open.size) {
        const i = open.pop();
        if (i === goal) break;
        const c = i % COLS, r = Math.floor(i / COLS);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!inWorld(c + dc, r + dr)) continue;
          const j = at(c + dc, r + dr);
          const g = best[i] + cost(j);
          if (g < best[j]) {
            best[j] = g;
            came[j] = i;
            open.push(j, g + guess(j));
          }
        }
      }
      if (best[goal] === Infinity) return;
      for (let i = goal; i !== -1; i = came[i]) {
        if (material[i] === -1) material[i] = mine;
      }
    }

    // For each kind: join every tree of that kind with the shortest set of links
    // that connects them all (a minimum spanning tree), then lay a trail along
    // each link.
    for (const kind of KINDS) {
      const stops = projects.filter((p) => p.paths.includes(kind)).map((p) => door.get(p));
      if (!stops.length) continue;
      const joined = [0];
      const left = new Set(stops.keys());
      left.delete(0);
      while (left.size) {
        let link = null;
        for (const a of joined) {
          for (const b of left) {
            const d = Math.hypot(stops[a][0] - stops[b][0], stops[a][1] - stops[b][1]);
            if (!link || d < link.d) link = { a, b, d };
          }
        }
        route(stops[link.a], stops[link.b], kind);
        joined.push(link.b);
        left.delete(link.b);
      }
    }

    // --- path tile art --------------------------------------------------------
    // Drawn once per tile and cached. Cobbles and gravel use world coordinates,
    // so stones line up across tile boundaries. Edges go ragged wherever a trail
    // meets grass, letting the grass tile underneath show through.
    const isTrail = (c, r) => inWorld(c, r) && material[at(c, r)] !== -1;
    const hashXY = (x, y) => {
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    function trailPixel(mat, wx, wy) {
      const m = MATERIALS[mat];
      if (m.style === 'gravel') {
        const n = hashXY(wx, wy);
        return n < 0.12 ? m.darker : n < 0.4 ? m.dark : n < 0.6 ? m.light : m.base;
      }
      if (m.style === 'cobble') {
        // rows of 4px stones, every other row shifted by 2, 1px of mortar between
        const band = Math.floor(wy / 4);
        const sx = wx + (band % 2) * 2;
        const lx = ((sx % 4) + 4) % 4;
        const ly = ((wy % 4) + 4) % 4;
        if (lx === 3 || ly === 3) return m.mortar;
        if (lx === 0 || ly === 0) return m.light;
        if (lx === 2 || ly === 2) return hashXY(Math.floor(sx / 4), band) < 0.5 ? m.dark : m.base;
        return m.base;
      }
      // dirt: plain, with the odd speck
      const n = hashXY(wx, wy);
      return n < 0.04 ? m.dark : n < 0.06 ? m.light : m.base;
    }

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
        layers: null,
        trunkR: 0,
      };
    });
    const boxLeft = (t) => t.x - BASE[0];
    const boxTop = (t) => t.y - BASE[1];

    function updateTrees() {
      const growing = trees.filter((t) => t.growing);
      if (!growing.length) return;
      const t = growing[Math.floor(Math.random() * growing.length)];
      for (let i = 0; i < STEPS_PER_TURN; i++) {
        if (!t.tree.grow()) { t.growing = false; break; }
      }
      const nodes = count(t.tree.root);
      t.trunkR = nodes < 4 ? 0 : (nodes ** TRUNK_WIDTH_POWER) / 2 + 2;
      t.layers = renderLayers(t.tree);
    }

    // --- player & input -------------------------------------------------------
    const sprites = makeSprites(EXPLORER);
    const player = { x: SPAWN[0] * TILE + TILE / 2, y: SPAWN[1] * TILE + TILE / 2, dir: 'down', anim: 0 };

    const keys = new Set();
    window.addEventListener('keydown', (e) => {
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
        const frames = sprites[player.dir];
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

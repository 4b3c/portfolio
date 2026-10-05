// A big walkable forest of procedurally grown pixel-art trees, for one or two players.
(function () {
  const {
    PIXEL, PALETTES, DEFAULTS, TRUNK_WIDTH_POWER,
    Tree, count, renderLayers, makeSprites, EXPLORER, GIRL,
  } = window.PixelTree;
  const [W, H] = DEFAULTS.box;
  const BASE = DEFAULTS.base;

  // --- world ------------------------------------------------------------
  const TILE = 64;
  const WORLD_TILES = 250;
  const WORLD = TILE * WORLD_TILES;      // 16000px square
  // Each tree stops growing at a random age in here. Size grows slowly with age
  // (age 4 is ~65px tall, age 300 is ~260px), so the range has to be wide.
  const MIN_AGE = 2, MAX_AGE = 300;
  const MIN_STEP_MS = 20, MAX_STEP_MS = 60;  // each tree also grows at its own speed
  const MAX_SPROUT_DELAY = 4000;         // trees don't all start at once
  const AREA_PER_TREE = 60000;           // world px² per tree, roughly
  const SPACING_X = 110, SPACING_Y = 55; // how close two trunks can be
  const SPAWN_CLEARING = 160;            // no trees right where the player starts
  const ACTIVE_MARGIN = 300;             // trees this far off-screen are kept grown and drawn
  const RENDER_BUDGET_MS = 8;            // re-rendering a tree is slow, so spread it out
  const BUCKET = 512;                    // trees are filed into 512px squares for quick lookup

  // --- player -------------------------------------------------------------
  const WALK_SPEED = 220;                // px per second
  const RUN_SPEED = 420;
  const PLAYER_RADIUS = 8;               // feet collider
  const ANIM_FPS = 8;
  const CAMERA_EASE = 8;                 // higher = camera catches up faster
  const SPLIT_MARGIN = 100;              // split once a player gets this close to the screen edge
  const MERGE_MARGIN = 200;              // ...and join back up once both are this far inside

  // --- page ---------------------------------------------------------------
  const canvas = document.getElementById('trees');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const paletteSelect = document.getElementById('palette');
  paletteSelect.add(new Option('mixed', 'mixed'));
  for (const name of Object.keys(PALETTES)) paletteSelect.add(new Option(name, name));
  paletteSelect.value = 'green';

  const rand = (a, b) => a + Math.random() * (b - a);
  const snap = (v) => Math.round(v / PIXEL) * PIXEL;  // keeps art pixels on the grid
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Squaring a 0..1 random number bunches it toward 0: lots of saplings, a few giants.
  const randomAge = () => Math.round(MIN_AGE + (MAX_AGE - MIN_AGE) * Math.random() ** 2);

  function pickPalette() {
    const names = Object.keys(PALETTES);
    const name = paletteSelect.value === 'mixed'
      ? names[Math.floor(Math.random() * names.length)]
      : paletteSelect.value;
    return PALETTES[name];
  }

  // --- ground -------------------------------------------------------------
  // Grass tiles from TileWorld: one row of 64x64 tiles. Like TileWorld's
  // `grasses` list, tile i gets i // 2 + 1 tickets, so busier tiles show up more.
  const grass = new Image();
  grass.src = canvas.dataset.grass;
  let ground = new Uint8Array(WORLD_TILES * WORLD_TILES);  // which grass tile goes where

  function paintGround() {
    const tickets = [];
    for (let i = 0; i < 7; i++) {
      for (let k = 0; k <= Math.floor(i / 2); k++) tickets.push(i);
    }
    for (let i = 0; i < ground.length; i++) {
      ground[i] = tickets[Math.floor(Math.random() * tickets.length)];
    }
  }

  // --- trees in the world -------------------------------------------------
  // Every tree is a small record; its Tree (branches and leaves) is only built and
  // grown once the player comes near, and its images are dropped when they leave.
  let buckets = new Map();
  let active = new Set();
  const bucketCols = Math.ceil(WORLD / BUCKET);

  function forEachTreeIn(x0, y0, x1, y1, fn) {
    const c0 = clamp(Math.floor(x0 / BUCKET), 0, bucketCols - 1);
    const c1 = clamp(Math.floor(x1 / BUCKET), 0, bucketCols - 1);
    const r0 = clamp(Math.floor(y0 / BUCKET), 0, bucketCols - 1);
    const r1 = clamp(Math.floor(y1 / BUCKET), 0, bucketCols - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const list = buckets.get(r * bucketCols + c);
        if (list) for (const t of list) fn(t);
      }
    }
  }

  const players = [
    { name: 'explorer', sprites: makeSprites(EXPLORER), start: [-32, 0],
      keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft' } },
    { name: 'girl', sprites: makeSprites(GIRL), start: [32, 0],
      keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', run: 'ShiftRight' } },
  ].map((p) => ({ ...p, x: 0, y: 0, dir: 'down', moving: false, anim: 0, cam: { x: 0, y: 0 } }));

  function placePlayers() {
    for (const p of players) {
      p.x = WORLD / 2 + p.start[0];
      p.y = WORLD / 2 + p.start[1];
    }
  }
  placePlayers();

  function plantWorld() {
    buckets = new Map();
    active = new Set();
    const target = Math.round((WORLD * WORLD) / AREA_PER_TREE);
    const now = performance.now();
    let planted = 0;
    for (let tries = 0; planted < target && tries < target * 20; tries++) {
      const x = snap(rand(TILE, WORLD - TILE));
      const y = snap(rand(TILE, WORLD - TILE));
      if (Math.hypot(x - WORLD / 2, y - WORLD / 2) < SPAWN_CLEARING) continue;

      let crowded = false;
      forEachTreeIn(x - SPACING_X, y - SPACING_Y, x + SPACING_X, y + SPACING_Y, (t) => {
        if (((x - t.x) / SPACING_X) ** 2 + ((y - t.y) / SPACING_Y) ** 2 < 1) crowded = true;
      });
      if (crowded) continue;

      const key = Math.floor(y / BUCKET) * bucketCols + Math.floor(x / BUCKET);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({
        x, y,                        // trunk base, in world px
        seed: Math.floor(Math.random() * 2 ** 32),
        palette: pickPalette(),
        maxAge: randomAge(),
        stepMs: rand(MIN_STEP_MS, MAX_STEP_MS),
        next: now + rand(0, MAX_SPROUT_DELAY),
        tree: null,
        layers: null,
        dirty: false,
        rendered: 0,
        trunkR: 0,
      });
      planted++;
    }
  }

  function newWorld() {
    placePlayers();
    jumpCamera = true;
    paintGround();
    plantWorld();
  }

  // A tree's 400x600 box, relative to its trunk base
  const boxLeft = (t) => t.x - BASE[0];
  const boxTop = (t) => t.y - BASE[1];

  // --- input & movement ---------------------------------------------------
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target === paletteSelect) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    keys.add(e.code);
    if (e.code === 'KeyN') newWorld();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // Pushes (x, y) out of a flat oval around (cx, cy). The y distance counts double,
  // so colliders are wide and short, which feels right from this angle.
  function pushOut(p, cx, cy, radius) {
    const ox = p.x - cx;
    const oy = (p.y - cy) * 2;
    const dist = Math.hypot(ox, oy);
    if (dist < radius && dist > 0) {
      p.x = cx + (ox / dist) * radius;
      p.y = cy + (oy / dist) * radius / 2;
    }
  }

  function movePlayer(p, dt) {
    const k = p.keys;
    const dx = keys.has(k.right) - keys.has(k.left);
    const dy = keys.has(k.down) - keys.has(k.up);
    p.moving = dx !== 0 || dy !== 0;
    if (!p.moving) { p.anim = 0; return; }

    if (dx) p.dir = dx > 0 ? 'right' : 'left';
    else p.dir = dy > 0 ? 'down' : 'up';

    const speed = keys.has(k.run) ? RUN_SPEED : WALK_SPEED;
    const len = Math.hypot(dx, dy);
    p.x += (dx / len) * speed * dt;
    p.y += (dy / len) * speed * dt;
    p.anim += dt * ANIM_FPS * (speed / WALK_SPEED);

    forEachTreeIn(p.x - 64, p.y - 64, p.x + 64, p.y + 64, (t) => {
      if (t.trunkR) pushOut(p, t.x, t.y, t.trunkR + PLAYER_RADIUS);
    });
    for (const other of players) {
      if (other !== p) pushOut(p, other.x, other.y, PLAYER_RADIUS * 2);
    }

    p.x = clamp(p.x, 16, WORLD - 16);
    p.y = clamp(p.y, 48, WORLD - 8);
  }

  // --- cameras & split screen --------------------------------------------
  // A view is a rectangle of the screen (sx, sy, sw, sh) looking at the world from cam.
  // Together, both players share one view centred between them. Apart, each player
  // gets half the screen, split along whichever direction they're apart in.
  let w = 0;
  let h = 0;
  let split = false;
  const sharedCam = { x: 0, y: 0 };
  let views = [];

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

  // would both players fit on one screen, at least `margin` px from its edges?
  function bothFit(margin) {
    const [a, b] = players;
    return Math.abs(a.x - b.x) < w - 2 * margin && Math.abs(a.y - b.y) < h - 2 * margin;
  }

  // eases `cam` toward having `(tx, ty)` in the middle of a sw x sh view
  function follow(cam, tx, ty, sw, sh, dt, jump) {
    const x = clamp(tx - sw / 2, 0, WORLD - sw);
    const y = clamp(ty - sh / 2, 0, WORLD - sh);
    const t = jump ? 1 : 1 - Math.exp(-dt * CAMERA_EASE);
    cam.x += (x - cam.x) * t;
    cam.y += (y - cam.y) * t;
  }

  function updateViews(dt, jump) {
    const [a, b] = players;
    const wasSplit = split;
    if (!split && !bothFit(SPLIT_MARGIN)) split = true;
    else if (split && bothFit(MERGE_MARGIN)) split = false;

    if (!split) {
      // coming back together: carry on from where the first half was looking
      if (wasSplit) {
        sharedCam.x = views[0].cam.x - views[0].sx;
        sharedCam.y = views[0].cam.y - views[0].sy;
      }
      follow(sharedCam, (a.x + b.x) / 2, (a.y + b.y) / 2, w, h, dt, jump);
      views = [{ sx: 0, sy: 0, sw: w, sh: h, cam: sharedCam }];
      return;
    }

    // side by side if they're further apart sideways (for this screen shape), else stacked
    const sideways = Math.abs(a.x - b.x) / w > Math.abs(a.y - b.y) / h;
    const [first, second] = sideways ? (a.x <= b.x ? [a, b] : [b, a]) : (a.y <= b.y ? [a, b] : [b, a]);
    const half = sideways ? Math.floor(w / 2) : Math.floor(h / 2);
    views = [
      { player: first, sx: 0, sy: 0, sw: sideways ? half : w, sh: sideways ? h : half },
      { player: second, sx: sideways ? half : 0, sy: sideways ? 0 : half,
        sw: sideways ? w - half : w, sh: sideways ? h : h - half },
    ];
    for (const v of views) {
      v.cam = v.player.cam;
      // just split: start from exactly what this part of the screen was already showing
      if (!wasSplit) {
        v.cam.x = sharedCam.x + v.sx;
        v.cam.y = sharedCam.y + v.sy;
      }
      follow(v.cam, v.player.x, v.player.y, v.sw, v.sh, dt, jump);
    }
  }

  // --- trees near the views ----------------------------------------------
  const shadows = document.createElement('canvas');
  const shadowsCtx = shadows.getContext('2d');

  function evict(t) {
    t.layers = null;
    if (t.tree) t.tree.setPalette(t.tree.palette);  // throws away cached leaf images
  }

  const onView = (t, v) =>
    boxLeft(t) < v.cam.x + v.sw && boxLeft(t) + W > v.cam.x &&
    boxTop(t) < v.cam.y + v.sh && boxTop(t) + H > v.cam.y;

  // Works out which trees are near any view, grows them, and re-renders a few.
  function updateTrees(now) {
    const nextActive = new Set();
    for (const v of views) {
      forEachTreeIn(
        v.cam.x - BASE[0] - ACTIVE_MARGIN, v.cam.y - (H - BASE[1]) - ACTIVE_MARGIN,
        v.cam.x + v.sw + BASE[0] + ACTIVE_MARGIN, v.cam.y + v.sh + BASE[1] + ACTIVE_MARGIN,
        (t) => nextActive.add(t)
      );
    }
    for (const t of active) if (!nextActive.has(t)) evict(t);
    active = nextActive;

    const todo = [];
    for (const t of active) {
      if (!t.tree) t.tree = new Tree(t.seed, t.palette, { maxAge: t.maxAge });
      // catches up on any growth it missed while far away
      while (now >= t.next) {
        t.next += t.stepMs;
        if (t.tree.grow()) t.dirty = true;
        else { t.next = Infinity; break; }  // finished growing
      }
      const nodes = count(t.tree.root);
      t.trunkR = nodes < 4 ? 0 : (nodes ** TRUNK_WIDTH_POWER) / 2 + 2;  // saplings can be walked over
      if (!t.layers || t.dirty) todo.push(t);
    }

    // trees with no picture yet first, then the ones on screen, then the stalest
    const onScreen = (t) => views.some((v) => onView(t, v));
    todo.sort((a, b) =>
      (!!a.layers - !!b.layers) || (onScreen(b) - onScreen(a)) || (a.rendered - b.rendered)
    );
    const start = performance.now();
    for (const t of todo) {
      if (performance.now() - start > RENDER_BUDGET_MS) break;
      t.layers = renderLayers(t.tree);
      t.dirty = false;
      t.rendered = now;
    }
  }

  // --- drawing ------------------------------------------------------------
  function drawGround(v, cx, cy) {
    if (!grass.complete || !grass.naturalWidth) {
      ctx.fillStyle = 'rgb(130, 170, 70)';
      ctx.fillRect(0, 0, v.sw, v.sh);
      return;
    }
    const c0 = Math.floor(cx / TILE), c1 = Math.min(Math.ceil((cx + v.sw) / TILE), WORLD_TILES);
    const r0 = Math.floor(cy / TILE), r1 = Math.min(Math.ceil((cy + v.sh) / TILE), WORLD_TILES);
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const i = ground[r * WORLD_TILES + c];
        ctx.drawImage(grass, i * TILE, 0, TILE, TILE, c * TILE - cx, r * TILE - cy, TILE, TILE);
      }
    }
  }

  // Draws one view. Everything inside is in view-local coordinates.
  function drawView(v) {
    // The camera moves in single screen pixels, not whole art pixels, so the grid
    // can sit a few device pixels off the screen's. Everything in the world is
    // still on the art-pixel grid, so it all shifts together.
    const cx = Math.round(v.cam.x * dpr) / dpr;
    const cy = Math.round(v.cam.y * dpr) / dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, dpr * v.sx, dpr * v.sy);
    ctx.beginPath();
    ctx.rect(0, 0, v.sw, v.sh);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    drawGround(v, cx, cy);

    // all shadows go on one layer first, then get faded together
    // so overlapping shadows don't get darker
    shadowsCtx.setTransform(1, 0, 0, 1, 0, 0);
    shadowsCtx.clearRect(0, 0, v.sw, v.sh);
    shadowsCtx.imageSmoothingEnabled = false;
    shadowsCtx.fillStyle = '#000';
    const things = [];
    for (const t of active) {
      if (!t.layers || !onView(t, v)) continue;
      const left = boxLeft(t) - cx;
      const top = boxTop(t) - cy;
      const { shadow, shadowY, branches, leaves } = t.layers;
      shadowsCtx.drawImage(shadow, left, top + shadowY, shadow.width * PIXEL, shadow.height * PIXEL);
      things.push({ y: t.y, draw: () => {
        ctx.drawImage(branches, left, top, branches.width * PIXEL, branches.height * PIXEL);
        ctx.drawImage(leaves, left, top, leaves.width * PIXEL, leaves.height * PIXEL);
      } });
    }
    for (const p of players) {
      // players are drawn where they really are, rounded only to a screen pixel
      const px = Math.round((p.x - cx) * dpr) / dpr;
      const py = Math.round((p.y - cy) * dpr) / dpr;
      // a little pixel oval at their feet
      [4, 6, 4].forEach((wide, i) => {
        shadowsCtx.fillRect(px - (wide / 2) * PIXEL, py + (i - 2) * PIXEL + 4, wide * PIXEL, PIXEL);
      });
      things.push({ y: p.y, draw: () => {
        const frames = p.sprites[p.dir];
        const sprite = frames[Math.floor(p.anim) % frames.length];
        ctx.drawImage(sprite, px - (sprite.width * PIXEL) / 2, py - sprite.height * PIXEL + PIXEL,
          sprite.width * PIXEL, sprite.height * PIXEL);
      } });
    }

    ctx.globalAlpha = PALETTES.green.shadow_color[3] / 255;
    ctx.drawImage(shadows, 0, 0, v.sw, v.sh, 0, 0, v.sw, v.sh);
    ctx.globalAlpha = 1;

    // trees and players, back to front by where their feet are
    things.sort((a, b) => a.y - b.y);
    for (const thing of things) thing.draw();
    ctx.restore();
  }

  function drawScene() {
    for (const v of views) drawView(v);
    if (views.length > 1) {
      // a dark line between the two halves
      const b = views[1];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgb(40, 30, 30)';
      if (b.sx > 0) ctx.fillRect(b.sx - PIXEL / 2, 0, PIXEL, h);
      else ctx.fillRect(0, b.sy - PIXEL / 2, w, PIXEL);
    }
  }

  // --- main loop ----------------------------------------------------------
  let last = performance.now();
  let jumpCamera = true;  // snap straight to the players on the first frame and after `n`

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    for (const p of players) movePlayer(p, dt);
    updateViews(dt, jumpCamera);
    jumpCamera = false;
    updateTrees(now);
    drawScene();
    requestAnimationFrame(frame);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  });
  paletteSelect.addEventListener('change', () => {
    forEachTreeIn(0, 0, WORLD, WORLD, (t) => {
      t.palette = pickPalette();
      if (t.tree) t.tree.setPalette(t.palette);
      t.dirty = true;
    });
    paletteSelect.blur();  // so the arrow keys go back to walking
  });

  resize();
  newWorld();
  requestAnimationFrame(frame);
})();

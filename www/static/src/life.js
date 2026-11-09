(function () {
  const CELL = 8;          // matches grid-bg.js so cells sit on the background grid
  const STEP_MS = 100;     // one generation every 100ms
  const FADE_MS = 200;     // how long a dead cell takes to fade out
  const SEED_DENSITY = 0.05;

  const glow = document.getElementById('life');
  if (!glow) return;

  const glowCtx = glow.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let cols = 0;
  let rows = 0;
  let alive = new Uint8Array(0);   // 1 = alive, 0 = dead
  let fade = new Float32Array(0);  // brightness left over from recently dead cells

  let paused = false;
  let acc = 0;

  function seed() {
    for (let i = 0; i < alive.length; i++) {
      alive[i] = Math.random() < SEED_DENSITY ? 1 : 0;
    }
    fade.fill(0);
  }

  function clear() {
    alive.fill(0);
    fade.fill(0);
  }

  // Resizes the board, keeping whatever overlaps the old one.
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    glow.width = w * dpr;
    glow.height = h * dpr;
    glow.style.width = w + 'px';
    glow.style.height = h + 'px';
    glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const newCols = Math.ceil(w / CELL);
    const newRows = Math.ceil(h / CELL);
    const next = new Uint8Array(newCols * newRows);
    for (let r = 0; r < Math.min(rows, newRows); r++) {
      for (let c = 0; c < Math.min(cols, newCols); c++) {
        next[r * newCols + c] = alive[r * cols + c];
      }
    }
    const firstTime = cols === 0;
    cols = newCols;
    rows = newRows;
    alive = next;
    fade = new Float32Array(cols * rows);
    if (firstTime) seed();
  }

  // Counts live neighbours, wrapping around the edges.
  function neighbours(c, r) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const cc = (c + dc + cols) % cols;
        const rr = (r + dr + rows) % rows;
        n += alive[rr * cols + cc];
      }
    }
    return n;
  }

  // The rules: a live cell survives with 2 or 3 neighbours,
  // a dead cell comes alive with exactly 3.
  function step() {
    const next = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const n = neighbours(c, r);
        next[i] = n === 3 || (n === 2 && alive[i]) ? 1 : 0;
        if (alive[i] && !next[i]) fade[i] = 1;
      }
    }
    alive = next;
  }

  function draw(dt) {
    glowCtx.clearRect(0, 0, glow.width, glow.height);
    for (let i = 0; i < alive.length; i++) {
      let b = alive[i];
      if (!b && fade[i] > 0) {
        fade[i] = Math.max(0, fade[i] - dt / FADE_MS);
        b = fade[i] * 0.4;
      }
      if (b <= 0) continue;
      glowCtx.fillStyle = `rgba(255, 255, 255, ${b})`;
      glowCtx.fillRect((i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL);
    }
  }

  // Click or drag to draw live cells.
  let drawing = false;
  function paint(e) {
    const c = Math.floor(e.clientX / CELL);
    const r = Math.floor(e.clientY / CELL);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    alive[r * cols + c] = 1;
  }

  glow.addEventListener('pointerdown', (e) => { drawing = true; paint(e); });
  window.addEventListener('pointermove', (e) => { if (drawing) paint(e); });
  window.addEventListener('pointerup', () => { drawing = false; });

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { paused = !paused; e.preventDefault(); }
    if (e.key === 'r') seed();
    if (e.key === 'c') clear();
    if (e.key === 'n' && paused) step();
  });

  let last = performance.now();
  function tick(now) {
    const dt = now - last;
    last = now;

    if (!paused) {
      acc += dt;
      while (acc >= STEP_MS) {
        step();
        acc -= STEP_MS;
      }
    }
    draw(dt);
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(tick);
})();

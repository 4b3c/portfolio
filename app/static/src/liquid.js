(function () {
  const CELL = 8;
  const FALL_STEP_MS = 45; // one gravity step per this many ms
  const MESSAGE = 'hi, my name is abram';
  const MAX_WIDTH_FRACTION = 0.9; // keep the text within this much of viewport width

  const glow = document.getElementById('liquid-glow');
  if (!glow) return;

  const glowCtx = glow.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // key "col,row" -> true
  let cells = new Map();
  let totalCols = 0;
  let totalRows = 0;

  // Renders MESSAGE to an offscreen canvas at the given height and samples
  // each 8px cell to find which cells are "ink", relative to the glyph's
  // own top-left.
  function buildMessage(heightPx) {
    const rows = Math.max(1, Math.round(heightPx / CELL));
    const h = rows * CELL;
    const fontPx = Math.floor(h * 0.8);

    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `bold ${fontPx}px Arial, sans-serif`;
    const cols = Math.ceil(measure.measureText(MESSAGE).width / CELL) + 4;
    const w = cols * CELL;

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    octx.fillStyle = '#000000';
    octx.fillRect(0, 0, w, h);
    octx.fillStyle = '#ffffff';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.font = `bold ${fontPx}px Arial, sans-serif`;
    octx.fillText(MESSAGE, w / 2, h / 2);

    const { data } = octx.getImageData(0, 0, w, h);
    const relCells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let sum = 0;
        let count = 0;
        for (let yy = 0; yy < CELL; yy++) {
          for (let xx = 0; xx < CELL; xx++) {
            const px = col * CELL + xx;
            const py = row * CELL + yy;
            sum += data[(py * w + px) * 4];
            count++;
          }
        }
        if (sum / count > 96) relCells.push([col, row]);
      }
    }
    return { relCells, cols, rows };
  }

  function buildFittedMessage(w) {
    let heightPx = 160;
    let msg = buildMessage(heightPx);
    const maxCols = Math.floor((w * MAX_WIDTH_FRACTION) / CELL);
    if (msg.cols > maxCols) {
      heightPx = Math.max(CELL, heightPx * (maxCols / msg.cols));
      msg = buildMessage(heightPx);
    }
    return msg;
  }

  function spawnMessage(w, h) {
    const msg = buildFittedMessage(w);
    const originCol = Math.floor(w / CELL / 2 - msg.cols / 2);
    const originRow = 3; // a few rows from the top, room to fall below

    cells = new Map();
    for (const [c, r] of msg.relCells) {
      const col = originCol + c;
      const row = originRow + r;
      cells.set(col + ',' + row, { col, row });
    }
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    glow.width = w * dpr;
    glow.height = h * dpr;
    glow.style.width = w + 'px';
    glow.style.height = h + 'px';
    glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    totalCols = Math.floor(w / CELL);
    totalRows = Math.floor(h / CELL);
    spawnMessage(w, h);
  }

  // Each particle's rule: if the cell below is empty, fall into it; else try
  // left/right (same row) in random order; else stay put.
  function fallStep() {
    const particles = Array.from(cells.values());
    // Shuffle then sort by row descending, so processing is bottom-up with
    // no systematic left/right bias among particles on the same row.
    for (let i = particles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [particles[i], particles[j]] = [particles[j], particles[i]];
    }
    particles.sort((a, b) => b.row - a.row);

    for (const cell of particles) {
      const key = cell.col + ',' + cell.row;
      if (!cells.has(key)) continue; // already moved elsewhere this pass

      const nextRow = cell.row + 1;
      if (nextRow < totalRows) {
        const belowKey = cell.col + ',' + nextRow;
        if (!cells.has(belowKey)) {
          cells.delete(key);
          cell.row = nextRow;
          cells.set(belowKey, cell);
          continue;
        }
      }

      const order = Math.random() < 0.5 ? [-1, 1] : [1, -1];
      for (const dx of order) {
        const nc = cell.col + dx;
        if (nc < 0 || nc >= totalCols) continue;
        const sideKey = nc + ',' + cell.row;
        if (!cells.has(sideKey)) {
          cells.delete(key);
          cell.col = nc;
          cells.set(sideKey, cell);
          break;
        }
      }
    }
  }

  let last = performance.now();
  let fallAccum = 0;
  function tick(now) {
    const dt = now - last;
    last = now;

    fallAccum += dt;
    while (fallAccum >= FALL_STEP_MS) {
      fallStep();
      fallAccum -= FALL_STEP_MS;
    }

    glowCtx.clearRect(0, 0, glow.width, glow.height);
    glowCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    for (const cell of cells.values()) {
      glowCtx.fillRect(cell.col * CELL, cell.row * CELL, CELL, CELL);
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame(tick);
})();

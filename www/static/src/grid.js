(function () {
  const CELL = 8;
  const FADE_MS = 3500; // 3-4s fade back to black
  const MESSAGE = 'Welcome!';
  const MESSAGE_HEIGHT_PX = 200; // rendered glyph height before snapping to cells

  const glow = document.getElementById('grid-glow');
  if (!glow) return;

  const glowCtx = glow.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // key "col,row" -> { col, row, brightness (1 -> 0) }
  const cells = new Map();

  // Cells that belong to the hidden message: never lit, stay black forever,
  // so they only reveal themselves as "gaps" in the surrounding hover glow.
  let hiddenCells = new Set();

  // Renders MESSAGE to an offscreen canvas and samples each 8px cell to
  // find which cells are "ink", relative to the glyph's own top-left.
  function buildMessage() {
    const rows = Math.round(MESSAGE_HEIGHT_PX / CELL);
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

  const message = buildMessage();

  function placeMessage(w, h) {
    const originCol = Math.floor(w / CELL / 2 - message.cols / 2);
    const originRow = Math.floor(h / CELL / 2 - message.rows / 2);
    hiddenCells = new Set(
      message.relCells.map(([c, r]) => originCol + c + ',' + (originRow + r))
    );
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    glow.width = w * dpr;
    glow.height = h * dpr;
    glow.style.width = w + 'px';
    glow.style.height = h + 'px';
    glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    placeMessage(w, h);
  }

  function lightCell(x, y) {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    const key = col + ',' + row;
    if (hiddenCells.has(key)) return; // part of the hidden message: stays black
    cells.set(key, { col, row, brightness: 1 });
  }

  // Light every cell on the segment from (x0,y0) to (x1,y1) so fast mouse
  // movement doesn't skip cells between two mousemove events.
  function lightLine(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (CELL / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      lightCell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  let lastX = null;
  let lastY = null;
  function handleMove(e) {
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const points = events.length ? events : [e];
    for (const p of points) {
      if (lastX === null) {
        lightCell(p.clientX, p.clientY);
      } else {
        lightLine(lastX, lastY, p.clientX, p.clientY);
      }
      lastX = p.clientX;
      lastY = p.clientY;
    }
  }

  let last = performance.now();
  function tick(now) {
    const dt = now - last;
    last = now;

    glowCtx.clearRect(0, 0, glow.width, glow.height);
    for (const [key, cell] of cells) {
      cell.brightness -= dt / FADE_MS;
      if (cell.brightness <= 0) {
        cells.delete(key);
        continue;
      }
      glowCtx.fillStyle = `rgba(255, 255, 255, ${cell.brightness})`;
      glowCtx.fillRect(cell.col * CELL, cell.row * CELL, CELL, CELL);
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', handleMove);

  resize();
  requestAnimationFrame(tick);
})();

(function () {
  const CELL = 8;
  const FADE_MS = 2500; // 2-3s fade back to black

  const bg = document.getElementById('grid-bg');
  const glow = document.getElementById('grid-glow');
  if (!bg || !glow) return;

  const bgCtx = bg.getContext('2d');
  const glowCtx = glow.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // key "col,row" -> { col, row, brightness (1 -> 0) }
  const cells = new Map();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    [bg, glow].forEach((c) => {
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    });
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGrid(w, h);
  }

  function drawGrid(w, h) {
    bgCtx.clearRect(0, 0, w, h);
    bgCtx.fillStyle = '#000000';
    bgCtx.fillRect(0, 0, w, h);
    bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    for (let x = 0; x <= w; x += CELL) {
      bgCtx.moveTo(x + 0.5, 0);
      bgCtx.lineTo(x + 0.5, h);
    }
    for (let y = 0; y <= h; y += CELL) {
      bgCtx.moveTo(0, y + 0.5);
      bgCtx.lineTo(w, y + 0.5);
    }
    bgCtx.stroke();
  }

  function lightCell(x, y) {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    cells.set(col + ',' + row, { col, row, brightness: 1 });
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

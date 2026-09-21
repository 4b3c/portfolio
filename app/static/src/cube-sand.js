(function () {
  const CELL = 8;
  const FADE_MS = 3500; // 3-4s fade back to black
  const FALL_STEP_MS = 45; // one row of gravity per this many ms

  const glow = document.getElementById('cube-sand-glow');
  if (!glow) return;

  const glowCtx = glow.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const VERTICES = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  const SPEED_X = 0.0003; // rad/ms
  const SPEED_Y = 0.0005; // rad/ms
  const PERSPECTIVE = 3;

  let centerX = 0;
  let centerY = 0;
  let radius = 0;
  let angleX = 0.4;
  let angleY = 0.6;

  // key "col,row" -> { col, row, brightness (1 -> 0) }
  const cells = new Map();

  // This frame's cube-edge cells: solid, sand can't pass through them.
  let obstacles = new Set();

  let totalCols = 0;
  let totalRows = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    glow.width = w * dpr;
    glow.height = h * dpr;
    glow.style.width = w + 'px';
    glow.style.height = h + 'px';
    glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = w / 2;
    centerY = h / 2;
    radius = Math.min(w, h) * 0.18;
    totalCols = Math.floor(w / CELL);
    totalRows = Math.floor(h / CELL);
  }

  function rotate([x, y, z], ax, ay) {
    let y1 = y * Math.cos(ax) - z * Math.sin(ax);
    let z1 = y * Math.sin(ax) + z * Math.cos(ax);
    let x2 = x * Math.cos(ay) + z1 * Math.sin(ay);
    let z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
    return [x2, y1, z2];
  }

  function project([x, y, z]) {
    const scale = PERSPECTIVE / (PERSPECTIVE + z);
    return [centerX + x * radius * scale, centerY + y * radius * scale];
  }

  // Marks every 8px cell a line segment passes through into `set`.
  function rasterLine(x0, y0, x1, y1, set) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (CELL / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const col = Math.floor(x / CELL);
      const row = Math.floor(y / CELL);
      set.add(col + ',' + row);
    }
  }

  function updateCube(dt) {
    angleX += dt * SPEED_X;
    angleY += dt * SPEED_Y;

    const projected = VERTICES.map((v) => project(rotate(v, angleX, angleY)));
    const litCells = new Set();
    for (const [a, b] of EDGES) {
      const [x0, y0] = projected[a];
      const [x1, y1] = projected[b];
      rasterLine(x0, y0, x1, y1, litCells);
    }
    obstacles = litCells;
  }

  function lightCell(x, y) {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    const key = col + ',' + row;
    if (obstacles.has(key)) return; // can't spawn sand inside the cube
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

  // Each lit cell's rule: if the cell below is empty, fall into it; else stay
  // put. Cube-edge cells count as "not empty", so sand can't pass through.
  function fallStep() {
    const falling = Array.from(cells.values()).sort((a, b) => b.row - a.row);
    for (const cell of falling) {
      const key = cell.col + ',' + cell.row;
      if (!cells.has(key)) continue;

      const nextRow = cell.row + 1;
      if (nextRow >= totalRows) continue; // resting on the floor

      const belowKey = cell.col + ',' + nextRow;
      if (obstacles.has(belowKey) || cells.has(belowKey)) continue; // blocked

      cells.delete(key);
      cell.row = nextRow;
      cells.set(belowKey, cell);
    }
  }

  let last = performance.now();
  let fallAccum = 0;
  function tick(now) {
    const dt = now - last;
    last = now;

    updateCube(dt);

    fallAccum += dt;
    while (fallAccum >= FALL_STEP_MS) {
      fallStep();
      fallAccum -= FALL_STEP_MS;
    }

    glowCtx.clearRect(0, 0, glow.width, glow.height);

    glowCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    for (const key of obstacles) {
      const [col, row] = key.split(',').map(Number);
      glowCtx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }

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

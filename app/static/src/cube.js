(function () {
  const CELL = 8;

  const glow = document.getElementById('cube-glow');
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
  }

  function rotate([x, y, z], ax, ay) {
    // rotate around X
    let y1 = y * Math.cos(ax) - z * Math.sin(ax);
    let z1 = y * Math.sin(ax) + z * Math.cos(ax);
    // rotate around Y
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

  let last = performance.now();
  function tick(now) {
    const dt = now - last;
    last = now;

    angleX += dt * SPEED_X;
    angleY += dt * SPEED_Y;

    const projected = VERTICES.map((v) => project(rotate(v, angleX, angleY)));

    const litCells = new Set();
    for (const [a, b] of EDGES) {
      const [x0, y0] = projected[a];
      const [x1, y1] = projected[b];
      rasterLine(x0, y0, x1, y1, litCells);
    }

    glowCtx.clearRect(0, 0, glow.width, glow.height);
    glowCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    for (const key of litCells) {
      const [col, row] = key.split(',').map(Number);
      glowCtx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame(tick);
})();

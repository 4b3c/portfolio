// Don't get squished: a bot plays Tetris and you're the little runner on the
// board, dodging its pieces. A port of my C++ / raylib game, played on the
// arcade machine in the cabin. Positions are in grid cells; the board is drawn
// CELL screen pixels to a cell.

const ROWS = 16;                         // how tall the board is
const COLS = 10;
const CELL = 32;                         // an 8x8 block texture drawn at 4x
const SPAWN = [3, 0];

// While a piece is squishing the player it pushes down this many cells per second
const SQUISH_SPEED = 0.6;

const SHAPES = [
  [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]],   // O
  [[0, 0, 0, 0], [0, 0, 2, 2], [0, 2, 2, 0], [0, 0, 0, 0]],   // S
  [[0, 0, 0, 0], [0, 3, 3, 0], [0, 0, 3, 3], [0, 0, 0, 0]],   // Z
  [[0, 0, 4, 0], [0, 0, 4, 0], [0, 0, 4, 0], [0, 0, 4, 0]],   // I
  [[0, 0, 0, 0], [0, 5, 5, 5], [0, 0, 0, 5], [0, 0, 0, 0]],   // J
  [[0, 0, 0, 0], [0, 6, 6, 6], [0, 6, 0, 0], [0, 0, 0, 0]],   // L
  [[0, 0, 0, 0], [0, 0, 7, 0], [0, 7, 7, 7], [0, 0, 0, 0]],   // T
];

const emptyBoard = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
const copyBoard = (board) => board.map((row) => [...row]);
const randomValue = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// clockwise
function rotate(cells) {
  const out = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) out[col][3 - row] = cells[row][col];
  }
  return out;
}

function locationOpen(grid, cells, x, y) {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (!cells[row][col]) continue;
      const bx = x + col, by = y + row;
      if (bx < 0 || bx >= COLS || by >= ROWS) return false;
      if (by >= 0 && grid[by][bx]) return false;
    }
  }
  return true;
}

function addToGrid(grid, cells, x, y) {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) if (cells[row][col]) grid[y + row][x + col] = cells[row][col];
  }
}

// Removes full rows and returns how many were cleared
function clearLines(board) {
  let cleared = 0;
  let write = ROWS - 1;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row].every((v) => v)) { cleared++; continue; }
    if (write !== row) board[write] = [...board[row]];
    write--;
  }
  for (let row = write; row >= 0; row--) board[row] = new Array(COLS).fill(0);
  return cleared;
}

// --- the bot ------------------------------------------------------------------
// Weights from Yiyuan Lee's "Tetris AI - The (Near) Perfect Bot", tuned with a genetic algorithm
const HEIGHT_WEIGHT = -0.510066;
const LINES_WEIGHT = 0.760666;
const HOLES_WEIGHT = -0.35663;
const BUMPINESS_WEIGHT = -0.184483;
const LOSS_SCORE = -1e9;                 // a line of play that ends the game
const SPREAD = 0.6;                      // how much of the piece's safe falling room the bot spreads its moves over

function fits(board, piece, x, y) {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (!piece[row][col]) continue;
      const bx = x + col, by = y + row;
      if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS) return false;
      if (board[by][bx]) return false;
    }
  }
  return true;
}

// Checks the piece can actually get to column `targetX` the way the bot moves it:
// rotate in place first, then slide sideways one column at a time
function reachable(board, rotations, r, targetX, x, y) {
  for (let i = 0; i <= r; i++) if (!fits(board, rotations[i], x, y)) return false;
  const step = targetX > x ? 1 : -1;
  for (let col = x; col !== targetX; col += step) {
    if (!fits(board, rotations[r], col + step, y)) return false;
  }
  return true;
}

// Hard drops the piece from (x, y), locks it in, and returns the lines cleared
function place(board, piece, x, y) {
  while (fits(board, piece, x, y + 1)) y++;
  addToGrid(board, piece, x, y);
  return clearLines(board);
}

function evaluate(board, lines) {
  const heights = new Array(COLS).fill(0);
  let holes = 0;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (board[row][col]) { if (!heights[col]) heights[col] = ROWS - row; }
      else if (heights[col]) holes++;
    }
  }
  let height = 0, bumpiness = 0;
  for (let col = 0; col < COLS; col++) {
    height += heights[col];
    if (col > 0) bumpiness += Math.abs(heights[col] - heights[col - 1]);
  }
  return HEIGHT_WEIGHT * height + LINES_WEIGHT * lines + HOLES_WEIGHT * holes + BUMPINESS_WEIGHT * bumpiness;
}

const rotationsOf = (piece) => {
  const out = [piece];
  for (let r = 1; r < 4; r++) out.push(rotate(out[r - 1]));
  return out;
};

// Tries every rotation and column for pieces[0], recursing into the rest, and
// returns the best final board score and the move that leads to it. The first
// piece starts at (x, y), later ones at spawn.
function search(board, pieces, linesSoFar, x, y) {
  const rotations = rotationsOf(pieces[0]);
  let best = { score: LOSS_SCORE, move: null };
  for (let r = 0; r < 4; r++) {
    for (let targetX = -3; targetX < COLS; targetX++) {
      if (!reachable(board, rotations, r, targetX, x, y)) continue;
      const next = copyBoard(board);
      const lines = linesSoFar + place(next, rotations[r], targetX, y);
      const score = pieces.length > 1
        ? search(next, pieces.slice(1), lines, SPAWN[0], SPAWN[1]).score
        : evaluate(next, lines);
      if (!best.move || score > best.score) best = { score, move: { rotations: r, x: targetX, valid: true } };
    }
  }
  return best;
}

// Rotation and column of the piece after its first `step` actions
function stateAfter(move, step, startX) {
  const r = Math.min(step, move.rotations);
  const slides = step - r;
  return [r, startX + (move.x > startX ? slides : -slides)];
}

// Checks the piece can do each action at its row (falling freely in between) and still
// land exactly where the planner expected, i.e. where a drop right from the start would
function scheduleWorks(board, rotations, move, startX, startY, rows) {
  let row = startY;
  for (let step = 0; step < move.actionCount; step++) {
    let [r, x] = stateAfter(move, step, startX);
    for (; row < rows[step]; row++) if (!fits(board, rotations[r], x, row + 1)) return false;
    [r, x] = stateAfter(move, step + 1, startX);
    if (!fits(board, rotations[r], x, row)) return false;
  }
  let landing = row;
  while (fits(board, rotations[move.rotations], move.x, landing + 1)) landing++;
  let planned = startY;
  while (fits(board, rotations[move.rotations], move.x, planned + 1)) planned++;
  return landing === planned;
}

// Fills in move.actionRows so the moves are spread out instead of all at the start
function schedule(board, rotations, move, startX, startY) {
  move.actionCount = move.rotations + Math.abs(move.x - startX);
  const all = (row) => new Array(move.actionCount).fill(row);

  // how far down could the piece fall and still do everything at once
  let latest = startY;
  while (latest < ROWS - 1 && scheduleWorks(board, rotations, move, startX, startY, all(latest + 1))) latest++;

  // spread the actions evenly over part of that room, backing off toward the start if
  // something on the way blocks it (all at startY always works, the planner checked it)
  for (let spread = SPREAD; spread > 0; spread -= 0.2) {
    const room = spread * (latest - startY);
    const rows = all(0).map((_, i) => startY + Math.floor((room * (i + 1)) / (move.actionCount + 1)));
    if (scheduleWorks(board, rotations, move, startX, startY, rows)) { move.actionRows = rows; return; }
  }
  move.actionRows = all(startY);
}

// Picks the best placement for the falling piece (`cells`, at x, y), looking one piece ahead
function findBestMove(grid, cells, x, y, nextType) {
  const { move } = search(grid, [cells, SHAPES[nextType]], 0, x, y);
  if (!move) return { rotations: 0, x, valid: false, actionCount: 0, actionRows: [] };
  schedule(grid, rotationsOf(cells), move, x, y);
  return move;
}

// --- the runner -----------------------------------------------------------------
// A little runner that stands on top of the blocks. (x, y) is the top-left of
// its hitbox, in grid cells. Sizes are in cells, speeds in cells per second.
const WIDTH = 0.625;                     // 5 art pixels
const HEIGHT = 0.75;                     // 6 art pixels
const RUN_SPEED = 6.0;
const GRAVITY = 40.0;
const JUMP_HEIGHT = 2.01;                // just enough to hop up two blocks, not three
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
const MAX_FALL = 20.0;
const EPS = 0.001;
// If the piece only clips the player by up to one art pixel, the player can be
// popped out sideways (or any way) instead of getting squished
const POP_MARGIN = 1 / 8 + EPS;
const MIN_HEIGHT = 1 / 8;                // squished down to one art pixel tall means it's over
const REGROW_SPEED = 3.0;                // how fast the player springs back to full height once free
const MAX_FATNESS = 2.0;                 // at full squish the sprite is drawn this many times wider
const EXPLODE_DURATION = 1.5;            // seconds
const PARTICLE_GRAVITY = 900.0;          // screen pixels per second squared

// facing right. r = cap, s = skin, k = eye, b = shirt, f = shoes
const SPRITE = ['.rrr.', '.rrrr', '.ssk.', 'sbbbs', '.bbb.', '.f.f.'];
const STEP_FEET = 'f...f';               // swapped in for the bottom row to animate the feet
const JUMP_FEET = '..ff.';
const SPRITE_COLOURS = { r: 'rgb(220, 40, 40)', s: 'rgb(255, 205, 160)', k: 'rgb(20, 20, 30)', b: 'rgb(40, 90, 220)', f: 'rgb(90, 50, 20)' };

const solid = (grid, col, row) => col < 0 || col >= COLS || row >= ROWS || (row >= 0 && grid[row][col] !== 0);

function overlapsSolid(grid, x, y, h) {
  for (let row = Math.floor(y); row <= Math.floor(y + h - EPS); row++) {
    for (let col = Math.floor(x); col <= Math.floor(x + WIDTH - EPS); col++) if (solid(grid, col, row)) return true;
  }
  return false;
}

const hitsCell = (cellX, cellY, x, y, h) =>
  x + EPS < cellX + 1 && x + WIDTH - EPS > cellX && y + EPS < cellY + 1 && y + h - EPS > cellY;

// Exact box overlap with the falling piece; just touching an edge doesn't count
function hitsPiece(cells, pieceX, pieceY, x, y, h) {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) if (cells[row][col] && hitsCell(pieceX + col, pieceY + row, x, y, h)) return true;
  }
  return false;
}

const blocked = (grid, cells, pieceX, pieceY, x, y, h) =>
  overlapsSolid(grid, x, y, h) || hitsPiece(cells, pieceX, pieceY, x, y, h);

// Slides the player in direction (dirX, dirY) until it's clear of the piece
function pushOut(cells, pieceX, pieceY, dirX, dirY, h, x, y) {
  // a few rounds in case pushing past one cell lands in another
  for (let i = 0; i < 4 && hitsPiece(cells, pieceX, pieceY, x, y, h); i++) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (!cells[row][col]) continue;
        const cellX = pieceX + col, cellY = pieceY + row;
        if (!hitsCell(cellX, cellY, x, y, h)) continue;
        if (dirX > 0 && x < cellX + 1) x = cellX + 1;
        if (dirX < 0 && x > cellX - WIDTH) x = cellX - WIDTH;
        if (dirY > 0 && y < cellY + 1) y = cellY + 1;
        if (dirY < 0 && y > cellY - h) y = cellY - h;
      }
    }
  }
  return [x, y];
}

class Runner {
  constructor(x, y) {
    Object.assign(this, { x, y, vx: 0, vy: 0, height: HEIGHT, onGround: false, facingRight: true,
      exploding: false, explodeTime: 0, particles: [] });
  }

  clone() { return Object.assign(new Runner(0, 0), this); }

  // direction is -1 (left), 0, or 1 (right). The falling piece is solid, so the
  // player can stand on it and bump into it.
  update(grid, cells, pieceX, pieceY, dt, direction, jump) {
    // spring back up to full height (feet stay put) if there's room above
    if (this.height < HEIGHT) {
      const newHeight = Math.min(HEIGHT, this.height + REGROW_SPEED * dt);
      const newY = this.y + this.height - newHeight;
      if (!blocked(grid, cells, pieceX, pieceY, this.x, newY, newHeight)) {
        this.y = newY;
        this.height = newHeight;
      }
    }

    this.vx = direction * RUN_SPEED;
    if (direction) this.facingRight = direction > 0;
    if (jump && this.onGround) this.vy = -JUMP_SPEED;
    // exact for constant gravity, so the jump really peaks at JUMP_HEIGHT
    const fallY = this.vy * dt + 0.5 * GRAVITY * dt * dt;
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);

    // move one axis at a time and snap against whatever cell we ran into
    let newX = this.x + this.vx * dt;
    if (blocked(grid, cells, pieceX, pieceY, newX, this.y, this.height)) {
      newX = this.vx > 0 ? Math.floor(newX + WIDTH - EPS) - WIDTH : Math.floor(newX) + 1;
      // a snap should only ever stop us short, never throw us backwards
      const backwards = this.vx > 0 ? newX < this.x : newX > this.x;
      if (backwards || blocked(grid, cells, pieceX, pieceY, newX, this.y, this.height)) newX = this.x;
    }
    this.x = newX;

    this.onGround = false;
    let newY = this.y + fallY;
    if (blocked(grid, cells, pieceX, pieceY, this.x, newY, this.height)) {
      // land on top of whatever's below; a ceiling (possibly a piece partway between
      // rows while it squishes us) just stops the jump
      if (this.vy > 0) {
        newY = Math.floor(newY + this.height - EPS) - this.height;
        this.onGround = true;
      }
      if (this.vy <= 0 || blocked(grid, cells, pieceX, pieceY, this.x, newY, this.height)) newY = this.y;
      this.vy = 0;
    }
    this.y = newY;

    // the first tiny step of a fall can be smaller than EPS and miss the floor, so also
    // count as grounded when resting right on top of something
    if (!this.onGround && this.vy >= 0 && blocked(grid, cells, pieceX, pieceY, this.x, this.y + 0.01, this.height)) {
      this.onGround = true;
    }
  }

  // True when locked blocks end up inside the player, e.g. rows shifting down after a clear
  overlapsGrid(grid) { return overlapsSolid(grid, this.x, this.y, this.height); }

  // Check before the falling piece moves: is the player standing on top of it?
  standingOn(cells, pieceX, pieceY) {
    return !hitsPiece(cells, pieceX, pieceY, this.x, this.y, this.height)
      && hitsPiece(cells, pieceX, pieceY, this.x, this.y + 0.05, this.height);
  }

  // Call after the falling piece moved by (dx, dy) and/or was reshaped (rotated or newly
  // spawned). Carries the player along if it was riding the piece, otherwise shoves the
  // player out of the way. Returns false if there was nowhere to go.
  afterPieceMoved(grid, cells, pieceX, pieceY, dx, dy, riding, reshaped) {
    // ride along with the piece, unless something in the grid is in the way
    if (riding && (dx || dy) && !overlapsSolid(grid, this.x + dx, this.y + dy, this.height)) {
      this.x += dx;
      this.y += dy;
    }
    if (!hitsPiece(cells, pieceX, pieceY, this.x, this.y, this.height)) return true;

    // A piece moving into the player can shove it the way the piece is moving, as far as
    // it takes. Any other way out only works if it's a tiny pop of up to POP_MARGIN.
    // A rotation or new spawn has no direction, so any way out works.
    let best = null;
    for (const [dirX, dirY] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const [newX, newY] = pushOut(cells, pieceX, pieceY, dirX, dirY, this.height, this.x, this.y);
      if (blocked(grid, cells, pieceX, pieceY, newX, newY, this.height)) continue;
      const distance = Math.abs(newX - this.x) + Math.abs(newY - this.y);
      const withMotion = (dirX && dirX * dx > 0) || (dirY && dirY * dy > 0);
      if (!reshaped && !withMotion && distance > POP_MARGIN) continue;
      if (!best || distance < best.distance) best = { x: newX, y: newY, distance };
    }
    if (!best) return false;
    if (best.y < this.y) this.vy = 0;    // shoved up onto the piece, so stop any fall
    this.x = best.x;
    this.y = best.y;
    return true;
  }

  // Flattens the player under a piece pressing down on it (feet stay put).
  // Returns true once it's squished down to one art pixel tall.
  squishUnder(cells, pieceX, pieceY) {
    // the top of the player gets pushed down to the bottom of whatever piece cells are on it
    let top = this.y;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (!cells[row][col]) continue;
        const cellX = pieceX + col, cellY = pieceY + row;
        if (hitsCell(cellX, cellY, this.x, this.y, this.height) && cellY + 1 > top) top = cellY + 1;
      }
    }
    const feet = this.y + this.height;
    if (top > this.y) {
      this.y = top;
      this.height = feet - top;
    }
    return this.height <= MIN_HEIGHT + EPS;
  }

  // Where the sprite gets drawn: squished sprites are shorter and fatter, centered on the
  // hitbox with feet on the ground. The top-left corner and the size of each art pixel.
  layout() {
    const squish = 1 - this.height / HEIGHT;    // 0 normally, nearly 1 when flattened
    const pixelW = (CELL / 8) * (1 + (MAX_FATNESS - 1) * squish);
    const pixelH = (this.height * CELL) / 6;
    const left = (this.x + WIDTH / 2) * CELL - (pixelW * 5) / 2;
    return { left, top: this.y * CELL, pixelW, pixelH };
  }

  spriteRow(row) {
    if (row < 5) return SPRITE[row];
    // feet tucked while in the air, alternating every quarter block while walking
    if (!this.onGround) return JUMP_FEET;
    if (this.vx && Math.floor(this.x * 4) % 2 === 0) return STEP_FEET;
    return SPRITE[5];
  }

  explode() {
    this.exploding = true;
    this.explodeTime = 0;
    // every art pixel of the (squished) sprite flies off on its own
    const { left, top, pixelW, pixelH } = this.layout();
    const centerX = left + (pixelW * 5) / 2;
    this.particles = [];
    for (let row = 0; row < 6; row++) {
      const line = this.spriteRow(row);
      for (let col = 0; col < 5; col++) {
        const c = line[this.facingRight ? col : 4 - col];
        if (c === '.') continue;
        const x = left + (col + 0.5) * pixelW;
        this.particles.push({ x, y: top + (row + 0.5) * pixelH,
          vx: (x - centerX) * 12 + randomValue(-120, 120), vy: -randomValue(200, 450), colour: SPRITE_COLOURS[c] });
      }
    }
  }

  updateExplosion(dt) {
    this.explodeTime += dt;
    for (const p of this.particles) {
      p.vy += PARTICLE_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  explosionDone() { return this.exploding && this.explodeTime >= EXPLODE_DURATION; }

  draw(ctx) {
    if (this.exploding) {
      // quick white flash where the player was, then the bits fade out as they fly
      if (this.explodeTime < 0.1) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc((this.x + WIDTH / 2) * CELL, (this.y + this.height) * CELL, 10 + this.explodeTime * 300, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = Math.max(0, 1 - this.explodeTime / EXPLODE_DURATION);
      const size = CELL / 8;
      for (const p of this.particles) {
        ctx.fillStyle = p.colour;
        ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
      }
      ctx.globalAlpha = 1;
      return;
    }
    const { left, top, pixelW, pixelH } = this.layout();
    for (let row = 0; row < 6; row++) {
      const line = this.spriteRow(row);
      for (let col = 0; col < 5; col++) {
        const c = line[this.facingRight ? col : 4 - col];
        if (c === '.') continue;
        // round each edge (not each size) so neighbouring pixels don't leave gaps
        const x0 = Math.round(left + col * pixelW), x1 = Math.round(left + (col + 1) * pixelW);
        const y0 = Math.round(top + row * pixelH);
        const y1 = Math.max(Math.round(top + (row + 1) * pixelH), y0 + 1);   // every row at least a pixel tall
        ctx.fillStyle = SPRITE_COLOURS[c];
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  }
}

// --- the game -------------------------------------------------------------------
// How a try at moving the falling piece went
const MOVED = 0, BLOCKED_BY_GRID = 1, BLOCKED_BY_PLAYER = 2;

function newGame() {
  const g = {
    clock: 0,                            // seconds of play, so a hidden tab doesn't jump ahead
    hat: [], speed: 0.3, score: 0,
    grid: emptyBoard(),
    bot: true, needPlan: true, plan: { valid: false }, planStep: 0, botTimer: 0,
    player: new Runner(4.7, ROWS - 0.75),
    squishing: false,                    // the piece's next step down would crush the player, so it presses slowly
    squishOffset: 0,                     // how far (in cells) the piece has pressed toward its next row
    over: null,                          // why the game ended: 'squished' or 'topped out'
  };
  g.timer = 0;
  g.focus = SHAPES[drawFromHat(g)];
  g.nextType = drawFromHat(g);           // known ahead of time so the bot can plan for it
  g.score += 10;
  [g.x, g.y] = SPAWN;
  return g;
}

// pulls the next shape out of the bag, refilling it (and speeding up) when empty
function drawFromHat(g) {
  if (!g.hat.length) {
    g.hat = [0, 1, 2, 3, 4, 5, 6];
    for (let i = g.hat.length - 1; i > 0; i--) {
      const j = randomValue(0, i);
      [g.hat[i], g.hat[j]] = [g.hat[j], g.hat[i]];
    }
    if (g.score) g.speed *= 0.9;         // not for the very first bag
  }
  return g.hat.pop();
}

// Every move of the falling piece is checked against the player first: it can carry them
// (riding on top) or shove them, but a move that would crush them doesn't happen.
function tryMovePiece(g, dx, dy) {
  if (!locationOpen(g.grid, g.focus, g.x + dx, g.y + dy)) return BLOCKED_BY_GRID;
  const moved = g.player.clone();
  const riding = g.player.standingOn(g.focus, g.x, g.y);
  if (!moved.afterPieceMoved(g.grid, g.focus, g.x + dx, g.y + dy, dx, dy, riding, false)) return BLOCKED_BY_PLAYER;
  g.player = moved;
  g.x += dx;
  g.y += dy;
  return MOVED;
}

function tryRotatePiece(g) {
  const rotated = rotate(g.focus);
  if (!locationOpen(g.grid, rotated, g.x, g.y)) return BLOCKED_BY_GRID;
  const moved = g.player.clone();
  if (!moved.afterPieceMoved(g.grid, rotated, g.x, g.y, 0, 0, false, true)) return BLOCKED_BY_PLAYER;
  g.focus = rotated;
  g.player = moved;
  return MOVED;
}

// does the bot's next rotation or one-column slide, returns whether it happened.
// If the player is in the way it waits and tries again later.
function botAction(g) {
  let result = BLOCKED_BY_GRID;
  if (g.planStep < g.plan.rotations) result = tryRotatePiece(g);
  else if (g.plan.x !== g.x) result = tryMovePiece(g, g.plan.x > g.x ? 1 : -1, 0);
  if (result === BLOCKED_BY_GRID) g.plan.valid = false;
  if (result === MOVED) g.planStep++;
  return result === MOVED;
}

// the bot's next action is due once the piece has fallen to its scheduled row
const botActionDue = (g) => g.bot && g.plan.valid && g.planStep < g.plan.actionCount && g.y >= g.plan.actionRows[g.planStep];

// One frame. `pressed` holds keys that went down this frame, `held` keys that are down.
function step(g, dt, pressed, held) {
  g.clock += dt;
  const { player } = g;

  // everything stops while the player blows up, then it's game over
  if (player.exploding) {
    player.updateExplosion(dt);
    if (player.explosionDone()) g.over = 'squished';
    return;
  }

  if (pressed.has('KeyB')) {
    g.bot = !g.bot;
    g.needPlan = true;
  }

  if (g.squishing) {
    // the piece holds still apart from pressing down on the player
    g.squishOffset += SQUISH_SPEED * dt;
    g.timer = g.clock;
    if (g.player.squishUnder(g.focus, g.x, g.y + g.squishOffset)) g.player.explode();
  } else if (g.bot) {
    if (g.needPlan) {
      g.plan = findBestMove(g.grid, g.focus, g.x, g.y, g.nextType);
      g.planStep = 0;
      g.needPlan = false;
    }
    // rotate first, then slide, then let gravity bring it down (no fast drop, so the
    // player has time to get out of the way). Each action waits for its scheduled row,
    // and actions due on the same row are paced out so you can watch them.
    if (botActionDue(g) && g.clock > g.botTimer + Math.min(g.speed / 4, 0.05)) {
      g.botTimer = g.clock;
      botAction(g);
    }
  } else if (pressed.has('ArrowRight')) tryMovePiece(g, 1, 0);
  else if (pressed.has('ArrowLeft')) tryMovePiece(g, -1, 0);
  else if (pressed.has('ArrowUp')) tryRotatePiece(g);
  else if (pressed.has('ArrowDown')) while (tryMovePiece(g, 0, 1) === MOVED);

  // the piece steps down a row every `speed` seconds
  if (!g.squishing && g.clock > g.timer + g.speed) {
    g.timer = g.clock;
    // never let the piece fall past a row with bot actions still waiting on it
    while (botActionDue(g) && botAction(g));

    const fall = tryMovePiece(g, 0, 1);
    if (fall === BLOCKED_BY_PLAYER) {
      g.squishing = true;
      g.squishOffset = 0;
    } else if (fall === BLOCKED_BY_GRID) {
      addToGrid(g.grid, g.focus, g.x, g.y);
      g.score += 100 * clearLines(g.grid);
      g.focus = SHAPES[g.nextType];
      g.nextType = drawFromHat(g);
      g.needPlan = true;
      g.score += 10;
      [g.x, g.y] = SPAWN;
      if (!locationOpen(g.grid, g.focus, g.x, g.y)) { g.over = 'topped out'; return; }
      // a piece appearing right on top of the player with no way out
      const moved = g.player.clone();
      if (moved.afterPieceMoved(g.grid, g.focus, g.x, g.y, 0, 0, false, true)) g.player = moved;
      else g.player.explode();
    }
  }

  // runner controls: A/D/W always, arrows and space too while the bot plays tetris
  const key = (code) => held.has(code);
  const direction = (key('KeyD') || (g.bot && key('ArrowRight'))) - (key('KeyA') || (g.bot && key('ArrowLeft')));
  const jump = key('KeyW') || (g.bot && (key('ArrowUp') || key('Space')));

  // small fixed steps so a slow frame can't tunnel the player through blocks
  const steps = Math.floor(dt / (1 / 120)) + 1;
  for (let i = 0; i < steps && !g.player.exploding; i++) {
    g.player.update(g.grid, g.focus, g.x, g.y + g.squishOffset, dt / steps, direction, jump);
  }

  if (g.squishing && !g.player.exploding) {
    // got out from under it? then the piece finishes its step down and carries on
    const pressedDown = g.squishOffset;
    g.squishOffset = 0;
    if (tryMovePiece(g, 0, 1) === MOVED) {
      g.squishing = false;
      g.timer = g.clock;
    } else {
      g.squishOffset = pressedDown;
    }
  }

  // blocks shifting down onto you after a line clear
  if (!g.player.exploding && g.player.overlapsGrid(g.grid)) g.player.explode();
}

function draw(ctx, g, blocks) {
  ctx.fillStyle = 'rgb(130, 130, 130)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let col = 0; col <= COLS; col++) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(col * CELL, 0, 1, ROWS * CELL);
    ctx.fillStyle = '#000';
    ctx.fillRect(col * CELL + 1, 0, 1, ROWS * CELL);
  }
  for (let row = 0; row <= ROWS; row++) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, row * CELL, COLS * CELL, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, row * CELL + 1, COLS * CELL, 1);
  }
  const cell = (col, row, type, offsetY = 0) => {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    ctx.drawImage(blocks, (type - 1) * 8, 0, 8, 8, col * CELL, row * CELL + offsetY, CELL, CELL);
  };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) if (g.grid[row][col]) cell(col, row, g.grid[row][col]);
  }
  if (!g.over) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) if (g.focus[row][col]) cell(g.x + col, g.y + row, g.focus[row][col], Math.floor(g.squishOffset * CELL));
    }
  }
  g.player.draw(ctx);
}

// --- the arcade machine's screen ------------------------------------------------
// `root` is the overlay: a [data-board] canvas, [data-score], [data-time],
// [data-best] and [data-bot] read-outs, a [data-over] panel with a [data-message]
// and a [data-again] button, and [data-close] buttons. Returns { open, close, isOpen }.
export function makeArcade(root, blocksUrl) {
  const canvas = root.querySelector('[data-board]');
  canvas.width = COLS * CELL + 2;        // the last grid line is two pixels wide
  canvas.height = ROWS * CELL + 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const blocks = new Image();
  blocks.src = blocksUrl;
  const field = (name) => root.querySelector(`[data-${name}]`);

  let game = null;
  let open = false;
  let frame = 0;
  let last = 0;
  const held = new Set();
  const pressed = new Set();

  let best = 0;
  try { best = Number(localStorage.getItem('arcade.best')) || 0; } catch (e) { /* storage blocked */ }

  const setText = (name, text) => { if (field(name).textContent !== text) field(name).textContent = text; };

  function restart() {
    game = newGame();
    field('over').hidden = true;
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!game.over) {
      step(game, dt, pressed, held);
      if (game.over) {
        const survived = game.clock;
        best = Math.max(best, survived);
        try { localStorage.setItem('arcade.best', String(best)); } catch (e) { /* storage blocked */ }
        setText('message', game.over === 'squished' ? 'Squished!' : 'The bot topped out!');
        field('over').hidden = false;
        field('again').focus();
      }
    }
    pressed.clear();
    if (blocks.complete) draw(ctx, game, blocks);
    setText('score', String(game.score));
    setText('time', game.clock.toFixed(1) + 's');
    setText('best', best ? best.toFixed(1) + 's' : '-');
    setText('bot', game.bot ? 'on' : 'off');
    frame = requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Escape') { close(); return; }
    if (game.over && (e.code === 'Enter' || e.code === 'KeyR')) { e.preventDefault(); restart(); return; }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  function show() {
    root.style.display = '';             // not `hidden`: its Tailwind `flex` class would override that
    open = true;
    held.clear();
    restart();
    last = performance.now();
    frame = requestAnimationFrame(loop);
  }
  function close() {
    root.style.display = 'none';
    open = false;
    cancelAnimationFrame(frame);
    document.activeElement?.blur();      // so the arrow keys go back to walking
  }
  field('again').addEventListener('click', restart);
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  return { open: show, close, get isOpen() { return open; } };
}

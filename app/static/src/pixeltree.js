// Shared pixel-art tree and character code, used by trees.js and projects.js.
// Tree growth is a JavaScript port of https://github.com/4b3c/ProceduralTrees
window.PixelTree = (function () {
  // --- constants.py -------------------------------------------------------
  const TRUNK_WIDTH_POWER = 3 / 4;
  const LEAVES_DENSITY = [1, 2, 2];      // leaves per colour layer on each node
  const LEAVES_SHADOW_RATIO = 1.5;       // how much the shadow gets squashed
  const CHILDREN_FOR_LEAVES = 6;         // only small branches get leaves

  const LEAF_SIZE = 64;
  const START_ANGLE = 90;
  const MIN_LEFT = 100, MAX_LEFT = 145;
  const MIN_RIGHT = 35, MAX_RIGHT = 80;

  const BEND_AGE = -3;
  const GROW_AGE = 12;
  const GROW_LEN = 2;

  const PIXEL = 4;                       // size of one "art pixel" in screen pixels

  // Per-tree settings; pass any of these to new Tree(seed, palette, opts) to change them.
  // startLen/minLen/maxLen/falloff 1 are the original constants.py behaviour.
  const DEFAULTS = {
    startLen: 30,
    minLen: 12, maxLen: 40,
    falloff: 1,              // new branches get this much shorter per age step
    maxNodes: 80,            // hard cap so the tree always fits in its box
    maxAge: Infinity,        // stop growing at this age
    leaves: true,            // false draws a bare tree
    box: [400, 600],         // size of the canvas the tree is drawn on
    base: [200, 500],        // where the trunk starts inside that box
  };

  // --- palettes.json ------------------------------------------------------
  const PALETTES = {
    green: {
      leaves0: [100, 140, 50, 255], leaves1: [90, 130, 40, 255], leaves2: [80, 120, 30, 255],
      leaves_outline: [68, 94, 52, 255],
      trunk0: [133, 94, 41, 255], trunk1: [102, 68, 20, 255], trunk_outline: [79, 58, 28, 255],
      shadow_color: [0, 0, 0, 100],
    },
    autumn: {
      leaves0: [232, 177, 12, 255], leaves1: [245, 149, 57, 255], leaves2: [218, 64, 27, 255],
      leaves_outline: [200, 47, 49, 255],
      trunk0: [133, 94, 41, 255], trunk1: [102, 68, 20, 255], trunk_outline: [79, 58, 28, 255],
      shadow_color: [0, 0, 0, 100],
    },
    cherry: {
      leaves0: [255, 194, 205, 255], leaves1: [245, 147, 172, 255], leaves2: [235, 98, 137, 255],
      leaves_outline: [255, 8, 74, 255],
      trunk0: [133, 94, 41, 255], trunk1: [102, 68, 20, 255], trunk_outline: [79, 58, 28, 255],
      shadow_color: [0, 0, 0, 100],
    },
    custom0: {
      leaves0: [182, 194, 205, 255], leaves1: [108, 147, 215, 255], leaves2: [111, 129, 177, 255],
      leaves_outline: [91, 86, 152, 255],
      trunk0: [149, 92, 51, 255], trunk1: [126, 44, 28, 255], trunk_outline: [97, 29, 17, 255],
      shadow_color: [0, 0, 0, 100],
    },
    custom1: {
      leaves0: [212, 155, 12, 255], leaves1: [213, 101, 10, 255], leaves2: [244, 56, 7, 255],
      leaves_outline: [224, 116, 12, 255],
      trunk0: [138, 60, 14, 255], trunk1: [119, 43, 21, 255], trunk_outline: [97, 29, 17, 255],
      shadow_color: [0, 0, 0, 100],
    },
    custom2: {
      leaves0: [182, 131, 205, 255], leaves1: [108, 87, 215, 255], leaves2: [111, 76, 177, 255],
      leaves_outline: [91, 38, 152, 255],
      trunk0: [92, 92, 51, 255], trunk1: [49, 44, 28, 255], trunk_outline: [22, 29, 17, 255],
      shadow_color: [0, 0, 0, 100],
    },
  };

  const css = ([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a / 255})`;

  // --- random numbers ---------------------------------------------------
  // A seeded generator, so the exact same tree can be re-grown for the video export.
  function makeRng(seed) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      randint: (a, b) => a + Math.floor(next() * (b - a + 1)),  // inclusive, like Python's
      choice: (arr) => arr[Math.floor(next() * arr.length)],
    };
  }

  // --- node.py ------------------------------------------------------------
  class Node {
    constructor(tree, age, length, angle) {
      this.tree = tree;
      this.age = age;
      this.length = length;
      this.angle = angle;      // absolute angle in degrees, 90 = straight up
      this.left = null;
      this.right = null;
      // leaves.py: random spots on a 64x64 square, one list per colour layer
      this.leafSpots = LEAVES_DENSITY.map((n) =>
        Array.from({ length: n }, () => [tree.rng.randint(0, LEAF_SIZE), tree.rng.randint(0, LEAF_SIZE)])
      );
      this.leafCanvas = null;  // drawn lazily, thrown away when the palette changes
    }

    newChild(age, minAngle, maxAngle) {
      const rng = this.tree.rng;
      const o = this.tree.opts;
      const length = Math.max(rng.randint(o.minLen, o.maxLen) - age * o.falloff, o.minLen);
      const angle = rng.randint(minAngle, maxAngle);
      return new Node(this.tree, age * 2, length, angle);
    }

    grow(age) {
      const n = this.tree.rng.randint(1, 3);
      if (n === 1 && !this.left) this.left = this.newChild(age, MIN_LEFT, MAX_LEFT);
      else if (n === 2 && !this.right) this.right = this.newChild(age, MIN_RIGHT, MAX_RIGHT);
      else {
        this.length += GROW_LEN;
        this.age += GROW_AGE;
      }
    }

    bend(amount) {
      if (this.angle > MAX_LEFT || this.angle < MIN_RIGHT) return;
      this.angle += amount;
      this.age += BEND_AGE;
      if (this.left) this.left.age += BEND_AGE;
      if (this.right) this.right.age += BEND_AGE;
    }

    leaves() {
      if (this.leafCanvas) return this.leafCanvas;
      const c = document.createElement('canvas');
      c.width = c.height = LEAF_SIZE;
      const ctx = c.getContext('2d');
      const p = this.tree.palette;
      [p.leaves0, p.leaves1, p.leaves2].forEach((colour, layer) => {
        ctx.fillStyle = css(colour);
        for (const [x, y] of this.leafSpots[layer]) {
          ctx.fillRect(x, y, 12, 12);
          ctx.fillRect(x + 4, y + 4, 12, 12);
        }
      });
      return (this.leafCanvas = c);
    }
  }

  // Number of nodes in this subtree, including itself.
  function count(node) {
    return node ? 1 + count(node.left) + count(node.right) : 0;
  }

  // Returns [age, node] for the youngest node in the subtree.
  function youngest(node) {
    if (!node) return [10000, null];
    const l = youngest(node.left);
    const r = youngest(node.right);
    if (node.age < l[0] && node.age < r[0]) return [node.age, node];
    return l[0] < r[0] ? l : r;
  }

  // Random node that has both children (or null). Each side gets two tickets.
  // The Python version recursed into each side twice, which takes exponentially
  // long on deep trees; listing one pick twice gives exactly the same odds.
  function randomChild(node, rng) {
    if (!node || !node.left || !node.right) return null;
    const left = randomChild(node.left, rng);
    const right = randomChild(node.right, rng);
    return rng.choice([node, left, left, right, right].filter(Boolean));
  }

  // Polar offset from a point (y flipped, since canvas y points down).
  function endOf(start, length, degrees) {
    const a = (degrees * Math.PI) / 180;
    return [start[0] + length * Math.cos(a), start[1] - length * Math.sin(a)];
  }

  // A branch is a bundle of parallel 3px lines, darker on one side for shading.
  function drawParallelLines(ctx, start, stop, perp, width, p) {
    ctx.lineWidth = 3;
    for (let i = Math.round(-width / 2); i <= Math.round(width / 2); i++) {
      const dx = i * Math.cos(perp);
      const dy = -i * Math.sin(perp);
      const flare = Math.abs(i) ** (2 / 3);   // widens the base, narrows the tip
      ctx.strokeStyle = css(i < -1 ? p.trunk1 : p.trunk0);
      ctx.beginPath();
      ctx.moveTo(start[0] + dx, start[1] + dy - flare);
      ctx.lineTo(stop[0] + dx, stop[1] + dy + flare);
      ctx.stroke();
    }
  }

  function drawBranches(ctx, node, start) {
    if (!node) return;
    const pos = endOf(start, node.length, node.angle);
    const width = count(node) ** TRUNK_WIDTH_POWER;
    const p = node.tree.palette;

    // fills the gaps where sharply bent branches meet
    ctx.fillStyle = css(p.trunk0);
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], width * 0.6, 0, Math.PI * 2);
    ctx.fill();

    drawParallelLines(ctx, start, pos, ((node.angle + 90) * Math.PI) / 180, width, p);
    drawBranches(ctx, node.left, pos);
    drawBranches(ctx, node.right, pos);
  }

  function drawLeaves(ctx, node, start) {
    if (!node) return;
    const pos = endOf(start, node.length, node.angle);
    if (count(node) < CHILDREN_FOR_LEAVES) {
      ctx.drawImage(node.leaves(), Math.floor(pos[0] - LEAF_SIZE / 2), Math.floor(pos[1] - LEAF_SIZE / 2));
    }
    drawLeaves(ctx, node.left, pos);
    drawLeaves(ctx, node.right, pos);
  }

  // --- tree.py ------------------------------------------------------------
  class Tree {
    constructor(seed, palette, opts = {}) {
      this.rng = makeRng(seed);
      this.palette = palette;
      this.opts = { ...DEFAULTS, ...opts };
      this.age = 0;
      this.root = new Node(this, this.age, this.opts.startLen, START_ANGLE);
    }

    // One growth step. Returns false once the tree is fully grown.
    grow() {
      if (this.age >= this.opts.maxAge || count(this.root) >= this.opts.maxNodes) return false;
      this.age++;
      youngest(this.root)[1].grow(this.age);

      // bend the lighter side of a random fork away, so the crown balances out
      const fork = randomChild(this.root, this.rng);
      if (fork) {
        if (count(fork.left) < count(fork.right)) fork.left.bend(1);
        else fork.right.bend(-1);
      }
      return true;
    }

    setPalette(palette) {
      this.palette = palette;
      const clear = (n) => { if (n) { n.leafCanvas = null; clear(n.left); clear(n.right); } };
      clear(this.root);
    }
  }

  // --- pixel art rendering ------------------------------------------------
  const full = document.createElement('canvas');
  const fullCtx = full.getContext('2d', { willReadFrequently: true });

  // Runs `draw` on a full-size scratch canvas and returns it shrunk by PIXEL,
  // sampling the top-left pixel of each block (what pygame.transform.scale does).
  // Pixels end up either fully opaque or fully transparent.
  function drawSmall(draw, [W, H]) {
    if (full.width !== W || full.height !== H) {
      full.width = W;
      full.height = H;
    }
    fullCtx.imageSmoothingEnabled = false;
    fullCtx.clearRect(0, 0, W, H);
    draw(fullCtx);
    const SW = W / PIXEL;
    const SH = H / PIXEL;
    const src = fullCtx.getImageData(0, 0, W, H).data;
    const out = new ImageData(SW, SH);
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const s = (y * PIXEL * W + x * PIXEL) * 4;
        const d = (y * SW + x) * 4;
        if (src[s + 3] > 127) {
          out.data[d] = src[s];
          out.data[d + 1] = src[s + 1];
          out.data[d + 2] = src[s + 2];
          out.data[d + 3] = 255;
        }
      }
    }
    return out;
  }

  const solid = (img, i) => img.data[i * 4 + 3] > 0;

  // Paints `colour` into every empty pixel that touches a filled one (up/down/left/right).
  function outline(img, colour) {
    const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = y * img.width + x;
        if (solid(img, i)) continue;
        const touches =
          (x > 0 && solid(img, i - 1)) ||
          (x < img.width - 1 && solid(img, i + 1)) ||
          (y > 0 && solid(img, i - img.width)) ||
          (y < img.height - 1 && solid(img, i + img.width));
        if (touches) out.data.set(colour, i * 4);
      }
    }
    return out;
  }

  // Squashed silhouette of the leaves, plus where to put it so it sits under the tree.
  // It's drawn solid here; the see-through-ness is added once for the whole forest
  // so overlapping shadows don't get darker.
  // A bare tree (pinToBase) gets squashed by 2 and pinned to its trunk instead,
  // since its branches sit much lower than a crown of leaves would.
  function shadow(leaves, base, pinToBase = false) {
    const ratio = pinToBase ? 2 : LEAVES_SHADOW_RATIO;
    const colour = [0, 0, 0, 255];
    const SW = leaves.width;
    const SH = leaves.height;
    const SHADOW_BASE = base[1] - 30;
    const sh = Math.floor(SH / ratio);
    const out = new ImageData(SW, sh);
    let sumY = 0;
    let n = 0;
    for (let i = 0; i < SW * SH; i++) {
      if (solid(leaves, i)) { sumY += Math.floor(i / SW); n++; }
    }
    for (let y = 0; y < sh; y++) {
      const srcRow = Math.floor(y * ratio);
      for (let x = 0; x < SW; x++) {
        if (solid(leaves, srcRow * SW + x)) out.data.set(colour, (y * SW + x) * 4);
      }
    }
    // centroid of the leaves in full-size pixels, like pygame's mask.centroid()
    const cy = n ? (sumY / n) * PIXEL + PIXEL / 2 : 0;
    const top = pinToBase
      ? base[1] - base[1] / ratio      // the trunk's foot lands on its own shadow
      : SHADOW_BASE - Math.floor(cy / ratio);
    return { img: out, y: Math.round(top / PIXEL) * PIXEL };  // snap to the pixel grid
  }

  // Turns small ImageData into a canvas we can drawImage() from later.
  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // The three pixel-art layers for one tree, in art pixels.
  function renderLayers(tree) {
    const p = tree.palette;
    const { box, base } = tree.opts;
    const branches = outline(drawSmall((c) => drawBranches(c, tree.root, base), box), p.trunk_outline);
    const leaves = tree.opts.leaves
      ? outline(drawSmall((c) => drawLeaves(c, tree.root, base), box), p.leaves_outline)
      : new ImageData(branches.width, branches.height);
    // a bare tree's shadow comes from its branches instead
    const s = tree.opts.leaves ? shadow(leaves, base) : shadow(branches, base, true);
    return {
      shadow: toCanvas(s.img),
      shadowY: s.y,
      branches: toCanvas(branches),
      leaves: toCanvas(leaves),
    };
  }

  // --- character sprites --------------------------------------------------
  // Each letter is one art pixel. The body and legs are split so the legs can animate.
  // Leg sets are four-frame walk cycles; frame 0 is also the standing pose.
  const SPRITE_OUTLINE = [40, 30, 30, 255];

  const EXPLORER = {
    colours: {
      h: [92, 54, 30, 255],    // hair
      s: [238, 196, 150, 255], // skin
      e: [40, 28, 28, 255],    // eyes
      r: [170, 50, 30, 255],   // shirt
      d: [120, 30, 10, 255],   // shirt shade
      p: [60, 64, 100, 255],   // trousers
      b: [70, 45, 30, 255],    // boots
    },
    bodies: {
      down: ['..hhhh..', '.hhhhhh.', '.hssssh.', '.sesses.', '..ssss..',
             '.rrrrrr.', 'drrrrrrd', 'sdrrrrds', '..pppp..', '..pppp..'],
      up:   ['..hhhh..', '.hhhhhh.', '.hhhhhh.', '.hhhhhh.', '..ssss..',
             '.rrrrrr.', 'drrrrrrd', 'sdrrrrds', '..pppp..', '..pppp..'],
      right: ['..hhhh..', '.hhhhhh.', '.hhhsss.', '.hhhses.', '..ssss..',
              '..rrrr..', '..rrdr..', '..rrsr..', '..pppp..', '..pppp..'],
    },
    legs: {
      down: [['..p..p..', '.bb..bb.'], ['..p..b..', '.bb.....'],
             ['..p..p..', '.bb..bb.'], ['..b..p..', '.....bb.']],
      right: [['...pp...', '...bbb..'], ['..p..p..', '.bb..bb.'],
              ['...pp...', '...bbb..'], ['..p..p..', '.bb..bb.']],
    },
  };

  const GIRL = {
    colours: {
      y: [240, 205, 95, 255],  // blond hair
      Y: [205, 160, 55, 255],  // hair shade
      r: [220, 50, 60, 255],   // bow
      s: [238, 196, 150, 255], // skin
      e: [40, 28, 28, 255],    // eyes
      k: [235, 120, 160, 255], // dress
      K: [190, 80, 120, 255],  // dress shade
      b: [120, 60, 50, 255],   // shoes
    },
    bodies: {
      down: ['..yyyyrr', '.yyyyyy.', 'yyssssyy', 'YsessesY', 'YYssssYY',
             'YkkkkkkY', 'sKkkkkKs', '.kkkkkk.', 'kkkkkkkk', 'KKKKKKKK'],
      up:   ['..yyyyrr', '.yyyyyy.', 'yyyyyyyy', 'yyyyyyyy', 'YyyyyyyY',
             'YyyyyyyY', 'sKyyyyKs', '.kkkkkk.', 'kkkkkkkk', 'KKKKKKKK'],
      right: ['rryyyy..', '.yyyyyy.', 'yyyysss.', 'yyyyses.', 'YYYsss..',
              'YYkkkk..', 'Y.kkKk..', '..kkks..', '.kkkkkk.', '.KKKKKK.'],
    },
    legs: {
      down: [['..s..s..', '..b..b..'], ['..s..b..', '..b.....'],
             ['..s..s..', '..b..b..'], ['..b..s..', '.....b..']],
      right: [['...ss...', '...bb...'], ['..s..s..', '.bb..bb.'],
              ['...ss...', '...bb...'], ['..s..s..', '.bb..bb.']],
    },
  };

  const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));

  function makeSprite(rows, colours) {
    const img = new ImageData(rows[0].length + 2, rows.length + 2);  // 1px border for the outline
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (colours[ch]) img.data.set(colours[ch], ((y + 1) * img.width + x + 1) * 4);
    }));
    return toCanvas(outline(img, SPRITE_OUTLINE));
  }

  // { down: [4 frames], up: [...], right: [...], left: [...] }
  function makeSprites({ colours, bodies, legs }) {
    const frames = (dir, legDir, flip) => legs[legDir].map((l) => {
      const rows = [...bodies[dir], ...l];
      return makeSprite(flip ? mirror(rows) : rows, colours);
    });
    return {
      down: frames('down', 'down'),
      up: frames('up', 'down'),
      right: frames('right', 'right'),
      left: frames('right', 'right', true),
    };
  }

  return {
    PIXEL, PALETTES, DEFAULTS, TRUNK_WIDTH_POWER,
    makeRng, Tree, count, endOf, renderLayers, outline, toCanvas,
    makeSprites, EXPLORER, GIRL,
  };
})();

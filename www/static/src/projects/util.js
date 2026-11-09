// Little helpers used all over.

// A random-looking but repeatable number in [0, 1) for a pair of whole
// numbers: the same (x, y) always gives the same number, so patterns made from
// it line up across tiles and look the same every time they're drawn.
export const hashXY = (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rgba = (c) => (c.length === 4 ? c : [...c, 255]);

// Pixel art drawn by code, not loaded from img/world/: the signs (each one
// has its own words) and the mailbox (its flag goes up).
import { FONT } from '../font.js';
import { SIGN, CABIN, outline, toCanvas } from './config.js';
import { hashXY } from './util.js';

// A wooden board with the project's name in the 3x6 pixel font, on a post.
export function makeSign(text) {
  const textW = text.length * 4 - 1;
  const boardW = textW + 6;
  const boardH = 9;
  const postH = 5;
  const img = new ImageData(boardW + 2, boardH + postH + 2);  // 1px border for the outline
  const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
  for (let y = 0; y < boardH; y++) {
    for (let x = 0; x < boardW; x++) {
      const edge = x === 0 || y === 0 || x === boardW - 1 || y === boardH - 1;
      set(x, y, edge ? SIGN.border : y === 4 && hashXY(x, text.length) < 0.3 ? SIGN.grain : SIGN.board);
    }
  }
  [...text].forEach((ch, i) => {
    const glyph = FONT[ch] || FONT[ch.toUpperCase()];
    if (!glyph) return;
    glyph.slice(0, 5).forEach((row, gy) => [...row].forEach((px, gx) => {
      if (px === '#') set(3 + i * 4 + gx, 2 + gy, SIGN.text);
    }));
  });
  const postX = Math.floor(boardW / 2) - 1;
  for (let y = boardH; y < boardH + postH; y++) {
    set(postX, y, SIGN.post);
    set(postX + 1, y, SIGN.border);
  }
  return toCanvas(outline(img, SIGN.outline));
}

// A mailbox on a post, its red flag up once you've sent a note.
export function makeMailbox(flagUp) {
  const W = 10, H = 15;
  const img = new ImageData(W + 2, H + 2);
  const set = (x, y, colour) => img.data.set(colour, ((y + 1) * img.width + x + 1) * 4);
  for (let y = 7; y < H; y++) {
    set(3, y, SIGN.post);
    set(4, y, SIGN.border);
  }
  for (let y = 1; y < 7; y++) {
    for (let x = 0; x < 8; x++) {
      if (y === 1 && (x === 0 || x === 7)) continue;          // rounded top
      set(x, y, y === 1 ? CABIN.mailLight : y === 6 || x === 0 ? CABIN.mailDark : CABIN.mail);
    }
  }
  if (flagUp) {
    for (let y = 0; y < 6; y++) set(8, y, SIGN.border);
    set(9, 0, CABIN.flag); set(9, 1, CABIN.flag);
  } else {
    set(8, 5, SIGN.border);
    set(8, 4, CABIN.flag); set(9, 4, CABIN.flag);
  }
  return toCanvas(outline(img, SIGN.outline));
}

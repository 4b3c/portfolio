import { FONT } from './font.js';

const CELL = 8;
const glow = document.getElementById('learn');
const glowCtx = glow.getContext('2d');

function render_letter(letter, x, y) {
  for (let i=0; i<letter.length; i++) {
    for (let j=0; j<letter[i].length; j++) {
      if (letter[i][j] === '#') {
        glowCtx.fillRect((x+j) * CELL, (y+i) * CELL, CELL, CELL);
      }
    }
  }
}

function animate_typing(word, x, y, step) {
  for (let i=0; i<step && i<word.length; i++) {
    render_letter(FONT[word[i]], x+(i*4), y);
  }
  if (step % 8 > 4) {
    render_letter(FONT["|"], x+(Math.min(step, word.length)*4), y);
  }

}

function resize() {
  glow.width = window.innerWidth;
  glow.height = window.innerHeight;
  glowCtx.fillStyle = 'rgba(255, 255, 255, 1)'; // resizing resets ctx state, so set it again
  }
window.addEventListener('resize', resize);
resize();

let k = 0;
let last = performance.now();
function tick(now) {
  const dt = now - last;
  last = now;
  glowCtx.clearRect(0, 0, glow.width, glow.height)


  let x = 20;
  k += dt / 40;

  const word = "Hi!"
  animate_typing(word, x, 20, Math.round(k));
  requestAnimationFrame(tick);

}

requestAnimationFrame(tick);


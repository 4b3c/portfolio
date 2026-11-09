// Drawing the forest: the ground, then everything standing on it (signs,
// the cabin, trees, you) from back to front, with their shadows underneath.
// Back to front is up the screen to down it, by where their feet land (iso.js).
import { PIXEL, PALETTES } from './config.js';
import { ctx, dpr } from './dom.js';
import { cam, view } from './camera.js';
import { state } from './state.js';
import { player } from './player.js';
import { drawGround } from './ground.js';
import { boxLeft, boxTop, onScreen } from './trees.js';
import { drawArrows } from './arrows.js';
import { toScreen } from './iso.js';

// Shadows share one layer, so where two overlap it doesn't get darker.
const shadows = document.createElement('canvas');
const shadowsCtx = shadows.getContext('2d');

// a little pixel oval on the shadow layer
function footShadow(x, y, widths) {
  widths.forEach((wide, i) => {
    shadowsCtx.fillRect(x - (wide / 2) * PIXEL, y + (i - widths.length + 1) * PIXEL + 4, wide * PIXEL, PIXEL);
  });
}

// the player's sprite with its feet at screen (x, y)
export function drawPlayer(x, y) {
  const frames = state.character.sprites[player.dir];
  const sprite = frames[Math.floor(player.anim) % frames.length];
  ctx.drawImage(sprite, x - (sprite.width * PIXEL) / 2, y - sprite.height * PIXEL + PIXEL,
    sprite.width * PIXEL, sprite.height * PIXEL);
}

export function drawScene(world) {
  const { w, h } = view;
  if (shadows.width !== w || shadows.height !== h) {
    shadows.width = w;
    shadows.height = h;
  }
  // The camera moves in single screen pixels, not whole art pixels, so the
  // grid can sit 0-7 device pixels off the screen's. Everything in the world
  // is still on the art-pixel grid, so it all shifts together.
  const cx = Math.round(cam.x * dpr) / dpr;
  const cy = Math.round(cam.y * dpr) / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawGround(cx, cy);

  shadowsCtx.clearRect(0, 0, w, h);
  shadowsCtx.imageSmoothingEnabled = false;
  shadowsCtx.fillStyle = '#000';
  const things = [];
  const { trailSign, cabin, arcadeMachine, mailbox, socials, allTrees } = world;
  // Things are drawn in order of how far down the screen their feet are. But
  // the cabin stands on a box of ground with its feet at the front corner:
  // something beside one of its front walls is in front of it, even with its
  // feet higher up the screen than that corner. `half` is how far either side
  // of its feet the thing reaches, on screen.
  const cs = toScreen(cabin.x, cabin.y);
  const cabinLeft = cs.x - cabin.foot[0] * PIXEL;
  const depth = (x, y, half) => {
    const s = toScreen(x, y);
    const beside = s.x + half > cabinLeft && s.x - half < cabinLeft + cabin.sprite.width * PIXEL;
    return (x > cabin.x || y > cabin.y) && beside ? Math.max(s.y, cs.y + 0.5) : s.y;
  };
  // a sprite standing with its feet at world (x, y), with a little shadow;
  // `foot` is where its feet are in it, in art pixels, if not the bottom middle
  const stand = (sprite, x, y, shadow, foot = [sprite.width / 2, sprite.height - 1]) => {
    const s = toScreen(x, y);
    const sx = s.x - cx, sy = s.y - cy;
    if (sx < -400 || sx > w + 400 || sy < -100 || sy > h + 300) return;
    footShadow(sx, sy, shadow);
    things.push({ y: depth(x, y, (sprite.width * PIXEL) / 2), draw: () => {
      ctx.drawImage(sprite, sx - foot[0] * PIXEL, sy - foot[1] * PIXEL,
        sprite.width * PIXEL, sprite.height * PIXEL);
    } });
  };
  // the cabin's shadow: its box of ground, a little bigger toward the front
  const corner = (dx, dy) => {
    const s = toScreen(cabin.x + dx, cabin.y + dy);
    return [Math.round(s.x - cx), Math.round(s.y - cy)];
  };
  shadowsCtx.beginPath();
  for (const [dx, dy] of [[-cabin.size[0], -cabin.size[1]], [12, -cabin.size[1]], [12, 12], [-cabin.size[0], 12]]) {
    shadowsCtx.lineTo(...corner(dx, dy));
  }
  shadowsCtx.fill();
  stand(trailSign.sign, trailSign.x, trailSign.y, [3, 5]);
  stand(cabin.sprite, cabin.x, cabin.y, [], cabin.foot);
  stand(arcadeMachine.sprite, arcadeMachine.x, arcadeMachine.y, [16, 18]);
  stand(state.mailSent ? mailbox.up : mailbox.down, mailbox.x, mailbox.y, [3, 5]);
  for (const s of socials) stand(s.sign, s.x, s.y, [3, 5]);
  for (const t of allTrees) {
    if (t.sign) stand(t.sign, t.signX, t.signY, [3, 5]);
    if (!t.layers || !onScreen(t)) continue;
    const left = boxLeft(t) - cx;
    const top = boxTop(t) - cy;
    const { shadow, shadowY, branches, leaves } = t.layers;
    shadowsCtx.drawImage(shadow, left, top + shadowY, shadow.width * PIXEL, shadow.height * PIXEL);
    things.push({ y: depth(t.x, t.y, 16), draw: () => {
      ctx.drawImage(branches, left, top, branches.width * PIXEL, branches.height * PIXEL);
      ctx.drawImage(leaves, left, top, leaves.width * PIXEL, leaves.height * PIXEL);
    } });
  }
  // the player is drawn where they really are, rounded only to a screen pixel
  const p = toScreen(player.x, player.y);
  const px = Math.round((p.x - cx) * dpr) / dpr;
  const py = Math.round((p.y - cy) * dpr) / dpr;
  footShadow(px, py, [4, 6, 4]);
  things.push({ y: depth(player.x, player.y, 24), draw: () => drawPlayer(px, py) });

  ctx.globalAlpha = PALETTES.green.shadow_color[3] / 255;
  ctx.drawImage(shadows, 0, 0, w, h);
  ctx.globalAlpha = 1;

  things.sort((a, b) => a.y - b.y);
  for (const thing of things) thing.draw();
  drawArrows(world, cx, cy);
}

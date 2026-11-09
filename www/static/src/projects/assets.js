// What the forest loads: the projects, and the pixel art in img/world/.
import { canvas } from './dom.js';

// projects marked "hidden": true in projects.json are left out of the forest and the list
export const projectsLoaded = fetch(canvas.dataset.projects)
  .then((r) => r.json())
  .then((list) => list.filter((p) => !p.hidden));

// The pixel art in img/world/, one image pixel per art pixel: edit those
// PNGs to change how the grass, the trails, the cabin, and the inside of it look.
const SPRITE_NAMES = ['grass', 'path', 'clearing', 'cabin', 'arcade', 'room', 'room-front', 'bed', 'desk', 'bookshelf'];
export const sprites = {};
export const spritesLoaded = Promise.all(SPRITE_NAMES.map((name) => {
  const img = new Image();
  img.src = `${canvas.dataset.sprites}${name}.png`;
  sprites[name] = img;
  return img.decode();
}));

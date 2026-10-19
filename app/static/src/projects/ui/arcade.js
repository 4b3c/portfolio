// The arcade machine's game, Don't Get Squished (src/tetris.js), in its own
// overlay. You can't walk while it's open.
import { makeArcade } from '../../tetris.js';
import { canvas } from '../dom.js';

export const arcade = makeArcade(document.getElementById('arcade'), canvas.dataset.blocks);

// The characters you can play as (their pixel art is in src/pixeltree.js).
// The one you picked last time is remembered.
import { makeSprites, EXPLORER, GIRL, ROBOT, RANGER, SCOUT, VOYAGER, SKATER, SAGE } from './config.js';
import { state } from './state.js';

export const CHARACTERS = [
  { id: 'explorer', name: 'Explorer', look: EXPLORER },
  { id: 'wanderer', name: 'Wanderer', look: GIRL },
  { id: 'robot', name: 'Robot', look: ROBOT },
  { id: 'ranger', name: 'Ranger', look: RANGER },
  { id: 'scout', name: 'Scout', look: SCOUT },
  { id: 'voyager', name: 'Voyager', look: VOYAGER },
  { id: 'skater', name: 'Skater', look: SKATER },
  { id: 'sage', name: 'Sage', look: SAGE },
].map((c) => ({ ...c, sprites: makeSprites(c.look) }));

state.character = CHARACTERS[0];
try {
  state.character = CHARACTERS.find((c) => c.id === localStorage.getItem('projects.character')) || state.character;
} catch (e) { /* storage blocked */ }

export function pickCharacter(c) {
  state.character = c;
  try { localStorage.setItem('projects.character', c.id); } catch (e) { /* storage blocked */ }
}

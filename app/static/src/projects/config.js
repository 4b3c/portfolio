// Everything you'd tune about the forest: sizes, speeds, distances, colours,
// and the words on the cards. No code that runs, just values.

// The pixel-art tree and character code (src/pixeltree.js, loaded before this).
export const {
  PIXEL, PALETTES, TRUNK_WIDTH_POWER,
  Tree, count, renderLayers, outline, toCanvas, makeSprites, EXPLORER, GIRL, ROBOT, RANGER, SCOUT, VOYAGER, SKATER, SAGE,
} = window.PixelTree;

// --- world ------------------------------------------------------------
export const TILE = 64;
export const COLS = 80;
export const ROWS = 60;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;
export const at = (c, r) => r * COLS + c;                          // a tile's index in the world's arrays
export const inWorld = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
// The forest is an island in the middle of the grid, sea all round it (layout.js).
// Its shore is `radius` of the way from the middle to the grid's edge, pushed
// in and out by up to about `wobble` in a few waves, different every load.
export const ISLAND = { radius: 0.8, wobble: 0.08 };
export const SPAWN = [COLS / 2, ROWS / 2];    // where the player starts
export const SPAWN_CLEARING = 7;              // no trees within this many tiles of it
// How much room each size of tree keeps around its trunk (cols, rows): two
// trunks stay at least their two rooms apart. Two mediums keep 8 x 5.
export const ROOM = {
  huge: [6.5, 4], large: [5, 3], medium: [4, 2.5], small: [3, 2], tiny: [2.5, 1.5],
};
export const SKY = 640;                       // how far above the world's top corner the camera can go: room for the tallest trees there

// Bigger trees than the forest page: longer branches that shrink more slowly
// with age (falloff), and a bigger box to draw them in. Each project's seed and
// age live in projects.json, picked so tree height matches the effort tier.
export const BIG_TREE = {
  minLen: 14, maxLen: 44, startLen: 50, falloff: 0.5, maxNodes: 250,
  box: [960, 900], base: [480, 830],
};
export const [BOX_W, BOX_H] = BIG_TREE.box;
export const BASE = BIG_TREE.base;

// leaves show where a project stands
export const STATUS = {
  active:    { palette: 'green', leaves: true },
  parked:    { palette: 'autumn', leaves: true },
  complete:  { palette: 'cherry', leaves: true },
  abandoned: { palette: 'green', leaves: false },
};

// Each tree grows one step every n ticks, with n picked at random per tree, so
// some grow fast and some slow. Redrawing a tree is the slow part, so trees
// that changed wait their turn: each frame redraws as many as fit in the
// budget, on-screen ones first.
export const MIN_TICKS = 1, MAX_TICKS = 10;
export const RENDER_BUDGET_MS = 6;
export const CARD_DISTANCE = 170;             // how close to a trunk before its card shows

// --- player -------------------------------------------------------------
export const WALK_SPEED = 220;
export const RUN_SPEED = 420;
export const PLAYER_RADIUS = 8;
export const ANIM_FPS = 8;
export const CAMERA_EASE = 8;

// --- trails -------------------------------------------------------------
// Each trail's look is a seamless texture in img/world/ (sprite), repeated
// across the world. Where a trail meets grass its edge goes ragged, in `edge`.
export const MATERIALS = {
  // rounded cobbles set in earth, at grass level
  path: { sprite: 'path',
    edge: [128, 120, 102] },  // earthy, like the soil between the stones, not a grey shadow
  // the pale packed earth of the clearings at spawn and the cabin
  trailhead: { sprite: 'clearing', edge: [198, 180, 132] },
};
export const MAT_INDEX = Object.fromEntries(Object.keys(MATERIALS).map((k, i) => [k, i]));
export const MAT_NAMES = Object.keys(MATERIALS);
export const TRAIL_REACH = [3, 4];            // the trail passes within this many tiles of each trunk (picked per tree)

// Each project is tagged with the kinds of work in it, in projects.json.
export const TAGS = { coding: 'coding', mechanical: 'CAD & hardware', work: 'work' };
// The last year I worked on a project seriously: the end of its date range
// ("2023 - 2024" is 2024), or for one still going ("2024 - now"), the year
// it was last updated.
export const lastYear = (p) => {
  const end = p.date.split('-').pop().trim();
  return end === 'now' ? (p.updated || p.start).slice(0, 4) : end;
};

// --- signs --------------------------------------------------------------
export const SIGN = {
  border: [96, 62, 34, 255], board: [184, 132, 78, 255], grain: [164, 114, 64, 255],
  text: [70, 44, 24, 255], post: [120, 80, 44, 255], outline: [40, 30, 30, 255],
};

// --- the cabin ----------------------------------------------------------
// A log cabin out in the woods whose mailbox is the contact form, with a
// clearing in front where a sign for each of these stands. Walking up to a
// sign shows its card; E opens the link.
export const SOCIALS = [
  { sign: 'GITHUB', title: 'GitHub', note: 'All my code, old and new.', url: 'https://github.com/4b3c' },
  { sign: 'LINKEDIN', title: 'LinkedIn', note: 'Where I work and what I study.', url: 'https://www.linkedin.com/in/abram-pierce' },
  { sign: 'INSTAGRAM', title: 'Instagram', note: "What I'm up to.", url: 'https://www.instagram.com/abrammonia/' },
  { sign: 'EMAIL', title: 'Email', note: 'Or write to me directly.', url: 'mailto:awpierc2@asu.edu' },
];
export const TRAILHEAD_CLEARING = [2.5, 2.5]; // the spawn clearing's radii, in tiles: round, so they're the same from any side in isometric
export const CABIN_CLEARING = [4, 4];         // the cabin's
export const CABIN_TREE_AGE = 380;            // how big the tree beside the cabin grows
export const SOCIAL_REACH = 80;               // how close to a sign before its card shows
export const WELCOME_REACH = 110;             // how close to the welcome sign before its guide shows
export const CABIN_DISTANCE = 16;             // tiles from spawn, at least: off screen when you start
// The cabin and the arcade machine stand on a box of ground this many world
// px along x and y, with their feet at its front corner.
export const CABIN_SIZE = [160, 112];
export const ARCADE_SIZE = [36, 36];
// The cabin itself is img/world/cabin.png, an isometric log cabin with its
// door in the gable end, the front-right wall (+x), like the doorway inside.
// `foot` is where the front corner of its box is in the PNG, in art pixels;
// `door` how far along that wall (-y, from the corner) the door's middle is.
// The rest are the mailbox's colours.
export const CABIN = {
  foot: [45, 65], door: 56,
  mail: [72, 104, 150, 255], mailLight: [106, 140, 184, 255], mailDark: [50, 74, 110, 255], flag: [204, 52, 40, 255],
};
export const DOOR_HALF = 16;                  // half the door's width, in world px: walking into it goes inside
export const MAILBOX_REACH = 90;              // how close to the mailbox before the "reach out" card shows

// --- inside the cabin ---------------------------------------------------
// A replica of my high school room, in isometric. Spots in it are floor
// coordinates in art pixels: u runs along the desk wall (down-right on
// screen), v along the window wall (down-left). Each layer in img/world/
// (room, bed, desk, bookshelf, room-front) is the size of the whole room, so
// they stack at one spot; `origin` is where floor (0, 0) is in them. Each
// thing in it has a card about me. Keep these in step with the PNGs.
export const CABIN_ROOM = { u: 76, v: 58, door: [24, 34], origin: [62, 41] };   // door: the doorway's v span, in the front-right wall
export const FADE_S = 0.18;                   // the fade to black going in or out, each way

// What each thing in the room says about me.
export const ABOUT = {
  bio: {
    title: 'About me', date: 'the bookshelf',
    text: "Thanks for peeping my website. Here's a little about me. I love creating things, whether its a website, a CAD model, a circuit, or tying all three together.\n\nI started tinkering as a kid in Kenya, building fans for my room, powered by a solar panel, building a mini hydropics system with water bottles and minows I caught in a lake (RIP) (they did not last long), or my LEGO city I worked on every day for years. Eventually I moved back to the states, saved up, and bought a LEGO mindstorms kit, which introduced me to technology in the most tangible way I had ever experienced. I learned programming, gear ratios, structural integrity, and this sparked my love for science and technology.\n\nMy dream is to continue building until I have the means to integrate STEM education infrastructure around the world. My side quest dream is to be a part of building more walkable and sustainable cities, and high speed railway across the US.\n\nAnyways, I hope you enjoyed checking out my website. Don't hesitate to reach out. Cya",
  },
  pc: {
    title: 'My PC specs', date: 'the desk',
    text: [
      'CPU: AMD Ryzen 7 9700X',
      'GPU: AMD Radeon RX 9060 XT, 16 GB VRAM',
      'RAM: 32 GB',
      'Motherboard: Gigabyte B650',
      'OS: Fedora',
    ].join('\n'),
  },
  room: {
    title: 'My high school room', date: 'the bed',
    text: "This was my room in high school. I built the headboard with an aquarium in it, built the shelves, and built the PC on the desk. My capstone tank is on the desk too.",
    images: ['/static/img/about/high-school-room.jpg'],
  },
  arcade: {
    title: 'I also love video games', date: 'the arcade machine',
    text: "Factorio, Minecraft, Cities: Skylines are my favorite. Here's a surprise mini game. A JS port of a C++ game I made.",
  },
};

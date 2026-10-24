// The forest in isometric. The world is still a flat grid of tiles, worked
// out from above (layout, trails, walking, bumping into things all use world
// x and y), but it's drawn turned 45° and squashed to half height, so each
// tile is a diamond twice as wide as it's tall: world x runs down-right on
// screen, world y down-left. The same as the floor inside the cabin (room.js).
// Things standing on the ground (trees, signs, you) are drawn upright at
// wherever their feet land.

// where world (x, y) lands on screen, before the camera; it works on the gap
// between two spots too, giving the gap on screen
export const toScreen = (x, y) => ({ x: x - y, y: (x + y) / 2 });
// and back: the spot on the ground under screen (x, y)
export const toWorld = (sx, sy) => ({ x: sy + sx / 2, y: sy - sx / 2 });
// toScreen as a canvas transform, for drawing the ground's tiles straight onto it
export const ISO = [1, 0.5, -1, 0.5];

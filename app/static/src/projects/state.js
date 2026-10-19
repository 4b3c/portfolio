// What's going on right now, shared between the overlays and the game. Any
// module can read or change these: e.g. ui/contact.js sets contactOpen, and
// player.js won't let you walk while it's true.
export const state = {
  introOpen: true,          // the world runs behind the intro, but you can't move yet
  contactOpen: false,
  mailSent: false,          // raises the flag on the mailbox
  guidePinned: false,       // the guide was opened with help or H, not by the sign
  pinnedNear: null,         // what you were next to when it was opened ('new' until updateCard looks)
  character: null,          // which character you're playing (characters.js picks the first one)
  inside: false,            // in the cabin, or out in the forest
};

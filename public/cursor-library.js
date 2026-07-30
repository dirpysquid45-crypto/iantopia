// cursor-library.js
// Unlockable cursor skins. cursor.js renders the active one to its canvas.
//
// An entry is either image-based or emoji-based:
//   image: { point: '/path.png', interact: '/path.png' }  — interact is optional
//                                                           and falls back to point
//   emoji: { emoji: '⚡' }                                 — drawn as text, no art needed
//
// `clickSounds` (optional, image-based skins only): an array of SFX paths.
// cursor.js plays one per click, advancing through the array and looping
// back to the start — click 1 -> sounds[0], click 2 -> sounds[1], etc.
//
// `default` is always owned and can never be locked out. Every other key here
// must be granted by a case item (see case-data.js) whose `key` matches.
window.CURSOR_LIBRARY = {
  default: {
    label: 'Smiski',
    point: '/cursors/Smiski-cursor.png',
    interact: '/cursors/Smiski-interact.png',
  },
  struble_coin: {
    label: 'Struble Coin',
    point: '/strubles.png',
  },
  joker: {
    label: 'The Joker',
    point: '/assets/casino/cards/card_joker_red.png',
  },
  hamood_habibi: {
    label: 'Hamood Habibi',
    point: '/cursors/hamood-point.png',
    interact: '/cursors/hamood-interact.webp',
    clickSounds: [
      '/audio/sfx/hamood-1.mp3',
      '/audio/sfx/hamood-2.mp3',
      '/audio/sfx/hamood-3.mp3',
    ],
  },
};

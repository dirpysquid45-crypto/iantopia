// cursor-library.js
// Unlockable cursor skins. cursor.js renders the active one to its canvas.
//
// An entry is either image-based or emoji-based:
//   image: { point: '/path.png', interact: '/path.png' }  — interact is optional
//                                                           and falls back to point
//   emoji: { emoji: '👑' }                                — drawn as text, no art needed
//
// `default` is always owned and can never be locked out. Every other key here
// must be granted by a case item (see case-data.js) whose `key` matches.
window.CURSOR_LIBRARY = {
  default: {
    label: 'Smiski',
    point: '/Smiski-cursor.png',
    interact: '/Smiski-interact.png',
  },
  struble_coin: {
    label: 'Struble Coin',
    point: '/strubles.png',
  },
  card_back: {
    label: 'Card Back',
    point: '/assets/casino/cards/card_back.png',
  },
  ace_spades: {
    label: 'Ace of Spades',
    point: '/assets/casino/cards/card_spades_A.png',
  },
  joker: {
    label: 'The Joker',
    point: '/assets/casino/cards/card_joker_red.png',
  },
  crown: {
    label: 'Crown of Iantopia',
    emoji: '👑',
  },
};

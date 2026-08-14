// music-library.js
// Every track the Now Playing playlist can select.
//
// The key MUST match the `key` of the corresponding music_unlock item in
// case-data.js. The playlist looks tracks up by key and silently skips any it
// can't resolve, so a missing entry here means the track is granted and listed
// in the Inventory but can never actually be played.
//
// To add a track: drop the mp3 in public/audio/music/, add one line here, and
// add a matching music_unlock item to case-data.js.
window.MUSIC_LIBRARY = {
  default: { label: 'Home Theme', src: '/audio/music/home-theme.mp3' },

  // --- Unlockable ---
  taipei_instrumental: { label: 'Yung Lean – Taipei Instrumental',  src: '/audio/music/taipei-instrumental.mp3' },
  circus:              { label: 'Circus',                           src: '/audio/music/Circus.mp3' },
  balatro:             { label: 'Balatro Main Theme',               src: '/audio/music/Balatro-Main-Theme.mp3' },
  cursed:              { label: 'Cursed Audio File',                src: '/audio/music/cursed.mp3' },
  buildings:           { label: 'Yung Lean × Thaiboy × Bladee – Buildings', src: '/audio/music/buildings-instrumental.mp3' },
  aaa_powerline:       { label: 'Ecco2k – AAA Powerline',           src: '/audio/music/aaa-powerline.mp3' },
  atari:               { label: 'Ecco2k – Play Em Like Atari',      src: '/audio/music/play-em-like-atari.mp3' },
  deathmetal:          { label: 'Panchiko – DEATHMETAL',            src: '/audio/music/deathmetal.mp3' },
  forever_young:       { label: 'Alphaville – Forever Young',       src: '/audio/music/forever-young.mp3' },
  mario_desert:        { label: 'Desert (Mario, Bitcrushed)',       src: '/audio/music/minesweeper-desert.mp3' },
  hotel:               { label: 'Hotel Lounge',                    src: '/audio/music/hotel.mp3' },

  // Combo tracks: paired with a matching background in index.astro's
  // applyBackground() rather than won separately — selecting the background
  // is enough to also switch Now Playing to this, no independent unlock.
  bladee_waster:       { label: 'Bladee – Waster',                  src: '/audio/music/bladee-waster.mp3' },
  evian_yxguden:        { label: 'Evian Christ – Yxguden (feat. Bladee)', src: '/audio/music/evian-christ-yxguden.mp3' },
  clarity:             { label: 'Zedd – Clarity ft. Foxes',          src: '/audio/music/clarity.mp3' },
  hello_kitty:         { label: 'Hello Kitty',                       src: '/audio/music/hello-kitty.mp3' },
  girl_like_me:        { label: 'PinkPantheress – Girl Like Me',     src: '/audio/music/girl-like-me.mp3' },
};

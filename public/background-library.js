// background-library.js
// Every background the homepage switcher can apply.
//
// The key MUST match the `key` of the corresponding background_unlock item in
// case-data.js — the switcher resolves by key and falls back to default on a miss.
//
// type 'gif'   -> painted as body background-image ('position' optional)
// type 'video' -> played in the fullscreen <video id="bg-video"> layer
//
// To add one: drop the file in public/video/, add one line here, and add a
// matching background_unlock item to case-data.js.
window.BACKGROUND_LIBRARY = {
  default: { label: 'Taipei', type: 'gif', src: '/video/taipei.gif', position: 'center' },

  // --- Unlockable ---
  vegas_skyline:    { label: 'Las Vegas Skyline', type: 'gif',   src: '/video/vegas-skyline.gif', position: 'top center' },
  trippy_roulette:  { label: 'Trippy Roulette',   type: 'gif',   src: 'https://transcripts.iantopia.com/media/trippy-roulette.gif', position: 'center' },
  old_ppl_slot:     { label: 'Old People Slot',   type: 'gif',   src: '/video/old-ppl-slot.gif', position: 'center' },
  casino_entrance:  { label: 'Casino Entrance',   type: 'gif',   src: '/video/casino-entrance.gif', position: 'center' },
  ny_skyline:       { label: 'NY Skyline',        type: 'gif',   src: '/video/nyskyline.gif', position: 'center' },
  circus:           { label: 'Circus',            type: 'gif',   src: '/video/circus.gif', position: 'center' },
  raining_money:    { label: 'Raining Money',     type: 'gif',   src: '/video/raining-money.gif', position: 'center' },
  // NOT COMMITTED: both exceed the 25MB Cloudflare Pages per-file limit, so
  // they are gitignored. They work in local dev because the files are on disk,
  // but they will 404 in production until they are hosted somewhere.
  // transcripts.iantopia.com does NOT currently serve them — it answers every
  // /media/* path with a 200 HTML fallback, so a status check looks fine while
  // the bytes are wrong.
  ehden:            { label: 'Ehden',             type: 'gif',   src: '/video/ehden.gif', position: 'center' },
  taipei_nightlife: { label: 'Taipei Nightlife',  type: 'video', src: '/video/taipei-nightlife.mp4' },
  bangkok_night:    { label: 'Bangkok Night',     type: 'video', src: '/video/bangkok-night.mp4' },
};

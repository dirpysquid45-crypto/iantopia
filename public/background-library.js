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
  old_ppl_slot:     { label: 'Old People Slot',   type: 'gif',   src: '/video/old-ppl-slot.gif', position: 'center' },
  casino_entrance:  { label: 'Casino Entrance',   type: 'gif',   src: '/video/casino-entrance.gif', position: 'center' },
  ny_skyline:       { label: 'NY Skyline',        type: 'gif',   src: '/video/nyskyline.gif', position: 'center' },
  circus:           { label: 'Circus',            type: 'gif',   src: '/video/circus.gif', position: 'center' },
  raining_money:    { label: 'Raining Money',     type: 'gif',   src: '/video/raining-money.gif', position: 'center' },
  taipei_nightlife: { label: 'Taipei Nightlife',  type: 'video', src: '/video/taipei-nightlife.mp4' },
  bladee_waster:    { label: 'Bladee – Waster',   type: 'video', src: '/video/bladee-waster.mp4' },
  evian_yxguden:    { label: 'Evian Christ – Yxguden (feat. Bladee)', type: 'video', src: '/video/evian-christ-yxguden.mp4' },
  clarity:          { label: 'Zedd – Clarity ft. Foxes', type: 'video', src: '/video/clarity.mp4' },
  hello_kitty:      { label: 'Hello Kitty',       type: 'video', src: '/video/hello-kitty.mp4' },
  girl_like_me:     { label: 'PinkPantheress – Girl Like Me', type: 'video', src: '/video/girl-like-me.mp4' },

  // Inventory-page-only backgrounds. `restricted: true` means every picker
  // (pickers.js, and home's and lootbox's own separate copies) skips this
  // entry entirely UNLESS the current page's own PAGE_BG_ALLOWLIST names it
  // explicitly — PAGE_BG_ALLOWLIST alone only ever restricted the inventory
  // page's OWN picker down to shelf-only, it never stopped these from also
  // showing up as ordinary options on every other page's full library list.
  // `desktopOnly: true` (leafy variant only) additionally hides it below
  // the site's usual 768px mobile breakpoint — it's a fairly busy image and
  // reads cluttered at phone width, and item-space on the shelf is already
  // tighter there to begin with.
  inventory_shelf:       { label: 'Display Shelf', type: 'image', src: '/video/inventory-shelf.jpg', position: 'center', restricted: true },
  inventory_shelf_leafy: { label: 'Leafy Shelf',    type: 'image', src: '/video/inventory-shelf-leafy.jpg', position: 'center', restricted: true, desktopOnly: true },
};

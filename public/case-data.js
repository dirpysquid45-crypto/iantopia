// case-data.js
// CS2-style case system: rarity tiers, the master item pool, and case definitions.
//
// HOW A ROLL WORKS
//   1. Pick a rarity tier by its `chance` (percentages, must total 100).
//   2. Pick uniformly at random among the items of that tier *in that case*.
// This is the CS2 model: rarity is decided first, so adding more items to a
// tier does NOT make that tier rarer — it just dilutes which item you get.
//
// Odds are deliberately easier than real CS2, which runs
// 79.92 / 15.98 / 3.20 / 0.64 / 0.26. Covert is ~5x more likely here and the
// gold tier ~3x, so a session actually produces highlights.

window.CASE_RARITIES = {
  mil_spec:         { label: 'Mil-Spec',          color: '#4b69ff', chance: 65.0 },
  restricted:       { label: 'Restricted',        color: '#8847ff', chance: 22.0 },
  classified:       { label: 'Classified',        color: '#d32ce6', chance: 9.0 },
  covert:           { label: 'Covert',            color: '#eb4b4b', chance: 3.2 },
  exceedingly_rare: { label: 'Exceedingly Rare',  color: '#ffd700', chance: 0.8 },
};

// Tier order, low -> high. Used for sorting and for the reveal's rank.
window.CASE_RARITY_ORDER = ['mil_spec', 'restricted', 'classified', 'covert', 'exceedingly_rare'];

// Master item pool. Cases reference these by id.
//
// Visuals: `img` (a real asset path) or `emoji` (drawn as text). Emoji entries
// exist so an item can ship without commissioning art.
//
// `type` + its params are what the engine actually grants — these match the
// existing grant types in lootbox.js so inventory/unlock plumbing is unchanged.
//
// `draggable: true` (type: 'item' only) also spawns the item as a movable toy
// on the homepage desktop once owned — see desktop-items.js. Requires a real
// `img` (no emoji-only draggables).
window.CASE_ITEMS = {
  // ---------- Mil-Spec (blue) — flavor collectibles, revived from the old archive ----------
  s_2500:      { label: '+2,500 Strubles',                tier: 'mil_spec',   img: '/strubles.png',                        type: 'strubles', amount: 2500 },
  sock:        { label: 'Stinky Ian Sock',                tier: 'mil_spec',   img: '/assets/items/dirty-sock.webp',        type: 'item', draggable: true },
  used_deck:   { label: 'Used Deck of Cards',             tier: 'mil_spec',   img: '/assets/items/used-cards.png',         type: 'item', draggable: true },
  panda:       { label: "Ian's Panda Express",            tier: 'mil_spec',   img: '/assets/items/panda-express.png',      type: 'item', draggable: true },
  costco_card: { label: 'Costco Executive Membership',    tier: 'mil_spec',   img: '/assets/items/costco-membership.png',  type: 'item', draggable: true },
  bag_of_rice: { label: 'Bag of Rice',                    tier: 'mil_spec',   img: '/assets/items/bag-of-rice.png',        type: 'item', draggable: true },
  mcchicken:   { label: 'McChicken',                      tier: 'mil_spec',   img: '/assets/items/mcchicken.png',          type: 'item', draggable: true },
  display_shelf: { label: 'Display Shelf',                tier: 'mil_spec',   img: '/assets/decorations/display-shelf.webp', type: 'item', draggable: true, size: 195 },
  smiski_blind_box: { label: 'Smiski Blind Box',          tier: 'mil_spec',   img: '/assets/decorations/smiski-blind-box.png', type: 'item', draggable: true, size: 91 },
  mus_circus:  { label: 'Circus',                         tier: 'mil_spec',   emoji: '🎪',                                  type: 'music_unlock', key: 'circus' },
  mus_balatro: { label: 'Balatro Main Theme',             tier: 'mil_spec',   emoji: '🃏',                                  type: 'music_unlock', key: 'balatro' },
  mus_desert:  { label: 'Desert (Mario, Bitcrushed)',     tier: 'mil_spec',   emoji: '🏜️',                                  type: 'music_unlock', key: 'mario_desert' },
  mus_hotel:   { label: 'Hotel Lounge',                   tier: 'mil_spec',   emoji: '🛎️',                                  type: 'music_unlock', key: 'hotel' },
  bg_circus:   { label: 'Background: Circus',             tier: 'mil_spec',   img: '/video/circus.gif',                    type: 'background_unlock', key: 'circus' },
  cur_joker:   { label: 'Cursor: The Joker',              tier: 'mil_spec',   img: '/assets/casino/cards/card_joker_red.png', type: 'cursor_unlock', key: 'joker' },

  // ---------- Restricted (purple) ----------
  ians_id:     { label: "Ian's Driver License",           tier: 'restricted', img: '/assets/items/ians-drivers-license.png', type: 'item', draggable: true },
  mini_trophy: { label: 'Iantopia Trophy',                tier: 'restricted', img: '/assets/badges/iantopia-trophy.png',   pixelated: true, type: 'badge', key: 'mini_trophy', draggable: true },
  bg_casino:   { label: 'Background: Casino Entrance',    tier: 'restricted', img: '/video/casino-entrance.gif',           type: 'background_unlock', key: 'casino_entrance' },
  bg_nyc:      { label: 'Background: NY Skyline',         tier: 'restricted', img: '/video/nyskyline.gif',                 type: 'background_unlock', key: 'ny_skyline' },
  bg_leafy_shelf: { label: 'Inventory Background: Leafy Shelf', tier: 'restricted', img: '/video/inventory-shelf-leafy.jpg', type: 'background_unlock', key: 'inventory_shelf_leafy' },

  // ---------- Classified (pink) ----------
  s_10000:     { label: '+10,000 Strubles',               tier: 'classified', img: '/strubles.png',                        type: 'strubles', amount: 10000 },
  mus_atari:   { label: 'Ecco2k – Play Em Like Atari',    tier: 'classified', emoji: '🕹️',                                  type: 'music_unlock', key: 'atari' },
  mus_death:   { label: 'Panchiko – DEATHMETAL',          tier: 'classified', emoji: '📻',                                  type: 'music_unlock', key: 'deathmetal' },
  bg_money:    { label: 'Background: Raining Money',      tier: 'classified', img: '/video/raining-money.gif',             type: 'background_unlock', key: 'raining_money' },
  // Archived: kept so existing owners' history/labels still resolve, but
  // excluded from ALL_IDS below so it can no longer be rolled.
  haiku_email: { label: 'Email from the Void',            tier: 'classified', emoji: '✉️',                                  type: 'action', effect: 'email_void', archived: true },

  // ---------- Covert (red) ----------
  mus_taipei:  { label: 'Yung Lean – Taipei Instrumental', tier: 'covert',    emoji: '🌆',                                  type: 'music_unlock', key: 'taipei_instrumental' },
  mus_cursed:  { label: 'Cursed Audio File',              tier: 'covert',     emoji: '💀',                                  type: 'music_unlock', key: 'cursed' },
  bg_vegas:    { label: 'Background: Las Vegas Skyline',  tier: 'covert',     img: '/video/vegas-skyline.gif',             type: 'background_unlock', key: 'vegas_skyline' },
  bg_oldppl:   { label: 'Background: Old People Slot',    tier: 'covert',     img: '/video/old-ppl-slot.gif',              type: 'background_unlock', key: 'old_ppl_slot' },
  mus_build:   { label: 'Yung Lean × Thaiboy × Bladee – Buildings', tier: 'covert', emoji: '🏙️',                            type: 'music_unlock', key: 'buildings' },
  mus_aaa:     { label: 'Ecco2k – AAA Powerline',         tier: 'covert',     emoji: '⚡',                                   type: 'music_unlock', key: 'aaa_powerline' },
  bg_waster:   { label: 'Background: Bladee – Waster',    tier: 'covert',     emoji: '🧊',                                  type: 'background_unlock', key: 'bladee_waster' },
  bg_yxguden:  { label: 'Background: Evian Christ – Yxguden', tier: 'covert', emoji: '🌊',                                  type: 'background_unlock', key: 'evian_yxguden' },
  bg_clarity:  { label: 'Background: Zedd – Clarity',     tier: 'covert',     emoji: '💎',                                  type: 'background_unlock', key: 'clarity' },
  bg_hellokitty: { label: 'Background: Hello Kitty',      tier: 'covert',     emoji: '🎀',                                  type: 'background_unlock', key: 'hello_kitty' },
  bg_girllikeme: { label: 'Background: PinkPantheress – Girl Like Me', tier: 'covert', emoji: '🐆',                        type: 'background_unlock', key: 'girl_like_me' },
  // Archived: kept so existing owners' history/labels still resolve, but
  // excluded from ALL_IDS below so it can no longer be rolled.
  finish_ian:  { label: 'Email Ian to Finish Iantopia',   tier: 'covert',     emoji: '📧',                                  type: 'action', effect: 'email_finish', archived: true },

  // ---------- Exceedingly Rare (gold) ----------
  one_true:    { label: 'The One True Struble',           tier: 'exceedingly_rare', img: '/strubles.png',                  type: 'strubles', amount: 100000 },
  mus_forever: { label: 'Alphaville – Forever Young',     tier: 'exceedingly_rare', emoji: '🌅',                            type: 'music_unlock', key: 'forever_young' },
  bg_taipei_n: { label: 'Background: Taipei Nightlife',   tier: 'exceedingly_rare', emoji: '🌃',                            type: 'background_unlock', key: 'taipei_nightlife' },
  alt_ending:  { label: 'Alternate Ending',               tier: 'exceedingly_rare', emoji: '🎬',                            type: 'unlock_page', path: '/alternate-ending' },
  cur_struble: { label: 'Cursor: Struble Coin',           tier: 'exceedingly_rare', img: '/strubles.png',                  type: 'cursor_unlock', key: 'struble_coin' },
  cur_hamood:  { label: 'Cursor: Hamood Habibi',          tier: 'exceedingly_rare', img: '/cursors/hamood-point.png',      type: 'cursor_unlock', key: 'hamood_habibi' },

  // ---------- Iantopia Tycoon buildings ----------
  // Unlike every other type above, these are NOT simple one-time
  // collectibles — a player can own up to TYCOON_MAX_PER_TYPE (10) of the
  // SAME building, so lootbox.js's isOwned()/applyItem() special-case
  // `building_unlock` instead of using the generic single-flag ownership
  // path every other type uses. Gameplay stats (production, build time,
  // placement cost) live in tycoon-buildings.js, not here — this only
  // defines what opening a case grants, matching how background_unlock
  // items only grant a key that background-library.js gives meaning to.
  // `description` mirrors tycoon-buildings.js's copy (kept short and
  // duplicated rather than cross-file-referenced, same as `label` already
  // is) so the reveal card on /lootbox can show what you just won without
  // needing tycoon-buildings.js loaded on that page.
  bld_shabby:     { label: 'Building: Shabby Apartment',    tier: 'mil_spec',         img: '/tycoon/shabby-apartment.png', type: 'building_unlock', key: 'shabby_apartment',
    description: "A run-down walk-up that's seen better decades. Barely pays rent, but it's honest work." },
  bld_generic:    { label: 'Building: Generic Building',    tier: 'restricted',       img: '/tycoon/generic-building.png', type: 'building_unlock', key: 'generic_building',
    description: 'A perfectly ordinary mid-rise. Nobody remembers its name, but the tenants pay on time.' },
  bld_pagoda:     { label: 'Building: Pagoda',              tier: 'classified',       img: '/tycoon/pagoda.png',           type: 'building_unlock', key: 'pagoda',
    description: 'An ornate tower channeling old-world prosperity. Owning one quietly improves your luck on every Iantopia Lootbox Basic you open afterward.' },
  bld_skyscraper: { label: 'Building: Generic Skyscraper',  tier: 'covert',           img: '/tycoon/skyscraper.png', type: 'building_unlock', key: 'generic_skyscraper',
    description: 'A gleaming corporate tower. Excellent return on investment, brutal commute for everyone inside.' },
  bld_taipei101:  { label: 'Building: Taipei 101',          tier: 'exceedingly_rare', img: '/tycoon/taipei-101.png',       type: 'building_unlock', key: 'taipei_101',
    description: 'The crown jewel of the skyline. Owning one is basically bragging rights with a paycheck attached.' },
};

// Paths an `unlock_page` item may grant. A path only belongs here once the page
// is a real built route — the engine refuses anything not listed, so an item can
// never hand out a dead link. Add the route in the same change that adds the page.
window.LOOTBOX_UNLOCKABLE_PAGES = [
  '/alternate-ending', // src/pages/alternate-ending.astro
];

// Case contents are DERIVED from the item pool rather than hand-listed, so
// adding an item above automatically places it in every case it qualifies for.
// Hand-maintained id arrays rot the moment a new asset lands.
const ALL_IDS = Object.keys(window.CASE_ITEMS).filter((id) => !window.CASE_ITEMS[id].archived);
// Buildings are exclusive to the Iantopia Lootbox Basic case (see below) —
// every other case's "everything"/"everything at this tier+" pools are
// built from this instead of ALL_IDS, so a building can never turn up in
// Starter or Vault just because it happens to fit their tier odds.
const GENERAL_IDS = ALL_IDS.filter((id) => window.CASE_ITEMS[id].type !== 'building_unlock');
const idsByType = (...types) => GENERAL_IDS.filter((id) => types.includes(window.CASE_ITEMS[id].type));
const idsFromTier = (minTier) => {
  const min = window.CASE_RARITY_ORDER.indexOf(minTier);
  return GENERAL_IDS.filter((id) => window.CASE_RARITY_ORDER.indexOf(window.CASE_ITEMS[id].tier) >= min);
};

// Case definitions. `items` are ids from CASE_ITEMS.
// `odds` optionally overrides CASE_RARITIES chances for that case (must total 100).
// A case must contain at least one item in every tier its odds can roll —
// validateCases() below reports any that don't.
window.CASES = {
  starter: {
    label: 'Topian Starter Case',
    cost: 1000,
    emoji: '📦',
    blurb: 'The standard issue. Cheap and plentiful — legendary pulls exist, but you\'ll earn them.',
    // Each case has its own odds now (previously Starter and Signal shared
    // the same curve and only differed by item pool — every tier below
    // Mil-Spec climbs Starter -> Signal -> Vault, so paying more always
    // means meaningfully rarer, not just a different item list).
    odds: {
      mil_spec: 60.0,
      restricted: 25.0,
      classified: 10.0,
      covert: 4.0,
      exceedingly_rare: 1.0,
    },
    items: GENERAL_IDS,
  },

  signal: {
    label: 'Signal Case',
    cost: 2500,
    emoji: '📻',
    blurb: 'Audio and visual unlocks only, and real odds to match the price — legendary hits 5x more than Starter.',
    // Cosmetics only, plus two cheap Mil-Spec entries because this case still
    // rolls Mil-Spec 30% of the time and needs something to land on there.
    // s_2500 specifically (not the shared mil_spec currency item) so a
    // Mil-Spec pull here can never net less than this case's own cost.
    odds: {
      mil_spec: 30.0,
      restricted: 35.0,
      classified: 20.0,
      covert: 10.0,
      exceedingly_rare: 5.0,
    },
    items: ['s_2500', 'used_deck'].concat(
      idsByType('music_unlock', 'background_unlock', 'cursor_unlock')
    ),
  },

  vault: {
    label: 'Iantopia Vault Case',
    cost: 10000,
    emoji: '🔐',
    blurb: 'Expensive, and the odds know it. No Mil-Spec at all — the floor is Restricted.',
    odds: {
      mil_spec: 0,
      restricted: 45.0,
      classified: 30.0,
      covert: 17.0,
      exceedingly_rare: 8.0,
    },
    items: idsFromTier('restricted'),
  },

  iantopia_tycoon_basic: {
    label: 'Iantopia Lootbox Basic',
    // Raised alongside the Taipei 101 odds bump below — 750 was priced
    // for a 1% Legendary shot, not 5%.
    cost: 2500,
    emoji: '🏗️',
    blurb: 'Drops a building for your Iantopia Tycoon skyline. Taipei 101 is a real shot at 5% — and owning Pagodas nudges every future pull further from Common.',
    // Rarity tiers reused as the building rarity odds specified for this
    // case specifically, mapped onto the shared mil_spec..exceedingly_rare
    // scale rather than inventing a parallel one. Taipei 101 bumped from
    // 1% to 5% per request; the 4-point difference comes out of Common
    // (50 -> 46) so the total still lands on 100.
    odds: {
      mil_spec: 46.0,
      restricted: 30.0,
      classified: 15.0,
      covert: 4.0,
      exceedingly_rare: 5.0,
    },
    // Owning Pagodas shifts these odds further off mil_spec at open time —
    // see lootbox.js's oddsFor(), which checks this flag rather than
    // hardcoding this case's key.
    pagodaBuff: true,
    items: ['bld_shabby', 'bld_generic', 'bld_pagoda', 'bld_skyscraper', 'bld_taipei101'],
  },
};

// Dev guard: a case whose odds can roll a tier it has no items for would throw
// at open time. Surface that at load instead, in the console, where it's cheap.
(function validateCases() {
  const R = window.CASE_RARITIES, I = window.CASE_ITEMS;
  Object.entries(window.CASES).forEach(([caseKey, def]) => {
    const odds = def.odds || Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.chance]));
    const total = Object.values(odds).reduce((s, n) => s + n, 0);
    if (Math.abs(total - 100) > 0.001) {
      console.warn(`[cases] "${caseKey}" odds total ${total}, expected 100.`);
    }
    def.items.forEach((id) => {
      if (!I[id]) console.warn(`[cases] "${caseKey}" references unknown item id "${id}".`);
    });
    Object.entries(odds).forEach(([tier, chance]) => {
      if (chance <= 0) return;
      const has = def.items.some((id) => I[id] && I[id].tier === tier);
      if (!has) console.warn(`[cases] "${caseKey}" can roll ${tier} (${chance}%) but has no items in it.`);
    });
  });
})();

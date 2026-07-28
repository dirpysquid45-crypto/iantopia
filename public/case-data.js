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
window.CASE_ITEMS = {
  // ---------- Mil-Spec (blue) — flavor collectibles, revived from the old archive ----------
  s_1000:      { label: '+1,000 Strubles',                tier: 'mil_spec',   img: '/strubles.png',                        type: 'strubles', amount: 1000 },
  sock:        { label: 'Stinky Ian Sock',                tier: 'mil_spec',   emoji: '🧦',                                  type: 'item' },
  used_deck:   { label: 'Used Deck of Cards',             tier: 'mil_spec',   img: '/assets/casino/cards/card_back.png',   type: 'item' },
  fake_cert:   { label: 'Fake Certificate of Completion', tier: 'mil_spec',   emoji: '📜',                                  type: 'item' },
  panda:       { label: "Ian's Panda Express",            tier: 'mil_spec',   emoji: '🥡',                                  type: 'item' },
  bug_coupon:  { label: 'Bug Report Coupon',              tier: 'mil_spec',   emoji: '🎟️',                                  type: 'badge', key: 'bug_coupon' },

  // ---------- Restricted (purple) ----------
  s_5000:      { label: '+5,000 Strubles',                tier: 'restricted', img: '/strubles.png',                        type: 'strubles', amount: 5000 },
  ians_id:     { label: "Ian's Driver License",           tier: 'restricted', emoji: '🪪',                                  type: 'item' },
  mini_trophy: { label: 'Mini Struble Trophy',            tier: 'restricted', emoji: '🏆',                                  type: 'badge', key: 'mini_trophy' },
  bg_casino:   { label: 'Background: Casino Entrance',    tier: 'restricted', img: '/video/casino-entrance.gif',           type: 'background_unlock', key: 'casino_entrance' },
  bg_nyc:      { label: 'Background: NY Skyline',         tier: 'restricted', img: '/video/nyskyline.gif',                 type: 'background_unlock', key: 'ny_skyline' },
  cur_struble: { label: 'Cursor: Struble Coin',           tier: 'restricted', img: '/strubles.png',                        type: 'cursor_unlock', key: 'struble_coin' },

  // ---------- Classified (pink) ----------
  s_10000:     { label: '+10,000 Strubles',               tier: 'classified', img: '/strubles.png',                        type: 'strubles', amount: 10000 },
  mus_circus:  { label: 'Circus',                         tier: 'classified', emoji: '🎪',                                  type: 'music_unlock', key: 'circus' },
  mus_balatro: { label: 'Balatro Main Theme',             tier: 'classified', emoji: '🃏',                                  type: 'music_unlock', key: 'balatro' },
  mus_atari:   { label: 'Ecco2k – Play Em Like Atari',    tier: 'classified', emoji: '🕹️',                                  type: 'music_unlock', key: 'atari' },
  mus_death:   { label: 'Panchiko – DEATHMETAL',          tier: 'classified', emoji: '📻',                                  type: 'music_unlock', key: 'deathmetal' },
  bg_circus:   { label: 'Background: Circus',             tier: 'classified', img: '/video/circus.gif',                    type: 'background_unlock', key: 'circus' },
  bg_money:    { label: 'Background: Raining Money',      tier: 'classified', img: '/video/raining-money.gif',             type: 'background_unlock', key: 'raining_money' },
  bg_ehden:    { label: 'Background: Ehden',              tier: 'classified', img: 'https://transcripts.iantopia.com/media/ehden.gif', type: 'background_unlock', key: 'ehden' },
  cur_card:    { label: 'Cursor: Card Back',              tier: 'classified', img: '/assets/casino/cards/card_back.png',   type: 'cursor_unlock', key: 'card_back' },
  haiku_email: { label: 'Email from the Void (AI haiku)', tier: 'classified', emoji: '✉️',                                  type: 'action', effect: 'email_haiku' },

  // ---------- Covert (red) ----------
  mus_taipei:  { label: 'Yung Lean – Taipei Instrumental', tier: 'covert',    emoji: '🌆',                                  type: 'music_unlock', key: 'taipei_instrumental' },
  mus_cursed:  { label: 'Cursed Audio File',              tier: 'covert',     emoji: '💀',                                  type: 'music_unlock', key: 'cursed' },
  bg_vegas:    { label: 'Background: Las Vegas Skyline',  tier: 'covert',     img: '/video/vegas-skyline.gif',             type: 'background_unlock', key: 'vegas_skyline' },
  bg_roulette: { label: 'Background: Trippy Roulette',    tier: 'covert',     img: 'https://transcripts.iantopia.com/media/trippy-roulette.gif', type: 'background_unlock', key: 'trippy_roulette' },
  bg_oldppl:   { label: 'Background: Old People Slot',    tier: 'covert',     img: '/video/old-ppl-slot.gif',              type: 'background_unlock', key: 'old_ppl_slot' },
  mus_build:   { label: 'Yung Lean × Thaiboy × Bladee – Buildings', tier: 'covert', emoji: '🏙️',                            type: 'music_unlock', key: 'buildings' },
  mus_aaa:     { label: 'Ecco2k – AAA Powerline',         tier: 'covert',     emoji: '⚡',                                   type: 'music_unlock', key: 'aaa_powerline' },
  bg_bangkok:  { label: 'Background: Bangkok Night',      tier: 'covert',     emoji: '🛺',                                  type: 'background_unlock', key: 'bangkok_night' },
  cur_ace:     { label: 'Cursor: Ace of Spades',          tier: 'covert',     img: '/assets/casino/cards/card_spades_A.png', type: 'cursor_unlock', key: 'ace_spades' },
  cur_joker:   { label: 'Cursor: The Joker',              tier: 'covert',     img: '/assets/casino/cards/card_joker_red.png', type: 'cursor_unlock', key: 'joker' },
  finish_ian:  { label: 'Email Ian to Finish Iantopia',   tier: 'covert',     emoji: '📧',                                  type: 'action', effect: 'email_finish' },

  // ---------- Exceedingly Rare (gold) ----------
  one_true:    { label: 'The One True Struble',           tier: 'exceedingly_rare', img: '/strubles.png',                  type: 'strubles', amount: 100000 },
  mus_forever: { label: 'Alphaville – Forever Young',     tier: 'exceedingly_rare', emoji: '🌅',                            type: 'music_unlock', key: 'forever_young' },
  bg_taipei_n: { label: 'Background: Taipei Nightlife',   tier: 'exceedingly_rare', emoji: '🌃',                            type: 'background_unlock', key: 'taipei_nightlife' },
  cur_crown:   { label: 'Cursor: Crown of Iantopia',      tier: 'exceedingly_rare', emoji: '👑',                            type: 'cursor_unlock', key: 'crown' },
  alt_ending:  { label: 'Alternate Ending',               tier: 'exceedingly_rare', emoji: '🎬',                            type: 'unlock_page', path: '/never' },
};

// Paths an `unlock_page` item may grant. A path only belongs here once the page
// is a real built route — the engine refuses anything not listed, so an item can
// never hand out a dead link. Add the route in the same change that adds the page.
window.LOOTBOX_UNLOCKABLE_PAGES = [
  '/never', // src/pages/never.astro
];

// Case contents are DERIVED from the item pool rather than hand-listed, so
// adding an item above automatically places it in every case it qualifies for.
// Hand-maintained id arrays rot the moment a new asset lands.
const ALL_IDS = Object.keys(window.CASE_ITEMS);
const idsByType = (...types) => ALL_IDS.filter((id) => types.includes(window.CASE_ITEMS[id].type));
const idsFromTier = (minTier) => {
  const min = window.CASE_RARITY_ORDER.indexOf(minTier);
  return ALL_IDS.filter((id) => window.CASE_RARITY_ORDER.indexOf(window.CASE_ITEMS[id].tier) >= min);
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
    blurb: 'The standard issue. Everything Iantopia has to offer, at honest odds.',
    items: ALL_IDS,
  },

  signal: {
    label: 'Signal Case',
    cost: 2500,
    emoji: '📻',
    blurb: 'Audio and visual unlocks only. No junk drawer — every drop changes how the site looks or sounds.',
    // Cosmetics only, plus two cheap Mil-Spec entries because this case still
    // rolls Mil-Spec 65% of the time and needs something to land on there.
    items: ['s_1000', 'used_deck'].concat(
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
      restricted: 55.0,
      classified: 30.0,
      covert: 11.0,
      exceedingly_rare: 4.0,
    },
    items: idsFromTier('restricted'),
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

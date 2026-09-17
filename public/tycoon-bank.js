// tycoon-bank.js
// The wallet cap: a hard ceiling on the total Strubles balance, read by
// strubles.js's add() on every page that touches currency (not just
// tycoon.astro -- confirmed strubles.js + cloud-sync.js both load on all
// 8 pages, so this has to be safe to load everywhere too). Replaces the
// old OFFLINE_CAP_MS mechanism, which only bounded production while a
// player was away; this bounds the balance itself, uniformly, regardless
// of online/offline state or income source.
//
// Deliberately does NOT depend on tycoon-buildings.js being loaded (that
// file is tycoon.astro-only) -- falls back to a hardcoded max-building-
// copies of 5 if window.TYCOON_MAX_PER_TYPE isn't present.
window.TycoonBank = (function () {
  const BANK_LEVEL_KEY = 'tycoon_bank_level_v1';
  const INV_KEY = 'strubles_inventory_v1';
  const BASE_CAP = 20000; // level 0, free
  const TAIPEI_BONUS_PER_COPY = 10000; // see tycoon-buildings.js's taipei_101 entry -- its "reason to own one" beyond production

  // Levels 1-3 are exactly the numbers given; cost and cap-gain happen to
  // both land on 40,000 at level 3, which is the anchor "triple both"
  // scales from for anything past it.
  const LEVELS = {
    1: { cost: 5000, gain: 15000 },
    2: { cost: 15000, gain: 25000 },
    3: { cost: 40000, gain: 40000 },
  };
  const GROWTH = 3; // level 4+: both cost and cap-gain triple per level past 3

  function costForLevel(n) {
    if (n <= 0) return 0;
    if (LEVELS[n]) return LEVELS[n].cost;
    return LEVELS[3].cost * Math.pow(GROWTH, n - 3);
  }
  function capGainForLevel(n) {
    if (n <= 0) return 0;
    if (LEVELS[n]) return LEVELS[n].gain;
    return LEVELS[3].gain * Math.pow(GROWTH, n - 3);
  }
  // Cumulative -- looped rather than a closed-form geometric sum, so the
  // table above and this function agree by construction, not by algebra
  // that could quietly drift out of sync with it.
  function capForLevel(n) {
    let cap = BASE_CAP;
    for (let i = 1; i <= n; i++) cap += capGainForLevel(i);
    return cap;
  }

  function currentLevel() {
    const n = Number(localStorage.getItem(BANK_LEVEL_KEY));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  function taipeiBonus() {
    let inv;
    try { inv = JSON.parse(localStorage.getItem(INV_KEY) || '{}'); } catch { inv = {}; }
    const buildings = Array.isArray(inv.buildings) ? inv.buildings : [];
    const owned = buildings.filter((k) => k === 'taipei_101').length;
    const maxCopies = window.TYCOON_MAX_PER_TYPE || 5;
    return Math.min(owned, maxCopies) * TAIPEI_BONUS_PER_COPY;
  }

  function currentCap() {
    return capForLevel(currentLevel()) + taipeiBonus();
  }

  return {
    BANK_LEVEL_KEY,
    costForLevel,
    capGainForLevel,
    capForLevel,
    currentLevel,
    taipeiBonus,
    currentCap,
  };
})();

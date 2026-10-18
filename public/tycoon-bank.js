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
// copies via TycoonCap.MAX_TAIPEI_COPIES if window.TYCOON_MAX_PER_TYPE
// isn't present.
//
// The level math itself (what each bank level costs and is worth) lives in
// tycoon-cap.js, shared with the arena server's balance.js so the two can
// never independently drift the way they used to -- load that script
// before this one.
window.TycoonBank = (function () {
  const BANK_LEVEL_KEY = 'tycoon_bank_level_v1';
  const INV_KEY = 'strubles_inventory_v1';
  const Cap = window.TycoonCap;

  function currentLevel() {
    const n = Number(localStorage.getItem(BANK_LEVEL_KEY));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  function taipeiBonus() {
    let inv;
    try { inv = JSON.parse(localStorage.getItem(INV_KEY) || '{}'); } catch { inv = {}; }
    const buildings = Array.isArray(inv.buildings) ? inv.buildings : [];
    const owned = buildings.filter((k) => k === 'taipei_101').length;
    const maxCopies = window.TYCOON_MAX_PER_TYPE || Cap.MAX_TAIPEI_COPIES;
    return Math.min(owned, maxCopies) * Cap.TAIPEI_BONUS_PER_COPY;
  }

  function currentCap() {
    return Cap.capForLevel(currentLevel()) + taipeiBonus();
  }

  return {
    BANK_LEVEL_KEY,
    costForLevel: Cap.costForLevel,
    capGainForLevel: Cap.capGainForLevel,
    capForLevel: Cap.capForLevel,
    currentLevel,
    taipeiBonus,
    currentCap,
  };
})();

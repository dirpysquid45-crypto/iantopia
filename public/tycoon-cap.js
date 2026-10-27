// tycoon-cap.js
// The wallet-cap LEVEL MATH ONLY — pure functions, no localStorage, no
// Firestore. Shared between the browser (tycoon-bank.js) and the arena
// server (balance.js, the actual authority on a real balance), which both
// need to agree on exactly what a given bank level is worth. They used to
// each carry their own copy of this table, and the level 4+ formula was
// wrong the same way in both: cost and cap-gain each tripled independently
// per level, so cost(n) raced ahead of what cap(n-1) could ever hold — a
// player maxed at level 3 (cap 100,000, or 110,000 with one Taipei 101)
// could never save the 120,000 level 4 needed. Every level past 3 was the
// same wall, just a bigger one each time.
//
// Fixed by generating each level past 3 from the PREVIOUS level's own cap
// instead of an independent multiplier: cost(n) is always a fixed fraction
// of cap(n-1), so it can never outrun what a player is able to hold.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TycoonCap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BASE_CAP = 20000;              // level 0, free
  const TAIPEI_BONUS_PER_COPY = 10000; // see tycoon-buildings.js's taipei_101 entry
  const MAX_TAIPEI_COPIES = 5;

  // Levels 1-3 are exactly these numbers; cost and cap-gain happen to both
  // land on 40,000 at level 3, which is the anchor level 4+ builds from.
  const LEVELS = {
    1: { cost: 5000, gain: 15000 },
    2: { cost: 15000, gain: 25000 },
    3: { cost: 40000, gain: 40000 },
  };
  // Level n costs a fraction of the cap at level n-1, so it is always affordable
  // with room to spare. The fraction starts at 60% at level 4 and rises 2 points
  // per level to 70% at level 9, so the top levels cost more to reach.
  const costFraction = (n) => Math.min(0.7, 0.6 + 0.02 * (n - 4));
  const GAIN_MULT = 1.2;     // and grows the cap by 1.2x what it cost — still a worthwhile upgrade
  const ROUND_TO = 1000;
  const round = (n) => Math.round(n / ROUND_TO) * ROUND_TO;

  // levelCache[n] = { cost, gain, cap } for bank level n, built lazily and
  // once. Every lookup function reads from this same table, so they can
  // never disagree with each other the way two independent formulas could.
  const levelCache = [{ cost: 0, gain: 0, cap: BASE_CAP }];
  function levelInfo(n) {
    n = Math.max(0, Math.floor(n) || 0);
    while (levelCache.length <= n) {
      const i = levelCache.length;
      const prevCap = levelCache[i - 1].cap;
      let cost, gain;
      if (LEVELS[i]) { cost = LEVELS[i].cost; gain = LEVELS[i].gain; }
      else { cost = round(prevCap * costFraction(i)); gain = round(cost * GAIN_MULT); }
      levelCache.push({ cost, gain, cap: prevCap + gain });
    }
    return levelCache[n];
  }

  return {
    BASE_CAP,
    TAIPEI_BONUS_PER_COPY,
    MAX_TAIPEI_COPIES,
    costForLevel: (n) => levelInfo(n).cost,
    capGainForLevel: (n) => levelInfo(n).gain,
    capForLevel: (n) => levelInfo(n).cap,
  };
});

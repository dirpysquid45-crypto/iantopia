// tycoon-economy.js
// Cost and pacing rules for the Tycoon and the Real Estate shop, as pure
// functions: no localStorage, no DOM. The browser (tycoon.astro, lootbox.js)
// and the Node tests (arena-server/test/tycoon-economy.test.js) both load
// this file, so the numbers a player is charged are the numbers the tests check.
//
// The shape is the same everywhere: a price grows with how far the player has
// got, while what a building earns does not. So new players can afford their
// first things quickly, and later purchases take longer to pay back.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TycoonEconomy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const round10 = (n) => Math.round(n / 10) * 10;

  // Placement permits: the first few buildings are at list price, then each
  // extra building in the village raises the next permit by 7%.
  const PERMIT_FREE_BUILDINGS = 3;
  const PERMIT_GROWTH = 1.07;

  // Building slots: slot 1 costs SLOT_BASE_COST, and each later slot costs the
  // previous one times (1.2 + 0.04 * n), where n is the slot being bought.
  const SLOT_BASE_COST = 300;

  // Real Estate: each copy already owned multiplies the next copy's price.
  const REAL_ESTATE_COPY_GROWTH = 1.2;

  // Rookie catch-up: production is doubled at zero lifetime earnings and fades
  // linearly to normal by ROOKIE_LIFETIME_EARN.
  const ROOKIE_LIFETIME_EARN = 25000;

  // The first FAST_BUILDS completed buildings finish in FAST_BUILD_FRACTION of
  // their normal time, so a new player sees income in their first session.
  const FAST_BUILDS = 3;
  const FAST_BUILD_FRACTION = 0.1;

  // Upkeep rises by 3% for every building over UPKEEP_FREE_BUILDINGS, so a big
  // village pays for its size and a small one is unaffected.
  const UPKEEP_FREE_BUILDINGS = 10;
  const UPKEEP_GROWTH = 0.03;

  // Real Estate list prices for one copy, by tier. Copies after the first are
  // priced by realEstatePrice().
  const REAL_ESTATE_BASE = {
    mil_spec: 2500,
    restricted: 6000,
    classified: 20000,
    covert: 90000,
    exceedingly_rare: 400000,
  };

  // The permit for the next placed building, given the list-price permit and
  // how many buildings the village already has (under construction included).
  function permitCost(listPrice, placedCount) {
    const extra = Math.max(0, (placedCount || 0) - PERMIT_FREE_BUILDINGS);
    return round10(listPrice * Math.pow(PERMIT_GROWTH, extra));
  }

  // Cost of the slot that takes the village to n slots bought (1-based).
  function slotCost(n) {
    if (n <= 0) return 0;
    let cost = SLOT_BASE_COST;
    for (let i = 2; i <= n; i++) cost = round10(cost * (1.2 + 0.04 * i));
    return cost;
  }

  // Price of the next copy of a Real Estate building, given the copies owned.
  function realEstatePrice(tier, copiesOwned) {
    const base = REAL_ESTATE_BASE[tier] || 0;
    return round10(base * Math.pow(REAL_ESTATE_COPY_GROWTH, Math.max(0, copiesOwned || 0)));
  }

  // Multiplier on production. 2 at zero lifetime earnings, 1 from ROOKIE_LIFETIME_EARN on.
  function rookieMultiplier(lifetimeEarned) {
    return 1 + Math.max(0, 1 - Math.max(0, lifetimeEarned || 0) / ROOKIE_LIFETIME_EARN);
  }

  // Build time in minutes. The first FAST_BUILDS completed buildings are quick.
  function buildMinutes(baseMinutes, completedEver) {
    return (completedEver || 0) < FAST_BUILDS ? baseMinutes * FAST_BUILD_FRACTION : baseMinutes;
  }

  // Multiplier on a building's upkeep for a village of this size.
  function upkeepMultiplier(placedCount) {
    return 1 + UPKEEP_GROWTH * Math.max(0, (placedCount || 0) - UPKEEP_FREE_BUILDINGS);
  }

  return {
    PERMIT_FREE_BUILDINGS,
    SLOT_BASE_COST,
    ROOKIE_LIFETIME_EARN,
    FAST_BUILDS,
    REAL_ESTATE_BASE,
    permitCost,
    slotCost,
    realEstatePrice,
    rookieMultiplier,
    buildMinutes,
    upkeepMultiplier,
  };
});

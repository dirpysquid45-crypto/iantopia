// Pacing rules for the Tycoon and the Real Estate shop (public/tycoon-economy.js).
// These pin the shape of the curve, not just single numbers: a new player can
// afford their first things quickly, and every later purchase costs more to reach.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadModule(name) {
  const file = path.join(__dirname, '..', '..', 'public', name);
  const mod = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(file, 'utf8'))(mod, mod.exports);
  return mod.exports;
}
const E = loadModule('tycoon-economy.js');
const Cap = loadModule('tycoon-cap.js');

test('slot costs start at 300 and rise strictly with every slot', () => {
  assert.equal(E.slotCost(0), 0);
  assert.equal(E.slotCost(1), 300);
  for (let n = 2; n <= 20; n++) {
    assert.ok(E.slotCost(n) > E.slotCost(n - 1), `slot ${n} must cost more than slot ${n - 1}`);
  }
});

test('the first slots stay cheap and the late ones are a real spend', () => {
  assert.ok(E.slotCost(5) < 1000, `slot 5 is ${E.slotCost(5)}`);
  assert.ok(E.slotCost(10) < 8000, `slot 10 is ${E.slotCost(10)}`);
  assert.ok(E.slotCost(15) > 100000, `slot 15 is ${E.slotCost(15)}`);
});

test('permits stay at list price for the first few buildings, then inflate', () => {
  for (let placed = 0; placed <= E.PERMIT_FREE_BUILDINGS; placed++) {
    assert.equal(E.permitCost(1000, placed), 1000, `${placed} placed should pay list price`);
  }
  const at15 = E.permitCost(1000, 15);
  assert.ok(at15 > 2000 && at15 < 2400, `15 placed should be about 2.25x, got ${at15}`);
  let prev = 0;
  for (let placed = 0; placed <= 30; placed++) {
    const p = E.permitCost(1000, placed);
    assert.ok(p >= prev, `permit must not fall as the village grows (at ${placed})`);
    prev = p;
  }
});

test('each extra Real Estate copy costs more, and the first copy is the list price', () => {
  assert.equal(E.realEstatePrice('mil_spec', 0), E.REAL_ESTATE_BASE.mil_spec);
  const fifth = E.realEstatePrice('mil_spec', 4);
  assert.ok(fifth > 2 * E.REAL_ESTATE_BASE.mil_spec, `5th copy should be about 2.07x, got ${fifth}`);
  for (let owned = 1; owned <= 5; owned++) {
    assert.ok(E.realEstatePrice('restricted', owned) > E.realEstatePrice('restricted', owned - 1));
  }
});

test('the cheapest Real Estate is buyable from the start, under the base wallet cap', () => {
  assert.ok(E.REAL_ESTATE_BASE.mil_spec <= Cap.BASE_CAP);
});

test('rookie catch-up starts at 2x and fades to 1x by the threshold', () => {
  assert.equal(E.rookieMultiplier(0), 2);
  assert.equal(E.rookieMultiplier(E.ROOKIE_LIFETIME_EARN / 2), 1.5);
  assert.equal(E.rookieMultiplier(E.ROOKIE_LIFETIME_EARN), 1);
  assert.equal(E.rookieMultiplier(E.ROOKIE_LIFETIME_EARN * 10), 1, 'never drops below normal');
});

test('the first completed builds finish fast, then build times are normal', () => {
  assert.equal(E.buildMinutes(15, 0), 1.5);
  assert.equal(E.buildMinutes(15, E.FAST_BUILDS - 1), 1.5);
  assert.equal(E.buildMinutes(15, E.FAST_BUILDS), 15);
});

test('upkeep is unchanged for a small village and scales up for a big one', () => {
  assert.equal(E.upkeepMultiplier(0), 1);
  assert.equal(E.upkeepMultiplier(10), 1);
  assert.ok(Math.abs(E.upkeepMultiplier(20) - 1.3) < 1e-9);
});

test('the first slot is within reach of the starting balance', () => {
  // Starting balance (100) + starter grant (100) comes to 200, so the first slot
  // needs one daily prize or a little Tetris, not a lootbox.
  assert.ok(E.slotCost(1) <= 500);
});

test('each bank level past 3 costs at most 70% of the level below, and stays affordable', () => {
  let prevCap = Cap.capForLevel(3);
  for (let n = 4; n <= 12; n++) {
    const cost = Cap.costForLevel(n);
    assert.ok(cost <= 0.7 * prevCap + 1000, `level ${n} costs ${cost}, above 70% of ${prevCap}`);
    assert.ok(cost <= prevCap, `level ${n} must stay reachable from the cap below it`);
    prevCap = Cap.capForLevel(n);
  }
});

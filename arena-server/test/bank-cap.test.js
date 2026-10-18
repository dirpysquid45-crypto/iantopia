// Regression test for a real bug: bank level 4's cost (120,000) exceeded the
// cap reachable at level 3 (100,000, or 110,000 with one Taipei 101) -- cost
// and cap-gain each tripled independently per level, racing ahead of what
// the cumulative cap could ever hold. Every level past 3 was the same wall,
// permanently. tycoon-cap.js (shared by the browser and this server) now
// derives each level's cost from the PREVIOUS level's own cap, which makes
// this affordable by construction -- this test is the guard against that
// drifting back in, here or in a future edit to either copy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const BalanceManager = require('../balance');

function loadCap() {
  const file = path.join(__dirname, '..', '..', 'public', 'tycoon-cap.js');
  const mod = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(file, 'utf8'))(mod, mod.exports);
  return mod.exports;
}

test('every bank level is affordable from the previous level\'s own cap', () => {
  const Cap = loadCap();
  let prevCap = Cap.BASE_CAP;
  for (let n = 1; n <= 20; n++) {
    const cost = Cap.costForLevel(n);
    assert.ok(cost <= prevCap, `level ${n} costs ${cost} but level ${n - 1}'s cap is only ${prevCap} -- unreachable`);
    prevCap = Cap.capForLevel(n);
  }
});

test('the specific reported case: level 3 (100,000 cap) can now afford level 4', () => {
  const Cap = loadCap();
  assert.equal(Cap.capForLevel(3), 100000);
  assert.ok(Cap.costForLevel(4) <= 100000, `level 4 cost was ${Cap.costForLevel(4)}, must fit inside level 3's 100,000 cap`);
});

test('the server\'s capFromData() agrees with the shared module it delegates to', () => {
  const Cap = loadCap();
  const bm = new BalanceManager(null);
  for (const level of [0, 1, 3, 4, 7]) {
    assert.equal(
      bm.capFromData({ tycoon_bank_level_v1: level, strubles_inventory_v1: '{}' }),
      Cap.capForLevel(level),
      `level ${level}: server and shared module disagree`
    );
  }
  // Taipei 101 bonus still applies on top, capped at MAX_TAIPEI_COPIES.
  const withTaipei = bm.capFromData({
    tycoon_bank_level_v1: 3,
    strubles_inventory_v1: JSON.stringify({ buildings: ['taipei_101', 'taipei_101'] }),
  });
  assert.equal(withTaipei, Cap.capForLevel(3) + 2 * Cap.TAIPEI_BONUS_PER_COPY);
});

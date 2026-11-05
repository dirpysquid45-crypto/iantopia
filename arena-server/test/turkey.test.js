const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./fakes');
const { TurkeyManager, DAILY_STRUBLE_CAP } = require('../turkey');
const BalanceManager = require('../balance');

function setup() {
  const db = new FakeDb();
  const balance = new BalanceManager(db);
  return { db, turkey: new TurkeyManager(db, balance) };
}

test('a pardon grants the turkey cursor once', async () => {
  const { db, turkey } = setup();
  const first = await turkey.claimPardon('u1');
  assert.deepEqual(first, { cursor: 'turkey', isNew: true });
  const again = await turkey.claimPardon('u1');
  assert.equal(again.isNew, false);
  const inv = JSON.parse(db.docs.get('users/u1').strubles_inventory_v1);
  assert.deepEqual(inv.cursors, ['turkey']);
});

test('corn converts 10 to 1 and stops at the daily cap', async () => {
  const { turkey } = setup();
  const a = await turkey.convertCorn('u2', 250);
  assert.equal(a.credited, 25);
  assert.equal(a.cornUsed, 250);
  const b = await turkey.convertCorn('u2', 1000);
  assert.equal(b.credited, DAILY_STRUBLE_CAP - 25);
  const c = await turkey.convertCorn('u2', 1000);
  assert.equal(c.credited, 0);
  assert.equal(c.cornUsed, 0);
});

test('guests and too-small amounts are refused', async () => {
  const { turkey } = setup();
  await assert.rejects(turkey.claimPardon('guest_abc123def456'), /Sign in/);
  await assert.rejects(turkey.convertCorn('guest_abc123def456', 50), /Sign in/);
  await assert.rejects(turkey.convertCorn('u3', 5), /Not enough corn/);
  await assert.rejects(turkey.convertCorn('u3', 2.5), /Not enough corn/);
});

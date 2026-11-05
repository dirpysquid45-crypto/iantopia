// An account whose balance field has never been written has the starting balance.
// The wallet and the browser show 100 for it, so the stake, payout and refund paths
// must start from 100 too, not from 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const BalanceManager = require('../balance');
const { FakeDb } = require('./fakes');

test('a missing balance reads as the starting 100 on every path', async () => {
  const db = new FakeDb();
  const bm = new BalanceManager(db);
  assert.equal(await bm.getBalance('fresh'), 100);
  assert.equal(await bm.deductBet('fresh', 30), 70, 'a stake comes out of the starting 100');
  assert.equal((await bm.refundBet('fresh2', 20)).balance, 120, 'a refund adds to the starting 100');
});

test('a stake larger than the starting balance is refused for a new account', async () => {
  const db = new FakeDb();
  const bm = new BalanceManager(db);
  await assert.rejects(bm.deductBet('fresh', 150), /Insufficient/);
});

test('a stored balance of 0 is still 0, not the starting balance', async () => {
  const db = new FakeDb();
  db.seed('broke', { strubles_balance_v1: '0' });
  const bm = new BalanceManager(db);
  assert.equal(await bm.getBalance('broke'), 0);
});

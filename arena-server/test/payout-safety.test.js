// Payouts: applied once per id, never lower an over-cap balance, retried on a
// transient failure, and kept for an admin when every try fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const BalanceManager = require('../balance');
const { FakeDb } = require('./fakes');

test('a payout with an id is applied once, even if it is retried', async () => {
  const db = new FakeDb();
  db.seed('p1', { strubles_balance_v1: '200' });
  const bm = new BalanceManager(db);
  const first = await bm.creditPayout('p1', 50, 'table1:win:0');
  const again = await bm.creditPayout('p1', 50, 'table1:win:0');
  assert.equal(first.applied, 50);
  assert.equal(again.applied, 50, 'the retry reports the same credit');
  assert.equal(db.docs.get('users/p1').strubles_balance_v1, '250', 'and is not paid twice');
});

test('a payout is recorded as settled, so the account watch does not judge it as a client win', async () => {
  const db = new FakeDb();
  db.seed('p2', { strubles_balance_v1: '100' });
  await new BalanceManager(db).creditPayout('p2', 40, 'x');
  const gain = JSON.parse(db.docs.get('users/p2').strubles_last_gain_v1);
  assert.equal(gain.kind, 'settled');
  assert.equal(gain.amount, 40);
});

test('a payout never lowers a balance that is already above the wallet cap', async () => {
  const db = new FakeDb();
  db.seed('rich', { strubles_balance_v1: '99999999', tycoon_bank_level_v1: '0' });
  const r = await new BalanceManager(db).creditPayout('rich', 500, 'y');
  assert.equal(r.applied, 0, 'nothing fits above the cap');
  assert.equal(db.docs.get('users/rich').strubles_balance_v1, '99999999', 'the balance is kept');
});

test('a payout clipped by the cap reports what was actually credited', async () => {
  const db = new FakeDb();
  db.seed('p3', { strubles_balance_v1: '100', tycoon_bank_level_v1: '0' });
  const bm = new BalanceManager(db);
  const cap = bm.capFromData(db.docs.get('users/p3'));
  const r = await bm.creditPayout('p3', cap * 10, 'z');
  assert.equal(r.applied, cap - 100);
  assert.equal(r.balance, cap);
});

test('a payout that fails once is retried and lands', async () => {
  const db = new FakeDb();
  db.seed('p4', { strubles_balance_v1: '100' });
  db.failNextSets = 1;
  const r = await new BalanceManager(db).payOut('p4', 30, { id: 'retry:win:0' });
  assert.equal(r.paid, true);
  assert.equal(r.applied, 30);
  assert.equal(db.docs.get('users/p4').strubles_balance_v1, '130');
});

test('a payout that never lands is kept for an admin and reported as unpaid', async () => {
  const db = new FakeDb();
  db.seed('p5', { strubles_balance_v1: '100' });
  db.failNextSets = 3;                       // all three tries fail
  const r = await new BalanceManager(db).payOut('p5', 30, { id: 'lost:win:0', game: 'blackjack' });
  assert.equal(r.paid, false);
  assert.equal(r.applied, 0);
  assert.equal(db.docs.get('users/p5').strubles_balance_v1, '100', 'nothing was credited');
  const kept = [...db.docs.entries()].filter(([k]) => k.startsWith('failed_payouts/'));
  assert.equal(kept.length, 1, 'the payout is kept to pay by hand');
  assert.equal(kept[0][1].amount, 30);
  assert.equal(kept[0][1].userId, 'p5');
});

test('a stake refund is applied once, even if it is retried', async () => {
  const db = new FakeDb();
  db.seed('p6', { strubles_balance_v1: '70' });
  const bm = new BalanceManager(db);
  await bm.refundBet('p6', 30, 'table2:refund:0');
  await bm.refundBet('p6', 30, 'table2:refund:0');
  assert.equal(db.docs.get('users/p6').strubles_balance_v1, '100');
});

test('a failed payout can be paid by hand once, and paid ones leave the list', async () => {
  const db = new FakeDb();
  db.seed('p7', { strubles_balance_v1: '100' });
  const bm = new BalanceManager(db);
  db.failNextSets = 3;
  await bm.payOut('p7', 30, { id: 'manual:win:0', game: 'tetris' });
  const listed = await bm.listFailedPayouts();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].amount, 30);
  assert.equal(listed[0].game, 'tetris');
  await bm.resolveFailedPayout(listed[0].docId, 'admin1');
  assert.equal(db.docs.get('users/p7').strubles_balance_v1, '130');
  assert.equal((await bm.listFailedPayouts()).length, 0, 'a paid payout leaves the list');
  await assert.rejects(bm.resolveFailedPayout(listed[0].docId, 'admin1'), /already paid/);
  assert.equal(db.docs.get('users/p7').strubles_balance_v1, '130', 'and is not paid twice');
});

test('paying a failed payout whose first try had landed does not pay it again', async () => {
  const db = new FakeDb();
  db.seed('p8', { strubles_balance_v1: '100', paid_ids_v1: [{ id: 'landed:win:0', applied: 30 }] });
  db.docs.set('failed_payouts/rec1', { kind: 'payout', userId: 'p8', amount: 30, id: 'landed:win:0', error: 'timeout' });
  await new BalanceManager(db).resolveFailedPayout('rec1', 'admin1');
  assert.equal(db.docs.get('users/p8').strubles_balance_v1, '100', 'the credit is not applied twice');
  assert.equal(db.docs.get('failed_payouts/rec1').resolved, true);
});

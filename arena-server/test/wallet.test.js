// The Strubles wallet: every balance change the browser asks for is checked here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Wallet, rollDaily, DAILY_TIERS, TETRIS_PER_GAME, TETRIS_PER_DAY, START_BALANCE } = require('../wallet');
const BalanceManager = require('../balance');
const { FakeDb } = require('./fakes');

function setup(data = {}, t = Date.UTC(2026, 9, 22, 12)) {
  const db = new FakeDb();
  db.seed('u1', data);
  const wallet = new Wallet(db, { capFromData: () => 20000 }, { now: () => t, rand: () => 0.1 });
  let n = 0;
  const op = (kind, extra = {}) => ({ id: 'op' + (++n), kind, ...extra });
  return { db, wallet, op, t };
}

test('a new account starts at the starting balance, and a win adds to it', async () => {
  const { wallet, op, db } = setup({});
  const [r] = await wallet.applyBatch('u1', [op('win', { amount: 50, page: '/blackjack' })]);
  assert.equal(r.ok, true);
  assert.equal(r.balance, START_BALANCE + 50);
  assert.equal(db.docs.get('users/u1').strubles_balance_v1, String(START_BALANCE + 50));
  assert.match(db.docs.get('users/u1').strubles_last_gain_v1, /"amount":50/, 'the gain is recorded for the watch');
});

test('a win is capped at the wallet cap', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '19990' });
  const [r] = await wallet.applyBatch('u1', [op('win', { amount: 500 })]);
  assert.equal(r.applied, 10);
  assert.equal(r.balance, 20000);
});

test('a spend can never take the balance below zero', async () => {
  const { wallet, op, db } = setup({ strubles_balance_v1: '40' });
  const [refused] = await wallet.applyBatch('u1', [op('spend', { amount: 50 })]);
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'insufficient');
  assert.equal(db.docs.get('users/u1').strubles_balance_v1, '40', 'nothing was written');
  const [paid] = await wallet.applyBatch('u1', [op('spend', { amount: 40 })]);
  assert.equal(paid.balance, 0);
});

test('a refund puts money back without the wallet cap, and tells the account watch', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '19999' });
  let credit = null;
  const listener = (e) => { credit = e; };
  BalanceManager.credits.on('refund', listener);
  // A refund is only for something already paid: the purchase comes first.
  await wallet.applyBatch('u1', [op('spend', { amount: 10000 })]);
  const [r] = await wallet.applyBatch('u1', [op('refund', { amount: 10000 })]);
  BalanceManager.credits.off('refund', listener);
  assert.equal(r.ok, true);
  assert.equal(r.balance, 19999, 'refund is not capped, and the purchase is paid back');
  assert.deepEqual(credit, { uid: 'u1', amount: 10000 });
});

test('the same op id is applied once, even if the browser sends it again', async () => {
  const { wallet, db } = setup({ strubles_balance_v1: '500' });
  const o = { id: 'dup1', kind: 'win', amount: 100 };
  await wallet.applyBatch('u1', [o]);
  const [again] = await wallet.applyBatch('u1', [o]);
  assert.equal(again.duplicate, true);
  assert.equal(db.docs.get('users/u1').strubles_balance_v1, '600');
});

test('Tetris pay is capped per game and per day on the server, whatever points the browser sends', async () => {
  const { wallet, op } = setup({});
  const [a] = await wallet.applyBatch('u1', [op('tetris', { points: 9999 })]);
  assert.equal(a.applied, TETRIS_PER_GAME, 'one game is capped');
  let total = a.applied;
  for (let i = 0; i < 10; i++) {
    const [r] = await wallet.applyBatch('u1', [op('tetris', { points: 9999 })]);
    total += r.applied;
  }
  assert.equal(total, TETRIS_PER_DAY, 'a day is capped');
  const [over] = await wallet.applyBatch('u1', [op('tetris', { points: 9999 })]);
  assert.equal(over.applied, 0);
});

test('the starter grant is once per account', async () => {
  const { wallet, op } = setup({});
  const [first] = await wallet.applyBatch('u1', [op('starter')]);
  assert.equal(first.ok, true);
  const [second] = await wallet.applyBatch('u1', [op('starter')]);
  assert.equal(second.error, 'already_claimed');
});

test('the daily prize is once per UTC day, and the server rolls the amount', async () => {
  const { wallet, op, t } = setup({});
  const [first] = await wallet.applyBatch('u1', [op('daily')]);
  assert.equal(first.ok, true);
  assert.ok(DAILY_TIERS.some(([amt]) => amt === first.rolled), 'the roll is one of the tiers');
  const [again] = await wallet.applyBatch('u1', [op('daily')]);
  assert.equal(again.error, 'already_claimed');
  // The next UTC day gives a new claim.
  const later = new Wallet(wallet.db, wallet.balance, { now: () => t + 86400000, rand: () => 0.1 });
  const [next] = await later.applyBatch('u1', [op('daily')]);
  assert.equal(next.ok, true);
});

test('rollDaily follows the tier weights', () => {
  assert.equal(rollDaily(() => 0.0), 500);
  assert.equal(rollDaily(() => 0.6), 1000);
  assert.equal(rollDaily(() => 0.999), 5000);
});

test('bad input is refused without touching the balance', async () => {
  const { wallet, op, db } = setup({ strubles_balance_v1: '300' });
  const bad = await wallet.applyBatch('u1', [
    { id: 'x', kind: 'mint' },
    { id: 'y', kind: 'win', amount: -5 },
    { id: 'z', kind: 'win', amount: 1.5 },
    { id: 'w', kind: 'win', amount: 2000000 },
    { id: 'v', kind: 'tetris', points: 'lots' },
    { id: '../x', kind: 'win', amount: 1 },
    { kind: 'win', amount: 1 },
  ]);
  for (const r of bad) assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(db.docs.get('users/u1').strubles_balance_v1, '300');
  assert.ok(op);
});

test('a player who is over-rate is slowed down', async () => {
  const { db } = setup({});
  const w = new Wallet(db, { capFromData: () => 20000 }, { now: () => 1000, rand: () => 0.1 });
  let limited = 0;
  for (let i = 0; i < 260; i++) {
    const [r] = await w.applyBatch('u1', [{ id: 'r' + i, kind: 'win', amount: 1 }]);
    if (r.error === 'rate_limited') limited++;
  }
  assert.ok(limited > 0);
});

test('an account under a ban can not move Strubles through the wallet', async () => {
  const { db, wallet, op } = setup({ strubles_balance_v1: '500' });
  db.seed('bans/u1', {});   // placeholder so the collection exists
  db.docs.set('bans/u1', { until: new Date(Date.now() + 3600000) });
  const w = new Wallet(db, { capFromData: () => 20000 }, { now: () => Date.now(), rand: () => 0.1 });
  const [r] = await w.applyBatch('u1', [op('win', { amount: 100 })]);
  assert.equal(r.error, 'banned');
  assert.equal(db.docs.get('users/u1').strubles_balance_v1, '500');
  assert.ok(wallet);
});

test('a ban that has run out does not block the wallet', async () => {
  const { db, op } = setup({ strubles_balance_v1: '500' });
  db.docs.set('bans/u1', { until: new Date(Date.now() - 1000) });
  const w = new Wallet(db, { capFromData: () => 20000 }, { now: () => Date.now(), rand: () => 0.1 });
  const [r] = await w.applyBatch('u1', [op('win', { amount: 100 })]);
  assert.equal(r.ok, true);
});

test('a stake opens a round and a settlement closes it: a win pays at most stake x the multiplier', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '1000' });
  const [st] = await wallet.applyBatch('u1', [op('stake', { game: 'blackjack', round: 'hand1', amount: 100 })]);
  assert.equal(st.balance, 900);
  const [over] = await wallet.applyBatch('u1', [op('settle', { game: 'blackjack', round: 'hand1', amount: 251 })]);
  assert.equal(over.error, 'over_limit', 'more than 2.5x the stake is refused');
  const [ok] = await wallet.applyBatch('u1', [op('settle', { game: 'blackjack', round: 'hand1', amount: 250 })]);
  assert.equal(ok.ok, true);
  assert.equal(ok.balance, 1150);
});

test('a round settles once, and a loss settles at 0 to close it', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '1000' });
  await wallet.applyBatch('u1', [op('stake', { game: 'minesweeper', round: 'g1', amount: 50 })]);
  const [loss] = await wallet.applyBatch('u1', [op('settle', { game: 'minesweeper', round: 'g1', amount: 0 })]);
  assert.equal(loss.ok, true);
  const [again] = await wallet.applyBatch('u1', [op('settle', { game: 'minesweeper', round: 'g1', amount: 300 })]);
  assert.equal(again.error, 'no_round', 'a settled round can not be claimed again');
});

test('a settlement needs a round for the same game', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '1000' });
  await wallet.applyBatch('u1', [op('stake', { game: 'blackjack', round: 'h', amount: 100 })]);
  const [wrong] = await wallet.applyBatch('u1', [op('settle', { game: 'minesweeper', round: 'h', amount: 50 })]);
  assert.equal(wrong.error, 'no_round');
});

test('a stake the balance can not cover is refused', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '40' });
  const [r] = await wallet.applyBatch('u1', [op('stake', { game: 'blackjack', round: 'h', amount: 50 })]);
  assert.equal(r.error, 'insufficient');
});

test('income from a source has a daily cap, so one source can not pay out without limit', async () => {
  const { wallet, op } = setup({});
  const [a] = await wallet.applyBatch('u1', [op('win', { source: 'horse', amount: 1500 })]);
  assert.equal(a.applied, 1500);
  const [b] = await wallet.applyBatch('u1', [op('win', { source: 'horse', amount: 1500 })]);
  assert.equal(b.applied, 500, 'the horse cap of 2000 a day is reached');
  const [c] = await wallet.applyBatch('u1', [op('win', { source: 'lootbox', amount: 1500 })]);
  assert.equal(c.applied, 1500, 'another source has its own cap');
});

test('a refund can not return more than the player has paid for purchases', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '5000' });
  const [none] = await wallet.applyBatch('u1', [op('refund', { amount: 100 })]);
  assert.equal(none.error, 'over_refund_budget', 'no purchase, no refund');
  await wallet.applyBatch('u1', [op('spend', { amount: 300 })]);
  const [ok] = await wallet.applyBatch('u1', [op('refund', { amount: 300 })]);
  assert.equal(ok.ok, true);
  const [again] = await wallet.applyBatch('u1', [op('refund', { amount: 300 })]);
  assert.equal(again.error, 'over_refund_budget', 'the same purchase is refunded once');
});

test('a lost bet can not come back as a refund', async () => {
  const { wallet, op } = setup({ strubles_balance_v1: '1000' });
  await wallet.applyBatch('u1', [op('stake', { game: 'blackjack', round: 'lost', amount: 200 })]);
  await wallet.applyBatch('u1', [op('settle', { game: 'blackjack', round: 'lost', amount: 0 })]);
  const [r] = await wallet.applyBatch('u1', [op('refund', { amount: 200 })]);
  assert.equal(r.error, 'over_refund_budget');
});

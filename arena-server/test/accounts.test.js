// Cheat detection and punishments for accounts.js. Drives onChange() directly
// with the fake database, so no live Firestore listener is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./fakes');
const BalanceManager = require('../balance');
const { AccountWatch, STRIKE_WINDOW_MS } = require('../accounts');

function setup() {
  const db = new FakeDb();
  let now = Date.parse('2026-10-20T12:00:00Z');
  const watch = new AccountWatch({
    db,
    auth: { getUser: async () => { throw new Error('no user'); } },
    balance: new BalanceManager(db),
    now: () => now,
    log: { error() {} },
  });
  const events = [];
  watch.subscribe((ev) => events.push(ev));
  const cap = watch.balance.capFromData({ tycoon_bank_level_v1: 0 });
  return { db, watch, events, cap, tick(ms) { now += ms; } };
}

// Simulates one save write arriving from the listener.
async function save(t, uid, balance, extra = {}) {
  const data = Object.assign({ strubles_balance_v1: String(balance), tycoon_bank_level_v1: 0 }, extra);
  t.db.seed(uid, data);
  await t.watch.onChange(uid, data);
}

test('an honest increase that stays under the cap is not punished', async () => {
  const t = setup();
  await save(t, 'honest', 100);
  await save(t, 'honest', 500);
  assert.equal(t.events.filter((e) => e.kind === 'punish').length, 0);
});

test('going above the cap is a first offence: reset to 100 and a warning', async () => {
  const t = setup();
  await save(t, 'cheat1', 100);
  await save(t, 'cheat1', t.cap + 1);
  const punish = t.events.find((e) => e.kind === 'punish');
  assert.equal(punish.action, 'reset');
  assert.equal(t.db.docs.get('users/cheat1').strubles_balance_v1, '100');
  assert.ok(t.db.docs.get('users/cheat1').cheat_warning_at);
  assert.equal(t.db.docs.get('bans/cheat1'), undefined);
});

test('a second offence within 7 days bans for 24 hours and clears leaderboard rows', async () => {
  const t = setup();
  t.db.seed('leaderboard/cheat2', { displayName: 'x', gdp: 1 });
  await save(t, 'cheat2', 100);
  await save(t, 'cheat2', t.cap + 1);
  t.tick(60 * 60 * 1000);
  await save(t, 'cheat2', 100);
  await save(t, 'cheat2', t.cap + 1);
  const ban = t.events.filter((e) => e.kind === 'punish').pop();
  assert.equal(ban.action, 'ban');
  assert.ok(t.db.docs.get('bans/cheat2'));
  assert.equal(t.db.docs.get('leaderboard/cheat2'), undefined);
  assert.equal(t.db.docs.get('users/cheat2').strubles_balance_v1, '100');
});

test('an old strike outside the 7-day window does not count', async () => {
  const t = setup();
  await save(t, 'cheat3', 100);
  await save(t, 'cheat3', t.cap + 1);
  t.tick(STRIKE_WINDOW_MS + 60 * 1000);
  await save(t, 'cheat3', 100);
  await save(t, 'cheat3', t.cap + 1);
  const punish = t.events.filter((e) => e.kind === 'punish');
  assert.ok(punish.every((e) => e.action === 'reset'));
  assert.equal(t.db.docs.get('bans/cheat3'), undefined);
});

test('a balance that was already above the cap, and falls, is not punished', async () => {
  const t = setup();
  await save(t, 'legacy', t.cap + 500);
  await save(t, 'legacy', t.cap + 100);
  assert.equal(t.events.filter((e) => e.kind === 'punish').length, 0);
});

test('admin reset and unban write the expected documents', async () => {
  const t = setup();
  await save(t, 'u9', 300);
  await t.watch.ban('u9', 2, { reason: 'admin' });
  assert.ok(t.db.docs.get('bans/u9'));
  await t.watch.unban('u9');
  assert.equal(t.db.docs.get('bans/u9'), undefined);
  assert.equal(t.db.docs.get('users/u9').ban_until, null);
});

// Account watch rules: the wallet cap, the per-minute rate, and win streaks,
// plus the first-offence reset and second-offence ban. Uses an in-memory fake
// of the Firestore and Auth calls the watch makes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { AccountWatch } = require('../accounts');

function fakeDb() {
  const docs = new Map();
  const key = (c, id) => c + '/' + id;
  const db = {
    docs,
    collection(name) {
      return { doc(id) {
        const k = key(name, id);
        return {
          async get() { return { exists: docs.has(k), data: () => docs.get(k) }; },
          async set(data, opts) { docs.set(k, opts && opts.merge ? { ...(docs.get(k) || {}), ...data } : { ...data }); },
          async delete() { docs.delete(k); },
          _k: k,
        };
      } };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return { exists: docs.has(ref._k), data: () => docs.get(ref._k) }; },
        set(ref, data) { docs.set(ref._k, { ...(docs.get(ref._k) || {}), ...data }); },
      };
      return fn(tx);
    },
  };
  return db;
}

function setup(now = Date.now()) {
  let t = now;
  const db = fakeDb();
  const watch = new AccountWatch({
    db,
    auth: { getUser: async () => ({ displayName: 'Test Player', email: 'p@example.com' }) },
    balance: { capFromData: () => 20000 },
    now: () => t,
    log: { error() {} },
  });
  const events = [];
  watch.subscribe((e) => events.push(e));
  const tick = (ms) => { t += ms; };
  const save = async (uid, balance, gain) => {
    const data = { strubles_balance_v1: String(balance) };
    if (gain) data.strubles_last_gain_v1 = JSON.stringify(gain);
    await watch.onChange(uid, data);
  };
  return { watch, db, events, tick, save };
}

test('a balance above the wallet cap is flagged, and the first offence resets it to 100', async () => {
  const { save, events, db } = setup();
  await save('u1', 100);
  await save('u1', 1000000, { amount: 999900, page: '/minesweeper' });
  const punish = events.find((e) => e.kind === 'punish');
  assert.equal(punish.action, 'reset');
  assert.equal(punish.detected, 'over_cap');
  assert.equal(punish.page, '/minesweeper', 'the page is logged with the strike');
  assert.equal(db.docs.get('users/u1').strubles_balance_v1, '100');
});

test('gains that add up past the per-minute limit are flagged as a rate cheat', async () => {
  const { save, events, tick } = setup();
  await save('u2', 100);
  let bal = 100;
  for (let i = 0; i < 3; i++) { bal += 2000; tick(5000); await save('u2', bal, { amount: 2000, page: '/blackjack' }); }
  const punish = events.find((e) => e.kind === 'punish');
  assert.ok(punish, 'a strike was recorded');
  assert.equal(punish.detected, 'rate');
  assert.equal(punish.page, '/blackjack');
});

test('a normal run of small wins, spread out, is not flagged', async () => {
  const { save, events, tick } = setup();
  await save('u3', 100);
  let bal = 100;
  for (let i = 0; i < 12; i++) { bal += 100; tick(20000); await save('u3', bal, { amount: 100, page: '/blackjack' }); bal -= 60; tick(20000); await save('u3', bal); }
  assert.equal(events.filter((e) => e.kind === 'punish').length, 0);
});

test('twenty gains in a row with no loss between them is flagged as a win streak, with its page', async () => {
  const { save, events, tick } = setup();
  await save('u4', 100);
  let bal = 100;
  for (let i = 0; i < 20; i++) { bal += 100; tick(10000); await save('u4', bal, { amount: 100, page: '/horse-web-game' }); }
  const punish = events.find((e) => e.kind === 'punish');
  assert.ok(punish, 'the streak was flagged');
  assert.equal(punish.detected, 'win_streak');
  assert.equal(punish.page, '/horse-web-game');
});

test('a loss between wins restarts the streak', async () => {
  const { save, events, tick } = setup();
  await save('u5', 100);
  let bal = 100;
  for (let i = 0; i < 19; i++) { bal += 100; tick(10000); await save('u5', bal, { amount: 100, page: '/blackjack' }); }
  bal -= 50; tick(10000); await save('u5', bal);
  for (let i = 0; i < 19; i++) { bal += 100; tick(10000); await save('u5', bal, { amount: 100, page: '/blackjack' }); }
  assert.equal(events.filter((e) => e.kind === 'punish').length, 0);
});

test('a second offence within the window bans the account and records the page', async () => {
  const { save, events, db } = setup();
  await save('u6', 100);
  await save('u6', 1000000, { amount: 999900, page: '/lootbox' });
  await save('u6', 100);
  await save('u6', 1000000, { amount: 999900, page: '/lootbox' });
  const ban = events.find((e) => e.kind === 'punish' && e.action === 'ban');
  assert.ok(ban, 'the ban was recorded');
  assert.equal(ban.page, '/lootbox');
  assert.ok(db.docs.get('bans/u6'), 'a ban record exists, which the rules check');
  assert.ok(db.docs.get('users/u6').ban_until, 'the account shows its ban time');
});

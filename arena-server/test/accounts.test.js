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
      let orderField = null, limitN = Infinity;
      const wheres = [];
      const col = {
        where(field, op, val) { wheres.push([field, val]); return col; },
        async add(data) { const id = 'auto' + docs.size + '_' + Math.random().toString(36).slice(2); docs.set(key(name, id), { ...data }); return { id }; },
        orderBy(field) { orderField = field; return col; },
        limit(n) { limitN = n; return col; },
        async get() {
          let rows = [...docs.entries()].filter(([k]) => k.startsWith(name + '/')).map(([k, v]) => ({ id: k.slice(name.length + 1), v }));
          for (const [field, val] of wheres) rows = rows.filter((r) => r.v[field] === val);
          if (orderField) rows = rows.sort((a, b) => String(b.v[orderField]).localeCompare(String(a.v[orderField])));
          return { docs: rows.slice(0, limitN).map((r) => ({ id: r.id, data: () => r.v })) };
        },
        doc(id) {
        const k = key(name, id);
        return {
          async get() { return { exists: docs.has(k), data: () => docs.get(k) }; },
          async set(data, opts) { docs.set(k, opts && opts.merge ? { ...(docs.get(k) || {}), ...data } : { ...data }); },
          async delete() { docs.delete(k); },
          _k: k,
        };
        },
      };
      return col;
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

test('the per-minute rate is the net change, so wins that losses cancel out are not flagged', async () => {
  const { save, events, tick } = setup();
  await save('u8', 100);
  let bal = 100;
  for (const step of [3000, -2000, 3000]) { bal += step; tick(5000); await save('u8', bal, step > 0 ? { amount: step, page: '/blackjack' } : undefined); }
  assert.equal(events.filter((e) => e.kind === 'punish').length, 0, 'gross 6000 but net 4000 in a minute');
});

test('a real win after a reset is kept, not pulled back to 100', async () => {
  const { save, events, tick } = setup();
  await save('u7', 100);
  tick(5000);
  await save('u7', 8718, { amount: 8618, page: '/arena-blackjack' });   // flagged as a rate cheat: first offence
  await save('u7', 100);                                              // the server's reset, as the snapshot reports it
  tick(20000);
  await save('u7', 118, { amount: 18, page: '/horse-web-game' });     // a genuine win, a few seconds later
  assert.equal(events.filter((e) => e.kind === 'sync_restore').length, 0, 'nothing is pulled back');
  assert.equal(events.filter((e) => e.kind === 'punish' && e.action === 'ban').length, 0, 'no second offence');
});

test('an admin can set a balance by hand, even above the cap, without a strike', async () => {
  const { watch, events, db, save, tick } = setup();
  await save('u9', 100);
  tick(1000);
  await watch.setBalance('u9', 50000);
  await save('u9', 50000);
  assert.equal(events.filter((e) => e.kind === 'punish' && (e.action === 'reset' || e.action === 'ban')).length, 0, 'no strike for an admin change');
  assert.equal(db.docs.get('users/u9').strubles_balance_v1, '50000');
  assert.ok(events.some((e) => e.kind === 'punish' && e.action === 'set' && e.to === 50000), 'the change is in the feed');
});

test('an admin gift adds to the balance without a strike, and is in the feed', async () => {
  const { watch, events, db, save, tick } = setup();
  await db.collection('users').doc('u10').set({ strubles_balance_v1: '1200' }, { merge: true });
  tick(1000);
  await watch.gift('u10', 3000);
  assert.equal(db.docs.get('users/u10').strubles_balance_v1, '4200');
  await save('u10', 4200);
  assert.equal(events.filter((e) => e.kind === 'punish' && (e.action === 'reset' || e.action === 'ban')).length, 0, 'no strike for a gift');
  assert.ok(events.some((e) => e.kind === 'punish' && e.action === 'gift' && e.amount === 3000 && e.from === 1200 && e.to === 4200), 'the gift is in the feed');
});

test('a gift must be a whole number from 1 up', async () => {
  const { watch } = setup();
  await assert.rejects(watch.gift('u11', 0));
  await assert.rejects(watch.gift('u11', -5));
  await assert.rejects(watch.gift('u11', 2.5));
});

test('a save that leaves the balance as it was adds no feed row (the tycoon page saves about once a second)', async () => {
  const { save, events } = setup();
  await save('u1', 1515);
  for (let i = 0; i < 5; i++) await save('u1', 1515);
  assert.equal(events.filter((e) => e.kind === 'balance').length, 1, 'only the first sighting is logged');
});

test('unwarn clears the warning and the strike history, and leaves the ban alone', async () => {
  const { watch, db, save, tick } = setup();
  await save('u2', 100);
  await save('u2', 20001, null);               // over the cap: first offence, warned
  tick(10);
  await db.collection('users').doc('u2').set({ admin_warning: { id: 'w1', text: 'hi' } }, { merge: true });
  assert.equal((await watch.listPlayers()).find((r) => r.uid === 'u2').status, 'warned');
  await watch.unwarn('u2');
  const row = (await watch.listPlayers()).find((r) => r.uid === 'u2');
  assert.equal(row.status, 'ok');
  assert.equal(db.docs.has('cheat_strikes/u2'), false);
});

test('restore releases a ban and puts back the balance and bank level from before the ban', async () => {
  const { watch, db, save } = setup();
  await db.collection('users').doc('u3').set({ strubles_balance_v1: '5000', tycoon_bank_level_v1: '3' }, { merge: true });
  await save('u3', 5000);
  await watch.ban('u3', 24, { reason: 'admin' });
  assert.equal(db.docs.get('users/u3').strubles_balance_v1, '100', 'the ban reset the balance');
  await watch.restore('u3');
  assert.equal(db.docs.get('users/u3').strubles_balance_v1, '5000');
  assert.equal(db.docs.get('users/u3').tycoon_bank_level_v1, '3');
  assert.equal(db.docs.has('bans/u3'), false);
  assert.equal(db.docs.get('users/u3').ban_until, null);
});

test('a refund of money the player just paid is not flagged, even when it is over the per-minute limit', async () => {
  const { events, save } = setup();
  await save('u5', 12000);
  await save('u5', 2000);                                    // paid 10,000 for a case
  await save('u5', 12000, { amount: 10000, kind: 'refund' }); // duplicate refunded
  assert.equal(events.filter((e) => e.kind === 'punish').length, 0, 'no strike, no reset');
});

test('a refund bigger than what was paid is judged as a win, so it can still be flagged', async () => {
  const { db, events, save } = setup();
  await save('u6', 15000);
  await save('u6', 5000);                                    // paid 10,000
  await save('u6', 28000, { amount: 23000, kind: 'refund' }); // claims 23,000 back
  assert.ok(events.some((e) => e.kind === 'punish' && (e.reason === 'cheat_first_offence' || e.detected === 'rate')), 'flagged as a rate cheat');
});

test('a stake the server refunds (failed match) is matched to its save and not flagged', async () => {
  const BalanceManager = require('../balance');
  const { events, save } = setup();
  await save('u7', 12000);
  await save('u7', 2000);                                    // stake of 10,000 taken
  BalanceManager.credits.emit('refund', { uid: 'u7', amount: 10000 });
  await save('u7', 12000);                                   // server put the stake back
  assert.equal(events.filter((e) => e.kind === 'punish').length, 0);
});

test('an admin balance set is stamped as a reset, so open tabs pull it instead of pushing the old balance back', async () => {
  const { watch, db, events } = setup();
  await db.collection('users').doc('u8').set({ strubles_balance_v1: '5000' }, { merge: true });
  await watch.setBalance('u8', 9000);
  assert.equal(db.docs.get('users/u8').strubles_balance_v1, '9000');
  assert.ok(db.docs.get('users/u8').balance_reset_at, 'the reset stamp is set');
  assert.ok(events.some((e) => e.action === 'set' && e.to === 9000));
});

test('a daily prize the server rolled is not judged as a rate cheat, even on top of other gains', async () => {
  const { events, save } = setup();
  await save('u9', 1000);
  await save('u9', 1100, { amount: 100, kind: 'earn' });
  await save('u9', 6100, { amount: 5000, kind: 'grant' });   // the daily prize, on top of gains
  assert.equal(events.filter((e) => e.kind === 'punish').length, 0, 'no strike');
});

test('an admin gift sticks in the database and is not judged as a cheat, even above the cap', async () => {
  const { watch, save, events, db } = setup();
  await db.collection('users').doc('u9').set({ strubles_balance_v1: '24000' }, { merge: true });
  await save('u9', 24000);
  await watch.gift('u9', 1000);
  assert.equal(db.docs.get('users/u9').strubles_balance_v1, '25000', 'the gift is written');
  await save('u9', 25000);   // the watch sees the admin's own save
  assert.equal(events.filter((e) => e.kind === 'punish' && e.action !== 'gift').length, 0, 'the gift is not punished');
});

test('gift to everyone skips banned accounts, is refused over the total limit, and is logged once with its note', async () => {
  const { watch, events, db } = setup();
  await db.collection('users').doc('g1').set({ strubles_balance_v1: '100' }, { merge: true });
  await db.collection('users').doc('g2').set({ strubles_balance_v1: '200' }, { merge: true });
  await db.collection('users').doc('g3').set({ strubles_balance_v1: '300' }, { merge: true });
  await db.collection('bans').doc('g3').set({ until: new Date(Date.now() + 3600 * 1000) });
  const result = await watch.giftAll(500, 'Thanks for testing <b>');
  assert.equal(result.count, 2, 'the banned account is skipped');
  assert.equal(db.docs.get('users/g1').strubles_balance_v1, '600');
  assert.equal(db.docs.get('users/g2').strubles_balance_v1, '700');
  assert.equal(db.docs.get('users/g3').strubles_balance_v1, '300', 'the banned account is unchanged');
  const logged = events.filter((e) => e.action === 'gift_all');
  assert.equal(logged.length, 1, 'one feed event for the whole gift');
  assert.equal(logged[0].note, 'Thanks for testing b', 'the note is cleaned of HTML characters');
  assert.equal(logged[0].total, 1000);
});

test('gift to everyone is refused before anything changes when the total is over the limit', async () => {
  const { watch, db } = setup();
  const uids = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  for (const uid of uids) await db.collection('users').doc(uid).set({ strubles_balance_v1: '0' }, { merge: true });
  // 6 accounts at 1,000,000 each is 6,000,000, over the 5,000,000 total.
  await assert.rejects(() => watch.giftAll(1000000, 'too much'), /over the 5000000 limit/);
  for (const uid of uids) assert.equal(db.docs.get(`users/${uid}`).strubles_balance_v1, '0', 'nothing was changed');
});

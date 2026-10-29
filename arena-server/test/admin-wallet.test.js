// Admin controls against the server-side wallet: an admin's change and a player's
// wallet operation must agree on the balance, and the feed must say why it moved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { AccountWatch } = require('../accounts');
const { Wallet } = require('../wallet');
const BalanceManager = require('../balance');
const { FakeDb } = require('./fakes');

function fullDb() {
  const db = new FakeDb();
  const orig = db.collection.bind(db);
  db.collection = (name) => {
    const col = orig(name);
    if (name === 'users') col.get = async () => ({ docs: [...db.docs].filter(([k]) => k.startsWith('users/')).map(([k, v]) => ({ id: k.slice(6), data: () => v })) });
    return col;
  };
  return db;
}
function setup(t = Date.now()) {
  const db = fullDb();
  db.seed('p1', { strubles_balance_v1: '1000', displayName: 'Pat', email: 'pat@example.com' });
  const watch = new AccountWatch({ db, auth: { getUser: async () => ({ displayName: 'Pat' }) }, balance: new BalanceManager(db), admins: { uids: [], emails: [] }, now: () => t, log: { error() {} } });
  const wallet = new Wallet(db, new BalanceManager(db), { now: () => t, rand: () => 0.1 });
  return { db, watch, wallet, t };
}

test('an admin set is what the player\'s next wallet operation starts from', async () => {
  const { db, watch, wallet } = setup();
  await watch.setBalance('p1', 5000);
  const [r] = await wallet.applyBatch('p1', [{ id: 'after-set', kind: 'spend', amount: 200 }]);
  assert.equal(r.ok, true);
  assert.equal(r.balance, 4800, 'the wallet starts from the admin value, not the old one');
  assert.equal(db.docs.get('users/p1').strubles_balance_v1, '4800');
});

test('a ban stops the wallet; releasing it restores the wallet', async () => {
  const { db, watch, wallet } = setup();
  await watch.ban('p1', 24, { reason: 'admin' });
  const [banned] = await wallet.applyBatch('p1', [{ id: 'b1', kind: 'win', amount: 10 }]);
  assert.equal(banned.error, 'banned');
  await watch.unban('p1');
  const [ok] = await wallet.applyBatch('p1', [{ id: 'b2', kind: 'win', amount: 10 }]);
  assert.equal(ok.ok, true);
});

test('the feed says why a balance moved: the wallet operation, its amount, and its page', async () => {
  const { db, watch, wallet, t } = setup();
  await wallet.applyBatch('p1', [{ id: 'f1', kind: 'win', amount: 150, page: '/blackjack' }]);
  const data = db.docs.get('users/p1');
  await watch.onChange('p1', data);
  const ev = watch.feed.filter((e) => e.kind === 'balance').pop();
  assert.equal(ev.balance, 1150);
  assert.equal(ev.op.kind, 'win');
  assert.equal(ev.op.amount, 150);
  assert.equal(ev.op.page, '/blackjack');
  assert.ok(t);
});

test('a wallet operation older than the feed\'s window is not attributed to a later change', async () => {
  const { db, watch, t } = setup(1000);
  db.docs.set('users/p1', { strubles_balance_v1: '900', wallet_last_op: JSON.stringify({ kind: 'win', amount: 50, at: 1000 }) });
  let now = t + 60000;
  watch.now = () => now;
  await watch.onChange('p1', db.docs.get('users/p1'));
  const ev = watch.feed.filter((e) => e.kind === 'balance').pop();
  assert.equal(ev.op, null);
});

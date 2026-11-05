// The public Strubles leaderboard: sorted by number, cached, with banned and admin accounts left off.
const test = require('node:test');
const assert = require('node:assert/strict');
const { StrublesBoard } = require('../strubles-board');
const { createServer } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

const T0 = Date.UTC(2026, 9, 28, 12);

function setup(users, opts = {}) {
  let t = T0;
  const db = new FakeDb();
  for (const [id, data] of Object.entries(users)) db.docs.set('users/' + id, data);
  const board = new StrublesBoard(db, { now: () => t, ...opts });
  return { db, board, advance: (ms) => { t += ms; } };
}

test('balances are sorted as numbers, not as text', async () => {
  const { board } = setup({
    a: { displayName: 'Nine', strubles_balance_v1: '900' },
    b: { displayName: 'Thousand', strubles_balance_v1: '1000' },
    c: { displayName: 'Twelve', strubles_balance_v1: '12' },
  });
  const { rows } = await board.top();
  assert.deepEqual(rows.map((r) => r.name), ['Thousand', 'Nine', 'Twelve']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
  assert.equal(rows[0].balance, 1000);
});

test('only the top 50 are listed', async () => {
  const users = {};
  for (let i = 1; i <= 60; i++) users['u' + i] = { displayName: 'P' + i, strubles_balance_v1: String(i * 10) };
  const { rows } = await setup(users).board.top();
  assert.equal(rows.length, 50);
  assert.equal(rows[0].balance, 600);
  assert.equal(rows[49].balance, 110);
});

test('banned accounts, admins and empty balances are left off', async () => {
  const { board } = setup({
    ok: { displayName: 'Ok', strubles_balance_v1: '500' },
    banned: { displayName: 'Banned', strubles_balance_v1: '9999', ban_until: new Date(T0 + 3600 * 1000) },
    expired: { displayName: 'Expired', strubles_balance_v1: '400', ban_until: new Date(T0 - 3600 * 1000) },
    boss: { displayName: 'Boss', strubles_balance_v1: '8888', email: 'Boss@Example.com' },
    zero: { displayName: 'Zero', strubles_balance_v1: '0' },
  }, { isAdminDoc: (uid, data) => String(data.email || '').toLowerCase() === 'boss@example.com' });
  const { rows } = await board.top();
  assert.deepEqual(rows.map((r) => r.name), ['Ok', 'Expired']);
});

test('names are cleaned: a listed word or a missing name shows as Player, and markup is stripped', async () => {
  const { board } = setup({
    a: { displayName: 'fuck lord', strubles_balance_v1: '500' },
    b: { strubles_balance_v1: '400' },
    c: { displayName: '<b>Sam</b>', strubles_balance_v1: '300' },
    d: { displayName: 'x'.repeat(60), strubles_balance_v1: '200' },
  });
  const { rows } = await board.top();
  assert.equal(rows[0].name, 'Player');
  assert.equal(rows[1].name, 'Player');
  assert.equal(rows[2].name, 'bSam/b', 'the angle brackets are gone, so it can not render as markup');
  assert.equal(rows[3].name.length, 24);
});

test('the result is kept for the cache time, then rebuilt', async () => {
  const { db, board, advance } = setup({ a: { displayName: 'A', strubles_balance_v1: '100' } });
  assert.equal((await board.top()).rows.length, 1);
  db.docs.set('users/b', { displayName: 'B', strubles_balance_v1: '200' });
  advance(60 * 1000);
  assert.equal((await board.top()).rows.length, 1, 'still the cached board');
  advance(5 * 60 * 1000);
  const fresh = await board.top();
  assert.equal(fresh.rows.length, 2);
  assert.equal(fresh.rows[0].name, 'B');
});

test('GET /leaderboard/strubles is public, GET only, and leaves admins off', async () => {
  const db = new FakeDb();
  db.docs.set('users/a', { displayName: 'Ann', strubles_balance_v1: '700' });
  db.docs.set('users/b', { displayName: 'Ben', strubles_balance_v1: '1500' });
  db.docs.set('users/root', { displayName: 'Root', strubles_balance_v1: '99999', email: 'root@example.com' });
  const server = createServer({ port: 0, host: '127.0.0.1', db, auth: FakeAuth, quiet: true, admins: { uids: [], emails: ['root@example.com'] }, rate: { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 } });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetch(base + '/leaderboard/strubles');
    assert.equal(r.status, 200, 'no sign-in needed');
    const body = await r.json();
    assert.deepEqual(body.rows.map((x) => x.name), ['Ben', 'Ann']);
    assert.equal(typeof body.updated, 'number');
    assert.equal((await fetch(base + '/leaderboard/strubles', { method: 'POST' })).status, 405);
  } finally { await server.close(); }
});

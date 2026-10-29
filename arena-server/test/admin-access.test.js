// Admin access: a signed-in player must be refused every admin message and never
// hear an account event; an admin gets the data. Runs the real server over a socket.
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createServer } = require('../core');
const { AccountWatch } = require('../accounts');
const BalanceManager = require('../balance');
const { FakeDb, FakeAuth } = require('./fakes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(url, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const log = [];
    ws.on('message', (d) => log.push(JSON.parse(d)));
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'auth', token })); setTimeout(() => resolve({ ws, log }), 150); });
  });
}

// The fake database has no full collection read, so give it one for the users collection.
function fullDb() {
  const db = new FakeDb();
  db.seed('player1', { strubles_balance_v1: '1234', displayName: 'Victim', email: 'victim@example.com' });
  const orig = db.collection.bind(db);
  db.collection = (name) => {
    const col = orig(name);
    if (name === 'users') col.get = async () => ({ docs: [...db.docs].filter(([k]) => k.startsWith('users/')).map(([k, v]) => ({ id: k.slice(6), data: () => v })) });
    return col;
  };
  return db;
}

test('a signed-in player is refused every admin message; an admin gets them', async () => {
  const db = fullDb();
  const accounts = new AccountWatch({ db, auth: FakeAuth, balance: new BalanceManager(db), admins: { uids: ['admin1'], emails: [] }, log: { error() {} } });
  const server = createServer({ port: 0, host: '127.0.0.1', db, auth: FakeAuth, quiet: true, admins: { uids: ['admin1'], emails: [] }, accounts, rate: { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 } });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  const url = `ws://127.0.0.1:${server.address().port}`;
  const player = await client(url, 'tok:mallory');
  const admin = await client(url, 'tok:admin1');
  const probes = [
    { type: 'account_feed' }, { type: 'account_list' }, { type: 'suggestions_list' },
    { type: 'account_action', action: 'set_balance', uid: 'player1', amount: 999999 },
    { type: 'account_action', action: 'unwarn', uid: 'player1' },
    { type: 'suggestion_delete', id: 'abc' },
  ];
  try {
    for (const p of probes) {
      player.log.length = 0; admin.log.length = 0;
      player.ws.send(JSON.stringify(p)); admin.ws.send(JSON.stringify(p));
      await sleep(120);
      assert.ok(player.log.length && player.log.every((m) => m.type === 'error' && m.code === 'forbidden'), `${p.type}: player must get only 'forbidden'`);
      assert.equal(player.log.some((m) => m.type !== 'error'), false, `${p.type}: no data reaches a player`);
      assert.ok(admin.log.some((m) => m.type !== 'error' || m.code !== 'forbidden'), `${p.type}: admin gets a real answer`);
    }
    // A balance change while both are connected: only the admin hears about it.
    player.log.length = 0; admin.log.length = 0;
    await accounts.onChange('player1', { strubles_balance_v1: '1500' });
    await sleep(80);
    assert.equal(player.log.filter((m) => m.type === 'account_event').length, 0, 'players never get account events');
    assert.equal(admin.log.filter((m) => m.type === 'account_event').length, 1, 'admins get account events');
  } finally {
    player.ws.close(); admin.ws.close();
    await server.close();
  }
});

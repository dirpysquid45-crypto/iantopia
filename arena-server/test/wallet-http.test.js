// The wallet's HTTP routes, on a real server: signed-in accounts only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

async function start() {
  const db = new FakeDb();
  db.seed('u1', { strubles_balance_v1: '500' });
  const server = createServer({ port: 0, host: '127.0.0.1', db, auth: FakeAuth, quiet: true, admins: { uids: [], emails: [] }, rate: { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 } });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, server, base };
}
const auth = (uid) => ({ Authorization: 'Bearer tok:' + uid, 'Content-Type': 'application/json' });

test('a signed-in account reads its own balance and cap', async () => {
  const { server, base } = await start();
  try {
    const r = await fetch(base + '/wallet', { headers: auth('u1') });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.balance, 500);
    assert.equal(typeof body.cap, 'number');
    assert.equal(body.starterClaimed, false);
  } finally { await server.close(); }
});

test('a batch of ops is applied in order and the new balance comes back', async () => {
  const { server, base, db } = await start();
  try {
    const r = await fetch(base + '/wallet/ops', { method: 'POST', headers: auth('u1'), body: JSON.stringify({ ops: [
      { id: 'a1', kind: 'win', amount: 100, page: '/x' },
      { id: 'a2', kind: 'spend', amount: 50 },
    ] }) });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.results.length, 2);
    assert.equal(body.balance, 550);
    assert.equal(db.docs.get('users/u1').strubles_balance_v1, '550');
  } finally { await server.close(); }
});

test('a guest, or a request with no token, has no wallet', async () => {
  const { server, base } = await start();
  try {
    const r = await fetch(base + '/wallet', {});
    assert.equal(r.status, 401);
    const g = await fetch(base + '/wallet/ops', { method: 'POST', body: JSON.stringify({ ops: [{ id: 'g', kind: 'win', amount: 1 }] }) });
    assert.equal(g.status, 401);
  } finally { await server.close(); }
});

test('malformed and oversized requests are refused', async () => {
  const { server, base } = await start();
  try {
    const bad = await fetch(base + '/wallet/ops', { method: 'POST', headers: auth('u1'), body: 'not json' });
    assert.equal(bad.status, 400);
    const none = await fetch(base + '/wallet/ops', { method: 'POST', headers: auth('u1'), body: JSON.stringify({ ops: [] }) });
    assert.equal(none.status, 400);
    const many = await fetch(base + '/wallet/ops', { method: 'POST', headers: auth('u1'), body: JSON.stringify({ ops: Array.from({ length: 51 }, (_, i) => ({ id: 'm' + i, kind: 'win', amount: 1 })) }) });
    assert.equal(many.status, 400);
    const huge = await fetch(base + '/wallet/ops', { method: 'POST', headers: auth('u1'), body: 'x'.repeat(40000) }).catch(() => null);
    assert.ok(!huge || huge.status === 400 || huge.status === 500, 'a body over the limit is not accepted');
    const wrong = await fetch(base + '/wallet', { method: 'POST', headers: auth('u1') });
    assert.equal(wrong.status, 405);
    const other = await fetch(base + '/nope', { headers: auth('u1') });
    assert.equal(other.status, 404);
  } finally { await server.close(); }
});

test('the game socket still connects on the same port', async () => {
  const { server } = await start();
  try {
    const WebSocket = require('ws');
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
    ws.close();
  } finally { await server.close(); }
});

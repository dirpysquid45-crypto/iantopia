const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { startServer, connect, asUser, asGuest, pair, sleep, FLEET_A, FLEET_B, playBattleship } = require('./helpers');
const { clientIp, isPrivateAddress, cleanName } = require('../core');

const closed = (c, ms = 1500) => new Promise((res, rej) => {
  if (c.closed) return res(c.closed);
  const t = setTimeout(() => rej(new Error('socket stayed open')), ms);
  c.ws.on('close', (code, reason) => { clearTimeout(t); res({ code, reason: String(reason) }); });
});

test('the first message must be an auth message', async () => {
  const t = await startServer();
  const c = await connect(t.url);
  c.send({ type: 'join_queue', bet: 0, gameType: 'battleship' });
  assert.equal((await closed(c)).code, 1008);
});

test('garbage, non-objects and bad tokens are all closed without a crash', async () => {
  const t = await startServer();
  for (const payload of ['not json', '"a string"', '42', 'null', '[]', '{}', JSON.stringify({ type: 'auth' }), JSON.stringify({ type: 'auth', token: 'forged' })]) {
    const c = await connect(t.url);
    c.raw(payload);
    assert.equal((await closed(c)).code, 1008, payload);
  }
  // and the server is still perfectly healthy afterwards
  const ok = await asGuest(t.url, 'Still fine');
  assert.equal(ok.last('auth_ok').guest, true);
});

test('a connection that never authenticates is dropped (it cannot hold a slot forever)', async () => {
  const t = await startServer({ authTimeoutMs: 200 });
  const c = await connect(t.url);
  const r = await closed(c, 1500);
  assert.equal(r.code, 1008);
  assert.match(r.reason, /timed out/i);
});

test('an oversized message is refused before it is parsed', async () => {
  const t = await startServer();
  const c = await asGuest(t.url, 'Big');
  c.raw(JSON.stringify({ type: 'join_queue', pad: 'x'.repeat(20000) }));
  assert.equal((await closed(c)).code, 1009);
});

test('a message flood is rate limited and the abuser gets errors, not service', async () => {
  const t = await startServer({ rate: { maxMessagesPerSec: 10, maxConnectionsPerIP: 100 } });
  const c = await asGuest(t.url, 'Flood');
  for (let i = 0; i < 60; i++) c.send({ type: 'ping' });
  await sleep(150);
  assert.ok(c.all('error').filter((e) => e.code === 'rate_limited').length >= 40, 'most of the flood is rejected');
  assert.ok(c.all('pong').length <= 12, 'only the allowed few were served');
  // a well-behaved neighbour is unaffected
  const other = await asGuest(t.url, 'Calm');
  other.send({ type: 'ping' });
  await other.waitFor('pong');
});

test('messages sent right behind auth are processed in order (no "not authenticated" race)', async () => {
  const t = await startServer();
  const c = await connect(t.url);
  c.send({ type: 'auth_guest', name: 'Quick' });
  c.send({ type: 'join_queue', bet: 0, gameType: 'battleship' });     // arrives before auth finishes
  c.send({ type: 'ping' });
  await c.waitFor('status');
  await c.waitFor('pong');
  assert.equal(c.closed, null, 'and the connection was kept');
});

// ---- per-IP connection limit, now keyed on the REAL client behind the proxy ----
test('per-IP limit applies per real client when the proxy forwards the address', async () => {
  const t = await startServer({ rate: { maxMessagesPerSec: 1000, maxConnectionsPerIP: 2 } });
  // Direct peer is loopback (i.e. "our proxy"), so X-Real-IP is believed.
  const fromA = [];
  for (let i = 0; i < 2; i++) fromA.push(await connect(t.url, { 'X-Real-IP': '203.0.113.7' }));
  const third = await connect(t.url, { 'X-Real-IP': '203.0.113.7' });
  assert.equal((await closed(third)).code, 1008, 'the third connection from one client is refused');
  // A DIFFERENT client behind the same proxy is not penalised for it.
  const other = await connect(t.url, { 'X-Real-IP': '198.51.100.9' });
  other.send({ type: 'auth_guest', name: 'Other' });
  await other.waitFor('auth_ok');
});

test('the limit is released when a connection closes', async () => {
  const t = await startServer({ rate: { maxMessagesPerSec: 1000, maxConnectionsPerIP: 1 } });
  const first = await connect(t.url, { 'X-Real-IP': '203.0.113.50' });
  first.close(); await closed(first);
  await sleep(50);
  const second = await connect(t.url, { 'X-Real-IP': '203.0.113.50' });
  second.send({ type: 'auth_guest' });
  await second.waitFor('auth_ok');
});

test('clientIp: forwarding headers are trusted only from a private (proxy) peer', () => {
  const req = (remote, headers) => ({ socket: { remoteAddress: remote }, headers });
  assert.equal(clientIp(req('172.18.0.2', { 'x-real-ip': '1.2.3.4' })), '1.2.3.4');
  assert.equal(clientIp(req('172.18.0.2', { 'x-forwarded-for': '5.6.7.8, 172.18.0.1' })), '5.6.7.8');
  assert.equal(clientIp(req('::ffff:127.0.0.1', { 'x-real-ip': '1.2.3.4' })), '1.2.3.4');
  assert.equal(clientIp(req('8.8.8.8', { 'x-real-ip': '1.2.3.4' })), '8.8.8.8', 'a PUBLIC peer cannot spoof its address');
  assert.equal(clientIp(req('172.18.0.2', {})), '172.18.0.2', 'no header: fall back to the peer, as before');
  for (const a of ['127.0.0.1', '::1', '10.0.0.5', '192.168.1.9', '172.16.0.1', '172.31.255.1', '::ffff:10.1.1.1']) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '203.0.113.7']) assert.equal(isPrivateAddress(a), false, a);
});

test('display names are sanitised', () => {
  assert.equal(cleanName('  Ann  ', 'X'), 'Ann');
  assert.equal(cleanName('<script>alert(1)</script>', 'X'), 'scriptalert(1)/scrip', 'tags stripped, then cut to 20');
  assert.equal(cleanName('<b>Hi</b>', 'X'), 'bHi/b');
  assert.equal(cleanName('a'.repeat(80), 'X').length, 20);
  assert.equal(cleanName('', 'Fallback'), 'Fallback');
  assert.equal(cleanName(null, 'Fallback'), 'Fallback');
  assert.equal(cleanName('\u0000\u0007bell', 'X'), 'bell');
});

test('guest ids: a bad/missing id is replaced by a random one (never "guest_undefined")', async () => {
  const t = await startServer();
  const seen = new Set();
  for (const gid of [undefined, '', 'short', '../../etc/passwd', 'x'.repeat(100), 12345]) {
    const c = await connect(t.url);
    c.send({ type: 'auth_guest', guestId: gid });
    await c.waitFor('auth_ok');
    const id = [...t.manager.connections.values()].map((x) => x.userId).pop();
    assert.match(id, /^guest_[a-z0-9]{12,}$/);
    seen.add(id);
  }
  assert.equal(seen.size, 6, 'each bad id got its own fresh identity');
});

test('a user name is shown to the opponent, not an email or uid', async () => {
  const t = await startServer();
  t.db.seed('uid-123', { strubles_balance_v1: '0' });
  const a = await asUser(t.url, 'uid-123', 'Alice Smith');
  const b = await asGuest(t.url, 'Bob');
  await pair(a, b, 'battleship', 0);
  assert.equal(b.last('game_start').opponentName, 'Alice Smith');
  assert.equal(JSON.stringify(b.log).includes('uid-123'), false, 'user ids never leave the server');
});

// ---- heartbeat ----
test('a connection that stops answering pings is terminated (it cannot hold a table)', async () => {
  const t = await startServer({ heartbeatMs: 80 });
  const c = await connect(t.url, undefined, { autoPong: false });
  c.send({ type: 'auth_guest', name: 'Zombie' });
  await c.waitFor('auth_ok');
  const r = await closed(c, 2000);
  assert.ok(r.code === 1006 || r.code === 1005 || r.code === 1000, 'terminated by the server');
  await sleep(60);
  assert.equal(t.manager.connections.size, 0, 'and removed from the server');
});

test('a connection that DOES answer pings stays alive', async () => {
  // Generous interval: the suites run in parallel, and a pong delayed past a very
  // short heartbeat would (correctly) look like a dead connection.
  const t = await startServer({ heartbeatMs: 250 });
  const c = await asGuest(t.url, 'Alive');
  await sleep(1000);
  assert.equal(c.closed, null);
});

test('closing a socket mid-queue removes the lobby and tells everyone', async () => {
  const t = await startServer();
  const a = await asGuest(t.url, 'A'), watcher = await asGuest(t.url, 'W');
  a.send({ type: 'join_queue', bet: 0, gameType: 'battleship' });
  await watcher.waitFor((m) => m.type === 'lobby_update' && m.lobbies.length === 1);
  watcher.clear();   // the connect-time snapshot was an empty list: don't let it satisfy the wait below
  a.kill();
  await watcher.waitFor((m) => m.type === 'lobby_update' && m.lobbies.length === 0);
  assert.equal(t.manager.queue.length, 0);
});

test('shutdown is clean: no timers left running to keep the process alive', async () => {
  const t = await startServer();
  const a = await asGuest(t.url, 'A'), b = await asGuest(t.url, 'B');
  await pair(a, b, 'battleship', 0);
  await t.close();
  assert.equal(t.manager.tables.size, 0);
});

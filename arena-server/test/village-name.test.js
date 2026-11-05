// Naming a village goes through the server, so the word filter always runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { VillageNames, NAME_MAX } = require('../village-name');
const { createServer } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

test('a clean name is stored on the player as village_name, trimmed and cut to 24', async () => {
  const db = new FakeDb();
  const names = new VillageNames(db);
  const r = await names.setName({ uid: 'p1' }, { name: '   Sunny Hollow   ' });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Sunny Hollow');
  assert.equal(db.docs.get('users/p1').village_name, 'Sunny Hollow');
  const long = await names.setName({ uid: 'p1' }, { name: 'a'.repeat(40) });
  assert.equal(long.body.name.length, NAME_MAX);
});

test('a name with a listed word is refused and nothing is stored', async () => {
  const db = new FakeDb();
  const names = new VillageNames(db);
  const r = await names.setName({ uid: 'p1' }, { name: 'Shitty Town' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'blocked_text');
  assert.equal(db.docs.get('users/p1'), undefined);
});

test('a name that is empty, or not text, is refused', async () => {
  const names = new VillageNames(new FakeDb());
  assert.equal((await names.setName({ uid: 'p1' }, { name: '   ' })).body.error, 'empty');
  assert.equal((await names.setName({ uid: 'p1' }, { name: '<>' })).body.error, 'empty');
  assert.equal((await names.setName({ uid: 'p1' }, { name: 12 })).body.error, 'bad_request');
  assert.equal((await names.setName({ uid: 'p1' }, {})).body.error, 'bad_request');
});

test('a blocked word hidden with punctuation or leetspeak is still refused', async () => {
  const names = new VillageNames(new FakeDb());
  assert.equal((await names.setName({ uid: 'p1' }, { name: 'Sh!t Hill' })).body.error, 'blocked_text');
  assert.equal((await names.setName({ uid: 'p1' }, { name: 'Class Town' })).status, 200, 'class is not flagged');
});

test('the name route needs a verified sign-in, a POST, and a text name', async () => {
  const db = new FakeDb();
  const server = createServer({ port: 0, host: '127.0.0.1', db, auth: FakeAuth, quiet: true, admins: { uids: [], emails: [] }, rate: { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 } });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const anon = await fetch(base + '/village/name', { method: 'POST', body: JSON.stringify({ name: 'Hill' }) });
    assert.equal(anon.status, 401);
    const get = await fetch(base + '/village/name', { headers: { Authorization: 'Bearer tok:p1' } });
    assert.equal(get.status, 405);
    const blocked = await fetch(base + '/village/name', { method: 'POST', headers: { Authorization: 'Bearer tok:p1' }, body: JSON.stringify({ name: 'fuck farm' }) });
    assert.equal(blocked.status, 400);
    assert.equal((await blocked.json()).error, 'blocked_text');
    const ok = await fetch(base + '/village/name', { method: 'POST', headers: { Authorization: 'Bearer tok:p1' }, body: JSON.stringify({ name: 'Maple Glen' }) });
    assert.equal(ok.status, 200);
    assert.equal(db.docs.get('users/p1').village_name, 'Maple Glen');
  } finally { await server.close(); }
});

// The site chat: sending goes through the server (word filter, rate limit, bans, replies).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chat, COLLECTION, MIN_GAP_MS, PER_MINUTE } = require('../chat');
const { createServer } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

const T0 = Date.UTC(2026, 10, 1, 12);
function setup() {
  let t = T0;
  const db = new FakeDb();
  const chat = new Chat(db, { now: () => t });
  const stored = () => [...db.docs.entries()].filter(([k]) => k.startsWith(COLLECTION + '/')).map(([k, v]) => ({ id: k.slice(COLLECTION.length + 1), ...v }));
  return { db, chat, stored, advance: (ms) => { t += ms; } };
}
const SAM = { uid: 'u1', name: 'Sam' };

test('a clean message is stored with the sender\'s name from the sign-in, and no markup', async () => {
  const { chat, stored } = setup();
  const r = await chat.send(SAM, { text: '  hello   <b>there</b> \n friends ' });
  assert.equal(r.status, 200);
  const [m] = stored();
  assert.equal(m.id, r.body.id);
  assert.equal(m.uid, 'u1');
  assert.equal(m.name, 'Sam');
  assert.equal(m.text, 'hello b there /b friends', 'angle brackets and extra spaces are gone');
  assert.equal(m.replyTo, null);
});

test('a message with a listed word is refused and nothing is stored', async () => {
  const { chat, stored } = setup();
  const r = await chat.send(SAM, { text: 'you are a fuck' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'blocked_text');
  assert.equal(stored().length, 0);
});

test('an empty message, or one over 200 characters, is refused', async () => {
  const { chat, stored } = setup();
  assert.equal((await chat.send(SAM, { text: '   ' })).body.error, 'bad_request');
  assert.equal((await chat.send(SAM, { text: 'x'.repeat(201) })).body.error, 'bad_request');
  assert.equal((await chat.send(SAM, { text: 12 })).body.error, 'bad_request');
  assert.equal((await chat.send(SAM, {})).body.error, 'bad_request');
  assert.equal(stored().length, 0);
  assert.equal((await chat.send(SAM, { text: 'x'.repeat(200) })).status, 200, '200 is allowed');
});

test('a second message too soon is refused, and the minute limit holds', async () => {
  const { chat, advance } = setup();
  assert.equal((await chat.send(SAM, { text: 'one' })).status, 200);
  const soon = await chat.send(SAM, { text: 'two' });
  assert.equal(soon.status, 429);
  assert.equal(soon.body.error, 'slow_down');
  for (let i = 1; i < PER_MINUTE; i++) { advance(MIN_GAP_MS + 10); assert.equal((await chat.send(SAM, { text: 'm' + i })).status, 200, 'message ' + (i + 1)); }
  advance(MIN_GAP_MS + 10);
  const over = await chat.send(SAM, { text: 'too many' });
  assert.equal(over.status, 429);
  assert.equal(over.body.error, 'limit');
  advance(60000);
  assert.equal((await chat.send(SAM, { text: 'a minute later' })).status, 200);
});

test('the limits are per player', async () => {
  const { chat } = setup();
  assert.equal((await chat.send(SAM, { text: 'hi' })).status, 200);
  assert.equal((await chat.send({ uid: 'u2', name: 'Ben' }, { text: 'hi' })).status, 200);
});

test('a banned player can not chat', async () => {
  const { db, chat, stored } = setup();
  db.docs.set('bans/u1', { until: new Date(T0 + 3600 * 1000) });
  const r = await chat.send(SAM, { text: 'let me in' });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'banned');
  assert.equal(stored().length, 0);
});

test('a name with a listed word, or no name, shows as Player', async () => {
  const { chat, stored } = setup();
  await chat.send({ uid: 'a', name: 'fuck lord' }, { text: 'hi' });
  await chat.send({ uid: 'b' }, { text: 'hi' });
  assert.deepEqual(stored().map((m) => m.name), ['Player', 'Player']);
});

test('a reply quotes the stored message, not what the browser says, and is cut to 80 characters', async () => {
  const { chat, stored, advance } = setup();
  const first = await chat.send({ uid: 'u2', name: 'Ben' }, { text: 'y'.repeat(120) });
  advance(MIN_GAP_MS + 10);
  const r = await chat.send(SAM, { text: 'agreed', replyTo: first.body.id, quote: 'Ben said something else' });
  assert.equal(r.status, 200);
  const reply = stored().find((m) => m.id === r.body.id);
  assert.equal(reply.replyTo.id, first.body.id);
  assert.equal(reply.replyTo.name, 'Ben');
  assert.equal(reply.replyTo.text, 'y'.repeat(80));
});

test('a reply to a message that does not exist, or a bad id, is refused', async () => {
  const { chat, stored, advance } = setup();
  const missing = await chat.send(SAM, { text: 'hi', replyTo: 'nosuchmessage' });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'bad_reply');
  advance(MIN_GAP_MS + 10);
  assert.equal((await chat.send(SAM, { text: 'hi', replyTo: '../users/u1' })).body.error, 'bad_reply');
  advance(MIN_GAP_MS + 10);
  assert.equal((await chat.send(SAM, { text: 'hi', replyTo: 12 })).body.error, 'bad_reply');
  assert.equal(stored().length, 0, 'a refused reply stores nothing');
});

test('old messages are cleared, at most once every ten minutes', async () => {
  let t = T0;
  const deleted = [];
  let queries = 0;
  const stub = {
    collection: () => ({
      where: () => ({ limit: () => ({ get: async () => { queries++; return { docs: [{ id: 'old1' }, { id: 'old2' }] }; } }) }),
      doc: (id) => ({ delete: async () => { deleted.push(id); } }),
    }),
  };
  const chat = new Chat(stub, { now: () => t });
  await chat.prune(t);
  assert.deepEqual(deleted, ['old1', 'old2']);
  await chat.prune(t + 60 * 1000);
  assert.equal(queries, 1, 'not again within ten minutes');
  await chat.prune(t + 11 * 60 * 1000);
  assert.equal(queries, 2);
});

test('POST /chat/send needs a sign-in, a POST, and runs the filter', async () => {
  const db = new FakeDb();
  const server = createServer({ port: 0, host: '127.0.0.1', db, auth: FakeAuth, quiet: true, admins: { uids: [], emails: [] }, rate: { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 } });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (token, body) => fetch(base + '/chat/send', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) });
  try {
    assert.equal((await post(null, { text: 'hi' })).status, 401);
    assert.equal((await fetch(base + '/chat/send', { headers: { Authorization: 'Bearer tok:u1:Sam' } })).status, 405);
    const blocked = await post('tok:u1:Sam', { text: 'what the fuck' });
    assert.equal(blocked.status, 400);
    assert.equal((await blocked.json()).error, 'blocked_text');
    const ok = await post('tok:u1:Sam', { text: 'hello chat' });
    assert.equal(ok.status, 200);
    const [m] = [...db.docs.entries()].filter(([k]) => k.startsWith(COLLECTION + '/')).map(([, v]) => v);
    assert.equal(m.name, 'Sam');
    assert.equal(m.text, 'hello chat');
  } finally { await server.close(); }
});

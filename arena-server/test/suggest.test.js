const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, asUser, asGuest } = require('./helpers');

test('a signed-in player can send a suggestion; it is stored with their uid', async () => {
  const t = await startServer();
  const a = await asUser(t.url, 'alice', 'Alice');
  a.send({ type: 'suggest', text: '  add chess  ', page: '/' });
  const r = await a.waitFor('suggest_result');
  assert.equal(r.ok, true);
  const saved = [...t.db.docs.entries()].find(([k]) => k.startsWith('suggestions/'));
  assert.equal(saved[1].text, 'add chess');
  assert.equal(saved[1].uid, 'alice');
});

test('guests, empty text and spam are refused', async () => {
  const t = await startServer();
  const g = await asGuest(t.url, 'Gus');
  g.send({ type: 'suggest', text: 'hi' });
  assert.equal((await g.waitFor('suggest_result')).ok, false);
  const a = await asUser(t.url, 'alice');
  a.send({ type: 'suggest', text: '   ' });
  assert.equal((await a.waitFor('suggest_result')).ok, false);
  a.clear();
  a.send({ type: 'suggest', text: 'one' });
  assert.equal((await a.waitFor('suggest_result')).ok, true);
  a.clear();
  a.send({ type: 'suggest', text: 'two' });
  assert.equal((await a.waitFor('suggest_result')).ok, false);
  assert.equal([...t.db.docs.keys()].filter((k) => k.startsWith('suggestions/')).length, 1);
});

test('only an admin can read the inbox, newest first', async () => {
  const { startServer: start } = require('./helpers');
  const t = await start();
  t.server.close; // (server created with default env: no admins)
  const a = await asUser(t.url, 'alice', 'Alice');
  a.send({ type: 'suggest', text: 'first' }); await a.waitFor('suggest_result');
  a.send({ type: 'suggestions_list' });
  assert.equal((await a.waitFor('error')).code, 'forbidden');
  await t.close();

  const t2 = await start({ admins: { uids: ['boss'], emails: [] } });
  const x = await asUser(t2.url, 'x', 'X');
  x.send({ type: 'suggest', text: 'older' }); await x.waitFor('suggest_result');
  await new Promise((r) => setTimeout(r, 20));
  const y = await asUser(t2.url, 'y', 'Y');
  y.send({ type: 'suggest', text: 'newer' }); await y.waitFor('suggest_result');
  const boss = await asUser(t2.url, 'boss', 'Boss');
  boss.send({ type: 'suggestions_list' });
  const res = await boss.waitFor('suggestions');
  assert.deepEqual(res.rows.map((r) => r.text), ['newer', 'older']);
  assert.equal(res.rows[0].displayName, 'Y');
  y.send({ type: 'suggestions_list' });
  assert.equal((await y.waitFor('error')).code, 'forbidden');
});

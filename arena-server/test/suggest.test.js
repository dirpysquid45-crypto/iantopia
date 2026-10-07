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

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

test('admin can post, archive and delete; the public sees only posted ones, without uids', async () => {
  const t = await startServer({ admins: { uids: ['boss'], emails: [] } });
  const u = await asUser(t.url, 'alice', 'Alice');
  for (const text of ['one', 'two', 'three']) {
    u.clear(); u.send({ type: 'suggest', text }); await u.waitFor('suggest_result');
    await new Promise((r) => setTimeout(r, 15));
    // cooldown is per user; clear it so the test can send several
    t.manager.lastSuggest.clear();
  }
  const boss = await asUser(t.url, 'boss', 'Boss');
  boss.send({ type: 'suggestions_list' });
  const { rows } = await boss.waitFor('suggestions');
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.status === 'new'));
  const byText = Object.fromEntries(rows.map((r) => [r.text, r.id]));

  // Post one (name shown), post another (name hidden), archive the third.
  boss.send({ type: 'suggestion_set', id: byText.one, status: 'public' });
  assert.equal((await boss.waitFor('suggestion_updated')).status, 'public');
  boss.clear();
  boss.send({ type: 'suggestion_set', id: byText.two, status: 'public', hideName: true });
  await boss.waitFor('suggestion_updated');
  boss.clear();
  boss.send({ type: 'suggestion_set', id: byText.three, status: 'archived' });
  await boss.waitFor('suggestion_updated');

  const guest = await asGuest(t.url, 'Gus');
  guest.send({ type: 'suggestions_public' });
  const pub = await guest.waitFor('suggestions_public');
  assert.deepEqual(pub.rows.map((r) => r.text).sort(), ['one', 'two']);
  assert.equal(pub.rows.find((r) => r.text === 'one').name, 'Alice');
  assert.equal(pub.rows.find((r) => r.text === 'two').name, 'Anonymous');
  assert.ok(pub.rows.every((r) => !('uid' in r) && !('status' in r)), 'no private fields leak');

  // Non-admins cannot change anything; bad input is refused.
  guest.clear();
  guest.send({ type: 'suggestion_set', id: byText.three, status: 'public' });
  assert.equal((await guest.waitFor('error')).code, 'forbidden');
  guest.clear();
  guest.send({ type: 'suggestion_delete', id: byText.three });
  assert.equal((await guest.waitFor('error')).code, 'forbidden');
  boss.clear();
  boss.send({ type: 'suggestion_set', id: byText.one, status: 'bogus' });
  assert.equal((await boss.waitFor('error')).code, 'bad_request');
  boss.clear();
  boss.send({ type: 'suggestion_set', id: 'doesnotexist', status: 'public' });
  assert.equal((await boss.waitFor('error')).code, 'missing');

  // Delete removes it for good.
  boss.clear();
  boss.send({ type: 'suggestion_delete', id: byText.two });
  await boss.waitFor('suggestion_deleted');
  guest.clear();
  guest.send({ type: 'suggestions_public' });
  assert.deepEqual((await guest.waitFor('suggestions_public')).rows.map((r) => r.text), ['one']);
});

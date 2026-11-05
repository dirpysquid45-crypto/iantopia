// Gifts and notes to a visitable village: the server moves the Strubles, the limits hold,
// and a collect credits once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Gifts, GIFT_DAILY_LIMIT, NOTE_DAILY_LIMIT } = require('../gifts');
const { isBlocked } = require('../moderation');
const { createServer } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 9, 28, 12);
const SENDER = { uid: 'send1', name: 'Sender' };
const OPEN = 'open1';   // a visitable village
const SHUT = 'shut1';   // a village its owner has not opened

function setup({ senderBalance = '500', cap = 20000, t = T0 } = {}) {
  let now = t;
  const db = new FakeDb();
  db.docs.set('users/send1', { strubles_balance_v1: senderBalance });
  db.docs.set('users/recv1', { strubles_balance_v1: '100' });
  db.docs.set(`village_snapshots/${OPEN}`, { visitable: true, displayName: 'Open' });
  db.docs.set(`village_snapshots/${SHUT}`, { visitable: false, displayName: 'Shut' });
  const gifts = new Gifts(db, { now: () => now, balance: { capFromData: () => cap } });
  const giftsIn = (uid) => [...db.docs.entries()].filter(([k]) => k.startsWith(`village_snapshots/${uid}/gifts/`)).map(([, v]) => v);
  const ledger = () => [...db.docs.entries()].filter(([k]) => k.startsWith('account_log/')).map(([, v]) => v);
  return { db, gifts, giftsIn, ledger, advance: (ms) => { now += ms; } };
}
const send = (gifts, over = {}) => gifts.sendStrubles(SENDER, { toUid: OPEN, amount: 100, stickerId: 'cake', note: 'hi', ...over });

test('a sent gift debits the sender, makes one pending gift, and writes the out row', async () => {
  const { db, gifts, giftsIn, ledger } = setup();
  const r = await send(gifts);
  assert.equal(r.status, 200);
  assert.equal(r.body.balance, 400);
  assert.equal(db.docs.get('users/send1').strubles_balance_v1, '400');
  const [gift] = giftsIn(OPEN);
  assert.equal(giftsIn(OPEN).length, 1);
  assert.equal(gift.status, 'pending');
  assert.equal(gift.kind, 'strubles');
  assert.equal(gift.amount, 100);
  assert.equal(gift.fromUid, 'send1');
  assert.equal(gift.fromName, 'Sender', 'the name comes from the token');
  const out = ledger().find((r) => r.kind === 'gift_out');
  assert.ok(out, 'the out row exists');
  assert.equal(out.giftId, r.body.giftId);
});

test('a gift the sender can not cover is refused, with no debit and no gift', async () => {
  const { db, gifts, giftsIn } = setup({ senderBalance: '50' });
  const r = await send(gifts, { amount: 100 });
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'insufficient');
  assert.equal(db.docs.get('users/send1').strubles_balance_v1, '50');
  assert.equal(giftsIn(OPEN).length, 0);
});

test('a gift to yourself, or to a village that is not open, is refused with no debit', async () => {
  const { db, gifts, giftsIn } = setup();
  assert.deepEqual((await send(gifts, { toUid: 'send1' })).body, { error: 'self' });
  const shut = await send(gifts, { toUid: SHUT });
  assert.equal(shut.status, 403);
  assert.equal(shut.body.error, 'not_visitable');
  assert.equal(db.docs.get('users/send1').strubles_balance_v1, '500');
  assert.equal(giftsIn(SHUT).length, 0);
});

test('a second Strubles gift the same day is refused, and the next day it is allowed', async () => {
  const { gifts, advance } = setup();
  assert.equal(GIFT_DAILY_LIMIT, 1);
  assert.equal((await send(gifts)).status, 200);
  const again = await send(gifts);
  assert.equal(again.status, 429);
  assert.equal(again.body.error, 'limit');
  advance(DAY);
  assert.equal((await send(gifts)).status, 200);
});

test('amounts must be whole numbers from 1 to 1000, and the sticker must be on the list', async () => {
  const { gifts } = setup({ senderBalance: '5000' });
  assert.equal((await send(gifts, { amount: 0 })).status, 400);
  assert.equal((await send(gifts, { amount: 1001 })).status, 400);
  assert.equal((await send(gifts, { amount: 12.5 })).status, 400);
  assert.equal((await send(gifts, { stickerId: 'skull' })).body.error, 'bad_request');
  assert.equal((await send(gifts, { amount: 1000 })).status, 200, 'the max is allowed');
});

test('a note over 140 characters is refused', async () => {
  const { gifts } = setup();
  assert.equal((await send(gifts, { note: 'x'.repeat(141) })).body.error, 'bad_request');
});

test('a gift does not add to the refund budget', async () => {
  const { db, gifts } = setup();
  await send(gifts);
  assert.equal(db.docs.get('users/send1').wallet_budget, undefined);
});

test('the owner collects a gift once, and a second collect is refused', async () => {
  const { db, gifts, giftsIn } = setup();
  const sent = await send(gifts);
  db.docs.set(`users/${OPEN}`, { strubles_balance_v1: '100' });
  const owner = { uid: OPEN, name: 'Owner' };
  const first = await gifts.collect(owner, { giftId: sent.body.giftId });
  assert.equal(first.status, 200);
  assert.equal(first.body.applied, 100);
  assert.equal(first.body.balance, 200);
  assert.equal(db.docs.get(`users/${OPEN}`).strubles_balance_v1, '200');
  assert.equal(giftsIn(OPEN)[0].status, 'collected');
  assert.ok([...db.docs.keys()].includes(`account_log/gift_${sent.body.giftId}_in`), 'the in row exists');
  const again = await gifts.collect(owner, { giftId: sent.body.giftId });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'already_collected');
});

test('a collect over the wallet cap is refused, and nothing moves', async () => {
  const { db, gifts, giftsIn } = setup({ cap: 150 });
  const sent = await send(gifts);
  db.docs.set(`users/${OPEN}`, { strubles_balance_v1: '100' });
  const r = await gifts.collect({ uid: OPEN }, { giftId: sent.body.giftId });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'cap');
  assert.equal(db.docs.get(`users/${OPEN}`).strubles_balance_v1, '100');
  assert.equal(giftsIn(OPEN)[0].status, 'pending');
});

test('collecting a gift that is not yours to see is not found', async () => {
  const { gifts } = setup();
  const sent = await send(gifts);
  const r = await gifts.collect({ uid: 'someone' }, { giftId: sent.body.giftId });
  assert.equal(r.status, 404);
});

test('two collects at the same time credit the receiver once', async () => {
  const { db, gifts } = setup();
  const sent = await send(gifts);
  db.docs.set(`users/${OPEN}`, { strubles_balance_v1: '100' });
  const owner = { uid: OPEN };
  const [a, b] = await Promise.all([gifts.collect(owner, { giftId: sent.body.giftId }), gifts.collect(owner, { giftId: sent.body.giftId })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(db.docs.get(`users/${OPEN}`).strubles_balance_v1, '200');
});

test('notes: a clean note goes in, a listed word is blocked, and the note limit holds', async () => {
  const { gifts, giftsIn, advance } = setup();
  const ok = await gifts.sendNote(SENDER, { toUid: OPEN, stickerId: 'star', note: 'lovely village' });
  assert.equal(ok.status, 200);
  assert.equal(giftsIn(OPEN).filter((g) => g.kind === 'note').length, 1);
  const bad = await gifts.sendNote(SENDER, { toUid: OPEN, stickerId: 'star', note: 'you are a fucking mess' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'blocked_text');
  for (let i = 1; i < NOTE_DAILY_LIMIT; i++) assert.equal((await gifts.sendNote(SENDER, { toUid: OPEN, stickerId: 'star', note: 'hi' })).status, 200);
  assert.equal((await gifts.sendNote(SENDER, { toUid: OPEN, stickerId: 'star', note: 'hi' })).body.error, 'limit');
  advance(DAY);
  assert.equal((await gifts.sendNote(SENDER, { toUid: OPEN, stickerId: 'star', note: 'hi' })).status, 200);
});

test('notes do not use up the Strubles gift limit', async () => {
  const { gifts } = setup();
  await gifts.sendNote(SENDER, { toUid: OPEN, stickerId: 'cat', note: 'hello' });
  assert.equal((await send(gifts)).status, 200);
});

test('the word filter catches listed words, and not words that only contain one', () => {
  assert.equal(isBlocked('what a Shit day'), true);
  assert.equal(isBlocked('sh!t happens'), true, 'leetspeak');
  assert.equal(isBlocked('fu.ck'), true, 'punctuation between letters');
  assert.equal(isBlocked('a nice class and a therapist'), false);
  assert.equal(isBlocked('lovely cake'), false);
  assert.equal(isBlocked(''), false);
});

test('the gift routes need a verified sign-in, and refuse other methods', async () => {
  const db = new FakeDb();
  db.docs.set(`village_snapshots/${OPEN}`, { visitable: true });
  const server = createServer({ port: 0, host: '127.0.0.1', db, auth: FakeAuth, quiet: true, admins: { uids: [], emails: [] }, rate: { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 } });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = JSON.stringify({ toUid: OPEN, amount: 1, stickerId: 'cake', note: '' });
    const anon = await fetch(base + '/gifts/strubles', { method: 'POST', body });
    assert.equal(anon.status, 401);
    assert.equal((await anon.json()).error, 'sign_in');
    const get = await fetch(base + '/gifts/strubles', { headers: { Authorization: 'Bearer tok:send1:Sender' } });
    assert.equal(get.status, 405);
    const unknown = await fetch(base + '/gifts/nope', { method: 'POST', headers: { Authorization: 'Bearer tok:send1' }, body });
    assert.equal(unknown.status, 404);
    const signedIn = await fetch(base + '/gifts/strubles', { method: 'POST', headers: { Authorization: 'Bearer tok:send1:Sender' }, body });
    assert.equal(signedIn.status, 200, 'a verified sign-in with a player who has the Strubles is let through');
    assert.equal((await signedIn.json()).ok, true);
  } finally { await server.close(); }
});

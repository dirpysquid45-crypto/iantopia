// The browser side of the wallet (public/strubles.js), run against a stub browser:
// changes are shown at once, sent to the server in order, and the server's answer wins.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadStrubles({ signedIn, resolved = true, respond, hostname = 'localhost' }) {
  const store = new Map();
  const listeners = {};
  const sent = [];
  const win = {
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
    CloudSync: signedIn ? { currentUser: { getIdToken: async () => 'tok:u1' } } : { currentUser: null },
  };
  const fetch = async (url, opts = {}) => {
    sent.push({ url, method: opts.method || 'GET', auth: opts.headers && opts.headers.Authorization, body: opts.body ? JSON.parse(opts.body) : null });
    const r = respond(url, opts);
    return { ok: true, status: 200, json: async () => r };
  };
  const ctx = {
    window: win, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    location: { hostname, protocol: hostname === 'localhost' ? 'http:' : 'https:', pathname: '/tetris/' }, fetch,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    console,
  };
  const src = fs.readFileSync(path.join(__dirname, '../../public/strubles.js'), 'utf8');
  new Function('window', 'localStorage', 'location', 'fetch', 'CustomEvent', 'console', src)(
    win, ctx.localStorage, ctx.location, ctx.fetch, ctx.CustomEvent, ctx.console);
  if (resolved) win.dispatchEvent({ type: 'cloudsync:authchanged', detail: { user: signedIn ? { uid: 'u1' } : null } });
  return { S: win.Strubles, win, sent, store };
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

test('a signed-in spend shows at once, goes to the server, and the server balance replaces it', async () => {
  const { S, sent } = loadStrubles({ signedIn: true, respond: (url, opts) => {
    const ops = JSON.parse(opts.body).ops;
    return { results: ops.map((o) => ({ id: o.id, ok: true, applied: o.amount, balance: 470 })), balance: 470 };
  } });
  await wait(20);
  assert.equal(S.spend(30), true);
  assert.equal(S.get(), 70, 'shown at once (starting balance 100)');
  await wait();
  const post = sent.find((s) => s.method === 'POST');
  assert.ok(post, 'sent to the wallet');
  assert.equal(post.url, 'http://localhost:4001/wallet/ops');
  assert.equal(post.auth, 'Bearer tok:u1');
  assert.equal(post.body.ops[0].kind, 'spend');
  assert.equal(post.body.ops[0].amount, 30);
  assert.equal(S.get(), 470, 'the server answer replaces the shown number');
});

test('wins, refunds and spends go to the server in the order they happened', async () => {
  const { S, sent } = loadStrubles({ signedIn: true, respond: (url, opts) => {
    const ops = JSON.parse(opts.body).ops;
    return { results: ops.map((o) => ({ id: o.id, ok: true, applied: o.amount, balance: 0 })), balance: 0 };
  } });
  await wait(20);
  S.add(50);
  S.add(10, 'refund');
  S.spend(5);
  await wait();
  const ops = sent.filter((s) => s.method === 'POST').flatMap((s) => s.body.ops);
  assert.deepEqual(ops.map((o) => o.kind), ['win', 'refund', 'spend']);
});

test('a guest has a local balance only, and nothing is sent', async () => {
  const { S, sent } = loadStrubles({ signedIn: false, respond: () => ({}) });
  S.add(40);
  assert.equal(S.spend(10), true);
  await wait();
  assert.equal(sent.length, 0);
  assert.equal(S.get(), 130);
});

test('a spend the server refuses raises an event', async () => {
  const { S, win } = loadStrubles({ signedIn: true, respond: (url, opts) => {
    const ops = JSON.parse(opts.body).ops;
    return { results: ops.map((o) => ({ id: o.id, ok: false, error: 'insufficient', applied: 0, balance: 10 })), balance: 10 };
  } });
  await wait(20);
  let refused = null;
  win.addEventListener('strubles:refused', (e) => { refused = e.detail; });
  S.spend(50);
  await wait();
  assert.ok(refused && refused.id, 'the refusal is announced');
  assert.equal(S.get(), 10, 'the balance follows the server');
});

test('a Tetris payout reports what the server applied', async () => {
  const { S } = loadStrubles({ signedIn: true, respond: (url, opts) => {
    const ops = JSON.parse(opts.body).ops;
    return { results: ops.map((o) => ({ id: o.id, ok: true, applied: 150, balance: 250 })), balance: 250 };
  } });
  await wait(20);
  let got = null;
  S.tetris(900, (applied) => { got = applied; });
  await wait();
  assert.equal(got, 150);
});

test('a guest gets a small local Tetris pay, capped per game and per day, and nothing is sent', async () => {
  const { S, sent } = loadStrubles({ signedIn: false, respond: () => ({}) });
  let got = null;
  S.tetris(900, (applied) => { got = applied; });
  assert.equal(got, 15, 'a 900-point game pays the per-game cap for guests');
  assert.equal(S.get(), 115);
  for (let i = 0; i < 10; i++) S.tetris(900, () => {});
  assert.equal(S.get(), 100 + 60, 'a day is capped at 60 for guests');
  await wait();
  assert.equal(sent.length, 0);
});

test('a guest gets one local daily prize a day, from the same tiers as signed-in players', async () => {
  const { S, sent } = loadStrubles({ signedIn: false, respond: () => ({}) });
  let got = null;
  assert.equal(S.canDailyClaim(), true);
  S.dailyClaim((amount) => { got = amount; });
  assert.ok([500, 1000, 2000, 3500, 5000].includes(got), 'the prize is one of the tiers');
  assert.equal(S.canDailyClaim(), false);
  assert.equal(S.dailyClaim(() => {}), false, 'a second claim the same day is refused');
  await wait();
  assert.equal(sent.length, 0);
});

test('the browser has no way to set the balance in production', () => {
  const { S } = loadStrubles({ signedIn: true, hostname: 'iantopia.com', respond: () => ({}) });
  assert.equal(S.set, undefined, 'set is dev-only');
  assert.equal(S.reset, undefined, 'reset is dev-only');
});

test('a credit the server refuses for rate limiting says so, and the balance drops back', async () => {
  const { S, win } = loadStrubles({ signedIn: true, respond: (url, opts) => {
    const ops = JSON.parse(opts.body).ops;
    return { results: ops.map((o) => ({ id: o.id, ok: false, error: 'rate_limited', applied: 0, balance: 100 })), balance: 100 };
  } });
  const notes = [];
  win.addEventListener('strubles:notice', (e) => notes.push(e.detail.text));
  await wait(20);
  S.add(50, undefined, 'tycoon');
  assert.equal(S.get(), 150, 'shown at once');
  await wait();
  assert.equal(S.get(), 100, 'the server answer replaces it');
  assert.equal(notes.length, 1, 'one note for the refusal');
  assert.match(notes[0], /Too many Strubles changes/);
});

test('a win the server credits as 0 says how much was credited', async () => {
  const { S, win } = loadStrubles({ signedIn: true, respond: (url, opts) => {
    const ops = JSON.parse(opts.body).ops;
    return { results: ops.map((o) => ({ id: o.id, ok: true, applied: 0, balance: 100 })), balance: 100 };
  } });
  const notes = [];
  win.addEventListener('strubles:notice', (e) => notes.push(e.detail.text));
  await wait(20);
  S.add(50, undefined, 'tycoon');
  await wait();
  assert.deepEqual(notes, ['Only 0 of 50 Strubles were credited (a limit was reached).']);
});

test('a Tetris payout the server credits as 0 says so, and a zero request does not', async () => {
  const { S, win } = loadStrubles({ signedIn: true, respond: (url, opts) => {
    const ops = JSON.parse(opts.body).ops;
    return { results: ops.map((o) => ({ id: o.id, ok: true, applied: 0, balance: 100 })), balance: 100 };
  } });
  const notes = [];
  win.addEventListener('strubles:notice', (e) => notes.push(e.detail.text));
  await wait(20);
  S.tetris(0, () => {});
  await wait();
  assert.equal(notes.length, 0, 'nothing was asked for, so nothing is refused');
  S.tetris(40, () => {});
  await wait();
  assert.equal(notes.length, 1);
  assert.match(notes[0], /No Tetris pay was credited/);
});

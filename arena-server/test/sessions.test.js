// Play sessions: what the wallet's ops say about how a player played a game page.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Wallet } = require('../wallet');
const BalanceManager = require('../balance');
const { PlaySessions, GAP_MS, COLLECTION } = require('../sessions');
const { FakeDb } = require('./fakes');

const MIN = 60 * 1000;

function setup(start = Date.UTC(2026, 9, 28, 12)) {
  let t = start;
  const db = new FakeDb();
  db.seed('u1', { strubles_balance_v1: '500' });
  db.seed('u2', { strubles_balance_v1: '500' });
  const sessions = new PlaySessions(db, { now: () => t });
  const wallet = new Wallet(db, new BalanceManager(db), { now: () => t, rand: () => 0.1, sessions });
  const sessionDocs = () => [...db.docs.entries()].filter(([k]) => k.startsWith(COLLECTION + '/')).map(([, v]) => v);
  return { db, wallet, sessions, sessionDocs, tick: (ms) => { t += ms; }, now: () => t };
}
const flush = () => new Promise((r) => setTimeout(r, 20));

test('a run of blackjack ops on one page is one session, with its rounds and Strubles', async () => {
  const { wallet, sessionDocs } = setup();
  await wallet.applyBatch('u1', [
    { id: 'a1', kind: 'stake', game: 'blackjack', round: 'r1', amount: 50, page: '/blackjack' },
    { id: 'a2', kind: 'settle', game: 'blackjack', round: 'r1', amount: 100, page: '/blackjack' },
  ]);
  await flush();
  const docs = sessionDocs();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].page, '/blackjack');
  assert.equal(docs[0].uid, 'u1');
  assert.equal(docs[0].actions, 2);
  assert.equal(docs[0].rounds, 1);
  assert.equal(docs[0].staked, 50);
  assert.equal(docs[0].won, 100);
});

test('a gap longer than the limit starts a new session, and a page change does too', async () => {
  const { wallet, sessionDocs, tick } = setup();
  await wallet.applyBatch('u1', [{ id: 't1', kind: 'tetris', points: 40, page: '/tetris' }]);
  tick(5 * MIN);
  await wallet.applyBatch('u1', [{ id: 't2', kind: 'tetris', points: 40, page: '/tetris' }]);
  tick(GAP_MS + MIN);
  await wallet.applyBatch('u1', [{ id: 't3', kind: 'tetris', points: 40, page: '/tetris' }]);
  await wallet.applyBatch('u1', [{ id: 't4', kind: 'tetris', points: 40, page: '/minesweeper' }]);
  await flush();
  const pages = sessionDocs().map((d) => d.page).sort();
  assert.deepEqual(pages, ['/minesweeper', '/tetris', '/tetris'], 'two tetris sessions and one minesweeper session');
  const first = sessionDocs().find((d) => d.page === '/tetris' && d.actions === 2);
  assert.ok(first, 'the first two ops are one session');
});

test('ops without a game page are not recorded', async () => {
  const { wallet, sessionDocs } = setup();
  await wallet.applyBatch('u1', [{ id: 'n1', kind: 'win', amount: 20, source: 'tycoon' }]);
  await flush();
  assert.equal(sessionDocs().length, 0);
});

test('a session that fails to record does not fail the player\'s ops', async () => {
  const { db } = setup();
  const broken = { record: () => Promise.reject(new Error('down')) };
  const wallet = new Wallet(db, new BalanceManager(db), { now: () => Date.now(), rand: () => 0.1, sessions: broken });
  const results = await wallet.applyBatch('u2', [{ id: 'w1', kind: 'win', amount: 20, source: 'tycoon', page: '/tycoon' }]);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].applied, 20);
  await flush();
});

test('the report groups the last week by game, and leaves out older sessions', async () => {
  const day = 24 * 60 * MIN;
  const { db, sessions, now } = setup();
  const t = now();
  // Two players on tetris this week, one of them twice; one older session that should not count.
  await sessions.record('u1', [{ page: '/tetris', kind: 'tetris', applied: 30 }]);
  await sessions.record('u2', [{ page: '/tetris', kind: 'tetris', applied: 10 }, { page: '/tetris', kind: 'tetris', applied: 10 }]);
  await sessions.record('u1', [{ page: '/blackjack', kind: 'stake', applied: 50 }, { page: '/blackjack', kind: 'settle', applied: 0 }]);
  db.docs.set(COLLECTION + '/old', { uid: 'u3', page: '/horse-web-game', start: new Date(t - 30 * day), last: new Date(t - 30 * day), actions: 9, rounds: 0, staked: 0, won: 900 });
  const report = await sessions.summary(7);
  assert.equal(report.days, 7);
  const tetris = report.games.find((g) => g.page === '/tetris');
  assert.equal(tetris.sessions, 2, 'u2 is one session; u1 is one session too, since no gap was made');
  assert.equal(tetris.players, 2);
  assert.equal(tetris.won, 50);
  assert.ok(!report.games.some((g) => g.page === '/horse-web-game'), 'a month old session is left out');
  assert.equal(report.totals.players, 2);
  assert.equal(report.totals.staked, 50);
  assert.equal(report.truncated, false);
});

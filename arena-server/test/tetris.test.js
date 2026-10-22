// Tetris: the shared rules (public/tetris/engine.js), the versus server game
// (tetris.js), and the manager's friendly-only rule for it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TetrisGame, validClearedRows, validSnapshot } = require('../tetris');
const Manager = require('../manager');
const { FakeDb } = require('./fakes');

// The engine is a browser script (it is a plain file, not a module), so load it the
// same way the browser does.
function loadEngine() {
  const src = fs.readFileSync(path.join(__dirname, '../../public/tetris/engine.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports;
}
const E = loadEngine();

// A board with nothing in play, for tests that drive the active piece by hand.
function boardWith(type, cells, x, y, seed = 3) {
  const b = new E.Board({ seed });
  b.active.type = type;
  b.active.cells = cells;
  b.active.x = x;
  b.active.y = y;
  return b;
}
function fillRow(b, row, from, to, letter = 'Z') {
  for (let x = from; x < to; x++) b.grid[row][x] = letter;
}

// ---------------- engine: rules ----------------

test('the bag holds each of the seven pieces once in every seven', () => {
  const b = new E.Board({ seed: 42 });
  // The piece in play came out of the first bag, so start the sequence there.
  const seen = [b.active.type];
  for (let i = 0; i < 13; i++) seen.push(b.nextType());
  for (const bag of [seen.slice(0, 7), seen.slice(7, 14)]) {
    assert.deepEqual([...bag].sort(), [...E.TYPES].sort());
  }
});

test('the same seed gives the same pieces (both players in a versus match see the same game)', () => {
  const a = new E.Board({ seed: 777 }), b = new E.Board({ seed: 777 });
  assert.deepEqual(a.preview(), b.preview());
  for (let i = 0; i < 30; i++) assert.equal(a.nextType(), b.nextType());
});

test('a clockwise rotation of the I piece kicks off the wall when it has to', () => {
  // Flat I against the left wall, in the middle of the well: turning it up
  // needs the SRS kick to move it right off the wall.
  const b = boardWith('I', [[1, 1, 1, 1]], 0, 10);
  assert.equal(b.rotate(true), true, 'a kick finds a legal spot');
  assert.equal(b.active.dir, 1);
  assert.ok(b.active.x >= 0, 'the piece stays on the board');
  assert.equal(b.active.cells.length, 4, 'now vertical');
});

test('the O piece never rotates', () => {
  const b = boardWith('O', [[1, 1], [1, 1]], 4, 10);
  assert.equal(b.rotate(true), false);
  assert.deepEqual(b.active.cells, [[1, 1], [1, 1]]);
});

test('a single line clears for 100 points at level 1', () => {
  const b = boardWith('O', [[1, 1], [1, 1]], 0, 38);
  fillRow(b, 39, 2, 10);
  let cleared = null;
  b.onLock = (rows) => { cleared = rows; };
  b.hardDrop();
  assert.equal(cleared.length, 1);
  assert.equal(b.lines, 1);
  // 2 points for the hard drop rows (the O falls 0 rows here), plus 100 for the line.
  assert.equal(b.score, 100);
});

test('four lines at once is a Tetris for 800, and a second in a row gets the back-to-back bonus', () => {
  const b = boardWith('I', [[1], [1], [1], [1]], 0, 36);
  for (let y = 36; y < 40; y++) fillRow(b, y, 1, 10, 'S');
  b.hardDrop();
  assert.equal(b.lines, 4);
  assert.equal(b.score, 800);
  assert.equal(b.b2b, true);

  const c = boardWith('I', [[1], [1], [1], [1]], 0, 36);
  c.b2b = true;
  for (let y = 36; y < 40; y++) fillRow(c, y, 1, 10, 'S');
  c.hardDrop();
  assert.equal(c.score, 1200, 'Tetris plus the 400 back-to-back bonus');
});

test('level goes up every five lines', () => {
  const b = new E.Board({ seed: 5 });
  b.lines = 4;
  b.applyClearScore(1);
  assert.equal(b.level, 2);
  assert.equal(E.fallInterval(2) < E.fallInterval(1), true, 'and falls faster');
});

test('hold stores the piece, brings the held one back, and works only once per lock', () => {
  const b = new E.Board({ seed: 9 });
  const first = b.active.type;
  b.holdPiece();
  assert.equal(b.held, first);
  const second = b.active.type;
  assert.equal(b.canHold, false);
  b.holdPiece();
  assert.equal(b.active.type, second, 'second hold in the same lock does nothing');
  b.hardDrop();   // lock, so hold is allowed again
  b.holdPiece();
  assert.equal(b.held !== null, true);
});

test('ghost is the lowest legal row for the piece', () => {
  const b = boardWith('O', [[1, 1], [1, 1]], 0, 0);
  const g = b.ghostY();
  assert.ok(g >= 38, 'an empty well drops the O to the floor');
});

test('garbage rows push the stack up and sit at the bottom', () => {
  const b = new E.Board({ seed: 4 });
  const row = ['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'T'];
  b.receiveRows([row]);
  assert.equal(b.over, false);
  assert.deepEqual(b.grid[39], row);
});

test('garbage that would push a block out of the top is a top-out', () => {
  const b = new E.Board({ seed: 4 });
  fillRow(b, 0, 0, 10, 'I');
  b.receiveRows([Array(10).fill('O')]);
  assert.equal(b.over, true);
  assert.equal(b.overReason, 'topout');
});

test('a piece that cannot enter the well ends the game (block-out)', () => {
  const b = new E.Board({ seed: 6 });
  for (let y = 0; y < 40; y++) fillRow(b, y, 0, 10, 'L');
  b.place('T');
  assert.equal(b.over, true);
  assert.equal(b.overReason, 'blockout');
});

test('snapshot is 20 rows of 10 characters, with the active piece drawn in', () => {
  const b = new E.Board({ seed: 8 });
  const snap = b.snapshot();
  assert.equal(snap.length, 20);
  for (const row of snap) assert.match(row, /^[.IOTSZJL]{10}$/);

  // An O placed in the visible rows shows all four of its cells.
  const o = boardWith('O', [[1, 1], [1, 1]], 4, E.SKYLINE + 5);
  const shown = o.snapshot().join('');
  assert.equal(shown.split('O').length - 1, 4);
});

test('the visible rows are the same as the engine grid below the skyline', () => {
  const b = new E.Board({ seed: 8 });
  fillRow(b, 30, 0, 3, 'J');
  const snap = b.snapshot();
  assert.equal(snap[30 - E.SKYLINE].slice(0, 3), 'JJJ');
});

// ---------------- server: validation ----------------

test('cleared rows: must be 1 to 4 full rows of piece letters', () => {
  const full = Array(10).fill('I');
  assert.ok(validClearedRows([full]));
  assert.ok(validClearedRows([full, full, full, full]));
  assert.equal(validClearedRows([]), null, 'no rows');
  assert.equal(validClearedRows([full, full, full, full, full]), null, 'more than four');
  assert.equal(validClearedRows([Array(9).fill('I')]), null, 'short row');
  assert.equal(validClearedRows([[...Array(9).fill('I'), '.']]), null, 'a gap is not a cleared row');
  assert.equal(validClearedRows([Array(10).fill('X')]), null, 'not a piece');
  assert.equal(validClearedRows('nope'), null);
});

test('snapshot: exactly 20 rows of 10 cells', () => {
  const rows = Array(20).fill('..........');
  assert.ok(validSnapshot(rows));
  assert.equal(validSnapshot(rows.slice(1)), null);
  assert.equal(validSnapshot(rows.map((r, i) => (i === 3 ? '..........x' : r))), null);
  assert.equal(validSnapshot(null), null);
});

// ---------------- server: the versus game ----------------

function fakePlayer(name, sessionId) {
  const sent = [];
  return { name, sessionId, userId: 'u_' + sessionId, sent, ws: { readyState: 1, send: (d) => sent.push(JSON.parse(d)) }, bet: 0, guest: false };
}
function newMatch() {
  const a = fakePlayer('Ann', 's1'), b = fakePlayer('Ben', 's2');
  // A short rematch window: a finished match leaves a timer behind, and it must not keep the test run alive.
  const g = new TetrisGame('t1', a, b, null, { timing: { graceMs: 60000, rematchMs: 20 } });
  g.closeTable = () => {};
  g.begin();
  return { g, a, b };
}
const last = (p, type) => [...p.sent].reverse().find((m) => m.type === type);

test('both players get the same seed and their own index', () => {
  const { a, b } = newMatch();
  const sa = a.sent.find((m) => m.type === 'game_start');
  const sb = b.sent.find((m) => m.type === 'game_start');
  assert.equal(sa.yourIndex, 0);
  assert.equal(sb.yourIndex, 1);
  assert.equal(sa.seed, sb.seed);
  assert.equal(sa.friendly, true);
});

test('cleared rows go to the opponent, each with one hole, and never back to the sender', () => {
  const { g, a, b } = newMatch();
  const full = Array(10).fill('L');
  g.handleAction('s1', 'cleared', { rows: [full, full] });
  const garbage = last(b, 'tetris_garbage');
  assert.equal(garbage.rows.length, 2);
  for (const row of garbage.rows) {
    assert.equal(row.filter((c) => c === null).length, 1, 'exactly one hole');
  }
  assert.equal(last(a, 'tetris_garbage'), undefined, 'the sender gets nothing back');
});

test('a bad cleared message is refused and nothing is relayed', () => {
  const { g, b } = newMatch();
  g.handleAction('s1', 'cleared', { rows: [Array(10).fill('X')] });
  g.handleAction('s1', 'cleared', { rows: 'nope' });
  assert.equal(last(b, 'tetris_garbage'), undefined);
});

test('a board snapshot goes to the opponent only, and a bad one is dropped', () => {
  const { g, a, b } = newMatch();
  const rows = Array(20).fill('..........');
  g.handleAction('s1', 'board', { rows });
  assert.ok(last(b, 'tetris_board'));
  assert.equal(last(a, 'tetris_board'), undefined);
  g.handleAction('s1', 'board', { rows: ['bad'] });
  assert.equal(b.sent.filter((m) => m.type === 'tetris_board').length, 1);
});

test('a top-out ends the match: the other player wins, both see the scores', () => {
  const { g, a, b } = newMatch();
  g.handleAction('s1', 'topout', { score: 1200, lines: 14 });
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 1);
  const over = last(a, 'tetris_over');
  assert.equal(over.winner, 1);
  assert.equal(over.reason, 'topout');
  assert.equal(over.scores[0].score, 1200);
  assert.ok(last(b, 'tetris_over'), 'the winner is told too');
  assert.ok(last(b, 'show_rematch_prompt'), 'the rematch window opens');
});

test('after the match is over, late actions are ignored', () => {
  const { g, b } = newMatch();
  g.handleAction('s1', 'topout', { score: 5, lines: 0 });
  const before = b.sent.length;
  g.handleAction('s2', 'topout', { score: 9, lines: 9 });
  assert.equal(b.sent.length, before);
  assert.equal(g.winner, 1, 'the first top-out stands');
});

test('a score that is not an integer is replaced with 0', () => {
  const { g, b } = newMatch();
  g.handleAction('s1', 'topout', { score: 'lots', lines: -3 });
  const over = last(b, 'tetris_over');
  assert.deepEqual(over.scores[0], { score: 0, lines: 0 });
});

test('a dropped player who does not come back loses after the grace period', async () => {
  const a = fakePlayer('Ann', 's1'), b = fakePlayer('Ben', 's2');
  const g = new TetrisGame('t2', a, b, null, { timing: { graceMs: 30, rematchMs: 60000 } });
  g.closeTable = () => {};
  g.begin();
  g.disconnect('s1');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(g.winner, 1, 'the player still there wins');
  assert.equal(last(b, 'tetris_over').reason, 'disconnect');
  g.close();
});

test('a player who reconnects gets the match state, and the table keeps its seed', () => {
  const { g, a } = newMatch();
  g.resync(0);
  const r = last(a, 'resync');
  assert.equal(r.gameType, 'tetris');
  assert.equal(r.seed, g.seed);
  assert.equal(r.phase, 'playing');
});

// ---------------- manager: friendly only, and pairing ----------------

function fakeWs() {
  const sent = [];
  return { readyState: 1, sent, send: (d) => sent.push(JSON.parse(d)) };
}

test('Tetris is friendly only: a staked lobby is refused', () => {
  const m = new Manager(new FakeDb(), null, {});
  const ws = fakeWs();
  m.connections.set('s1', { userId: 'u1', ws, guest: false, name: 'Ann' });
  m.handleMessage('u1', 's1', { type: 'join_queue', bet: 50, gameType: 'tetris' });
  const err = ws.sent.find((x) => x.type === 'error');
  assert.ok(err, 'an error is sent');
  assert.match(err.message, /friendly only/);
  assert.equal(m.queue.length, 0);
});

test('two friendly Tetris lobbies pair up and both start with the same seed', async () => {
  const m = new Manager(new FakeDb(), null, {});
  const wa = fakeWs(), wb = fakeWs();
  m.connections.set('s1', { userId: 'u1', ws: wa, guest: false, name: 'Ann' });
  m.connections.set('s2', { userId: 'u2', ws: wb, guest: false, name: 'Ben' });
  await m.handleMessage('u1', 's1', { type: 'join_queue', bet: 0, gameType: 'tetris' });
  await m.handleMessage('u2', 's2', { type: 'join_queue', bet: 0, gameType: 'tetris' });
  await new Promise((r) => setTimeout(r, 20));
  const sa = wa.sent.find((x) => x.type === 'game_start');
  const sb = wb.sent.find((x) => x.type === 'game_start');
  assert.ok(sa && sb, 'both got game_start');
  assert.equal(sa.gameType, 'tetris');
  assert.equal(sa.seed, sb.seed);
  for (const t of m.tables.values()) t.close();
});

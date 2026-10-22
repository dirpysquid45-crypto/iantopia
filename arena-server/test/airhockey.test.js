// Air hockey rules on the server: goals, the four modes, paddle limits, paddle
// hits and pausing. The loops are stopped and the simulation is stepped by hand,
// so the tests don't depend on real time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { AirHockeyGame, W, H, PUCK_R, PADDLE_R, GOAL_TOP, GOAL_BOTTOM } = require('../airhockey');

function fakePlayer(name, sessionId) {
  const sent = [];
  return { name, sessionId, userId: 'u_' + sessionId, sent, ws: { readyState: 1, send: (d) => sent.push(JSON.parse(d)) }, bet: 0, guest: false };
}
function newGame(mode = 'score7') {
  const a = fakePlayer('Ann', 's1'), b = fakePlayer('Ben', 's2');
  const g = new AirHockeyGame('t1', a, b, null, { mode, timing: { graceMs: 60000, rematchMs: 60000 } });
  g.closeTable = () => {};
  g.begin();
  clearInterval(g.loop); clearInterval(g.snapshotLoop); clearTimeout(g.pauseTimer);
  g.paused = false;
  g.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  return { g, a, b };
}
// Simulate `ms` of game time in 1/120 s steps.
function run(g, ms) {
  const steps = Math.round(ms / 1000 * 120);
  for (let i = 0; i < steps && g.phase === 'playing'; i++) g.step(1 / 120);
}

test('game_start carries the mode and the table, and each side knows its index', () => {
  const { a, b } = newGame('best5');
  const sa = a.sent.find((m) => m.type === 'game_start');
  const sb = b.sent.find((m) => m.type === 'game_start');
  assert.equal(sa.yourIndex, 0); assert.equal(sb.yourIndex, 1);
  assert.equal(sa.mode, 'best5');
  assert.equal(sa.field.w, W); assert.equal(sa.field.goalTop, GOAL_TOP);
});

test('a paddle stays in its own half and inside the table', () => {
  const { g } = newGame();
  g.handleAction('s1', 'move', { x: 0.95, y: 0.5 });   // left player reaching across the centre
  run(g, 2000);
  assert.ok(g.paddles[0].x <= W / 2 - PADDLE_R + 0.5, 'left paddle stays left of centre');
  g.handleAction('s2', 'move', { x: 0.0, y: 2 });       // right player, out of range
  run(g, 2000);
  assert.ok(g.paddles[1].x >= W / 2 + PADDLE_R - 0.5, 'right paddle stays right of centre');
  assert.ok(g.paddles[1].y <= H - PADDLE_R + 0.5, 'and inside the bottom edge');
  g.handleAction('s1', 'move', { x: NaN, y: 0.5 });     // ignored
  assert.ok(Number.isFinite(g.targets[0].x));
});

test('a puck crossing the goal slot scores for the other side and the table pauses to serve', () => {
  const { g, a } = newGame();
  g.puck = { x: 40, y: H / 2, vx: -900, vy: 0 };   // heading into the left goal
  run(g, 200);
  assert.deepEqual(g.score, [0, 1]);
  assert.equal(g.paused, true, 'paused after a goal');
  assert.ok(a.sent.some((m) => m.type === 'airhockey_state' && m.score[1] === 1), 'players are told the score');
});

test('a puck hitting the wall outside the goal slot bounces, it does not score', () => {
  const { g } = newGame();
  g.puck = { x: 60, y: GOAL_TOP - 60, vx: -900, vy: 0 };
  run(g, 120);
  assert.deepEqual(g.score, [0, 0]);
  assert.ok(g.puck.vx > 0, 'bounced back into the table');
});

test('score to 7: the first to 7 goals wins', () => {
  const { g, a } = newGame('score7');
  g.score = [6, 0];
  g.puck = { x: W - 40, y: H / 2, vx: 900, vy: 0 };   // into the right goal, so player 0 scores
  run(g, 200);
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 0);
  assert.ok(a.sent.some((m) => m.type === 'airhockey_over' && m.winner === 0 && m.reason === 'score'));
});

test('best of 5: the first to 3 goals wins', () => {
  const { g } = newGame('best5');
  g.score = [0, 2];
  g.puck = { x: 40, y: H / 2, vx: -900, vy: 0 };   // player 1 scores their third
  run(g, 200);
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 1);
});

test('time mode: the higher score when the clock runs out wins, a tie is a draw', () => {
  const { g } = newGame('time60');
  g.score = [2, 1];
  g.clockMs = 50;
  run(g, 200);
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 0);

  const tie = newGame('time60').g;
  tie.score = [1, 1];
  tie.clockMs = 50;
  run(tie, 200);
  assert.equal(tie.winner, -1, 'a draw');
});

test('endless mode never ends on score', () => {
  const { g } = newGame('endless');
  g.score = [40, 0];
  g.puck = { x: W - 40, y: H / 2, vx: 900, vy: 0 };
  run(g, 300);
  assert.equal(g.phase, 'playing');
});

test('a paddle hit sends the puck back, and a moving paddle adds speed', () => {
  const { g } = newGame();
  // Left paddle just behind the puck, swinging right into it: its target is past
  // the puck, so it moves about 38 units in one step (about 4550 units a second).
  g.paddles[0] = { x: 380, y: H / 2, vx: 0, vy: 0 };
  g.targets[0] = { x: 450, y: H / 2 };
  g.puck = { x: 430, y: H / 2, vx: 0, vy: 0 };
  g.step(1 / 120);
  assert.ok(g.puck.vx > 0, 'puck is moving right, away from the paddle');
  assert.ok(g.events.includes('hit0'), 'a hit was recorded for the sound');
  assert.ok(Math.hypot(g.puck.vx, g.puck.vy) > 300, 'the swing gave the puck speed');
});

test('a disconnected player pauses the table until they return', () => {
  const { g } = newGame();
  g.players[1].connected = false;
  g.puck = { x: W / 2, y: H / 2, vx: 300, vy: 0 };
  const before = g.puck.x;
  g.tick();                       // the tick holds while someone is away
  assert.equal(g.puck.x, before);
  g.players[1].connected = true;
});

test('resync rebuilds the score, puck, and paddles for a returning player', () => {
  const { g, a } = newGame();
  g.score = [3, 2];
  g.resync(0);
  const r = a.sent.filter((m) => m.type === 'resync').pop();
  assert.deepEqual(r.score, [3, 2]);
  assert.equal(r.gameType, 'airhockey');
  assert.equal(r.mode, 'score7');
  assert.equal(r.paddles.length, 2);
});

test('a snapshot is compact and carries the events since the last one', () => {
  const { g, a } = newGame();
  g.events.push('wall');
  g.broadcastState();
  const snap = a.sent.filter((m) => m.type === 'airhockey_state').pop();
  assert.ok(Array.isArray(snap.puck) && snap.puck.length === 4, 'position and velocity');
  assert.ok(snap.events.includes('wall'));
  assert.equal(g.events.length, 0, 'events are cleared once sent');
});

test('the table is the regulation 7 ft by 4 ft ratio, with the goal centred across the width', () => {
  assert.equal(W / H, 1.75);
  assert.equal((GOAL_TOP + GOAL_BOTTOM) / 2, H / 2, 'goal slot is centred');
  assert.ok(GOAL_BOTTOM - GOAL_TOP < H * 0.2, 'the goal is a slot, not a whole side');
});

test('paddles are pushed out of the centre circle while a serve is waiting', () => {
  const { g } = newGame();
  g.servePuck();                        // paused, puck at the centre
  g.paddles[0] = { x: W / 2 - 20, y: H / 2, vx: 0, vy: 0 };
  g.targets[0] = { x: W / 2 - 20, y: H / 2 };
  g.step(1 / 120);
  const d = Math.hypot(g.paddles[0].x - W / 2, g.paddles[0].y - H / 2);
  assert.ok(d >= PUCK_R + PADDLE_R - 0.001, 'the paddle is clear of the puck');
  clearTimeout(g.pauseTimer);
});

test('a puck only scores once its whole edge is past the line', () => {
  const { g } = newGame();
  g.puck = { x: -PUCK_R + 4, y: H / 2, vx: 0, vy: 0 };      // centre just short of the full crossing, at rest
  run(g, 20);
  assert.deepEqual(g.score, [0, 0], 'not yet a goal');
  g.puck = { x: -PUCK_R - 4, y: H / 2, vx: -500, vy: 0 };   // fully across
  g.step(1 / 120);
  assert.deepEqual(g.score, [0, 1]);
});


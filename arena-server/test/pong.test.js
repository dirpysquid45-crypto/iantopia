// Pong rules on the server: serving, paddle targets, scoring, the win, and
// holding the game while a player is away. The loop is stopped and the tick is
// driven by hand, so the tests don't depend on real time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PongGame } = require('../pong');

function fakePlayer(name, sessionId) {
  const sent = [];
  return { name, sessionId, userId: 'u_' + sessionId, sent, ws: { readyState: 1, send: (d) => sent.push(JSON.parse(d)) }, bet: 0, guest: false };
}
function newGame() {
  const a = fakePlayer('Ann', 's1'), b = fakePlayer('Ben', 's2');
  const g = new PongGame('t1', a, b, null, { timing: { graceMs: 60000, rematchMs: 60000 } });
  g.closeTable = () => {};
  g.begin();
  clearInterval(g.loop); clearTimeout(g.countdownTimer);
  g.countingDown = false;
  g.ball = { x: 400, y: 250, vx: 0, vy: 0 };
  return { g, a, b };
}
// Advance the simulation by `ms` of game time in 16ms steps.
function run(g, ms) {
  for (let t = 0; t < ms; t += 16) { g.lastTick = Date.now() - 16; g.tick(); }
}

test('game_start tells both players their index and the field size', () => {
  const { a, b } = newGame();
  const sa = a.sent.find((m) => m.type === 'game_start');
  const sb = b.sent.find((m) => m.type === 'game_start');
  assert.equal(sa.yourIndex, 0); assert.equal(sb.yourIndex, 1);
  assert.equal(sa.field.w, 800); assert.equal(sa.friendly, true);
});

test('a move action steers the paddle toward the target, clamped to the field', () => {
  const { g } = newGame();
  g.handleAction('s1', 'move', { y: 0 });
  run(g, 1000);
  assert.ok(g.paddles[0] < 60, 'left paddle reaches the top');
  g.handleAction('s2', 'move', { y: 5 });   // out of range: clamped, not a crash
  run(g, 1000);
  assert.ok(g.paddles[1] <= 500 - 48 + 0.001, 'right paddle stays on the field');
  g.handleAction('s1', 'move', { y: NaN });  // ignored
  assert.ok(Number.isFinite(g.targets[0]));
});

test('a ball that gets past a paddle scores for the other side and re-serves', () => {
  const { g } = newGame();
  g.ball = { x: 30, y: 10, vx: -400, vy: 0 };   // off the top corner, past the left paddle
  g.paddles[0] = 400;                           // paddle nowhere near it
  g.tick = g.tick.bind(g);
  run(g, 300);   // a few ticks for the ball to cross the goal line
  assert.deepEqual(g.score, [0, 1]);
  assert.equal(g.countingDown, true, 'a new serve is pending after a point');
});

test('the first player to 5 wins and gets the rematch prompt', () => {
  const { g, a } = newGame();
  // The ball leaving the left side is a point for the right player (player 1).
  g.score = [0, 4];
  g.paddles[0] = 60;                       // paddle well above the ball, so it is a goal
  g.ball = { x: -20, y: 400, vx: -300, vy: 0 };
  g.lastTick = Date.now() - 16; g.tick();
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 1);
  const over = a.sent.find((m) => m.type === 'pong_over');
  assert.ok(over && over.winner === 1 && over.score[1] === 5);
  assert.ok(a.sent.some((m) => m.type === 'show_rematch_prompt'));
});

test('a disconnected player pauses the game until they return', () => {
  const { g, b } = newGame();
  g.players[1].connected = false;
  const before = g.ball.x;
  g.ball.vx = 300;
  run(g, 500);
  assert.equal(g.ball.x, before, 'ball does not move while a player is away');
  g.players[1].connected = true;
  run(g, 100);
  assert.ok(g.ball.x > before, 'ball moves again once they are back');
});

test('leaving mid-game forfeits to the other player', () => {
  const { g, a } = newGame();
  g.forfeitIndex(1, 'left');
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 0);
  assert.ok(a.sent.some((m) => m.type === 'pong_over' && m.reason === 'left'));
});

test('a resync rebuilds the score and positions for a returning player', () => {
  const { g, a } = newGame();
  g.score = [2, 3];
  g.resync(0);
  const r = a.sent.filter((m) => m.type === 'resync').pop();
  assert.deepEqual(r.score, [2, 3]);
  assert.equal(r.gameType, 'pong');
});

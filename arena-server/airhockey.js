/**
 * Air hockey 1v1 for the Arena. Friendly only (nothing is staked), so there is
 * nothing to charge or refund here; the shared ArenaGame handles the connection
 * grace period, rematch window and table cleanup.
 *
 * Rules and table are ported from lazysquirrellabs/airhockey (MIT code; CC BY 4.0
 * art): four match modes (score to 7, best of 5, a 60 second clock, endless), a
 * rounded table with a goal slot on each side, and the same paddle and puck
 * roles. The Unity physics engine is replaced by the small simulation below.
 *
 * The server owns the simulation. Clients send where they want their paddle
 * (a fraction of the table), and get back snapshots of the puck and both
 * paddles. Snapshots are sent faster than the old Pong game (60 a second) so
 * the other side moves smoothly. The physics runs at 120 steps a second so a
 * fast puck can't tunnel through a paddle.
 */

const ArenaGame = require('./game-base');

const W = 1000;                   // logical table width (left goal at x=0, right goal at x=W)
const H = 1000;                   // logical table height
const PUCK_R = 42;
const PADDLE_R = 64;
const GOAL_TOP = H * 0.29;        // goal slot runs vertically across these fractions of the height
const GOAL_BOTTOM = H * 0.71;
const RESTITUTION_WALL = 0.86;
const RESTITUTION_PADDLE = 0.92;
const PADDLE_IMPART = 0.55;       // how much of the paddle's own speed a hit gives the puck
const PADDLE_MAX_SPEED = 2600;    // px per second the paddle follows its target
const PUCK_MAX_SPEED = 2200;
const PUCK_DRAG = 0.35;           // per-second exponential slow-down (a light table, not ice)
const SIM_HZ = 120;
const SNAPSHOT_HZ = 60;
const SERVE_PAUSE_MS = 900;       // pause after a goal before the puck is put back in play
const SCORE_TO = 7;               // score-to mode
const BEST_OF_WINS = 3;           // best of 5 goals: the first to 3 goals wins
const CLOCK_MS = 60000;           // time mode
const MODES = new Set(['score7', 'best5', 'time60', 'endless']);

// Mid-table line on the goal side, where each side's paddle is allowed to go.
const HALF = W / 2;

class AirHockeyGame extends ArenaGame {
  constructor(tableId, playerA, playerB, balance, opts = {}) {
    super(tableId, playerA, playerB, balance, opts);
    this.gameType = 'airhockey';
    this.mode = MODES.has(opts.mode) ? opts.mode : 'score7';
    this.phase = 'lobby';
    this.loop = null;
    this.snapshotLoop = null;
    this.pauseTimer = null;
    this.stepAccum = 0;
    this.lastTime = 0;
    this.snapshotAccum = 0;
    this.events = [];
    this.resetForRematch();
  }

  resetForRematch() {
    this.score = [0, 0];
    this.winner = null;
    this.clockMs = CLOCK_MS;
    this.paddles = [{ x: 180, y: H / 2, vx: 0, vy: 0 }, { x: W - 180, y: H / 2, vx: 0, vy: 0 }];
    this.targets = [{ x: 180, y: H / 2 }, { x: W - 180, y: H / 2 }];
    this.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.serveTowards = Math.random() < 0.5 ? 0 : 1;
    this.paused = false;   // a goal pause, not a disconnect
  }

  async begin(isRematch = false) {
    this.resetForRematch();
    this.phase = 'playing';
    for (let i = 0; i < 2; i++) {
      this.send(i, {
        type: 'game_start', gameType: 'airhockey', yourIndex: i, opponentName: this.players[1 - i].name,
        friendly: true, bet: 0, isRematch, mode: this.mode,
        field: { w: W, h: H, puckR: PUCK_R, paddleR: PADDLE_R, goalTop: GOAL_TOP, goalBottom: GOAL_BOTTOM },
      });
    }
    this.lastTime = Date.now();
    this.stepAccum = 0;
    clearInterval(this.loop);
    clearInterval(this.snapshotLoop);
    this.loop = setInterval(() => this.tick(), 1000 / SIM_HZ);
    this.snapshotLoop = setInterval(() => this.broadcastState(), 1000 / SNAPSHOT_HZ);
    this.servePuck();
  }

  // Input: { action: 'move', x, y } with x and y as fractions of the table (0..1).
  // The target is clamped to the player's own half on the server, so a player
  // can't reach over the centre line.
  handleAction(sessionId, action, payload) {
    if (action !== 'move' || this.phase !== 'playing') return;
    const i = this.indexOf(sessionId);
    if (i === -1) return;
    const x = Number(payload && payload.x);
    const y = Number(payload && payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const minX = i === 0 ? PADDLE_R : HALF + PADDLE_R;
    const maxX = i === 0 ? HALF - PADDLE_R : W - PADDLE_R;
    this.targets[i] = {
      x: Math.max(minX, Math.min(maxX, x * W)),
      y: Math.max(PADDLE_R, Math.min(H - PADDLE_R, y * H)),
    };
  }

  servePuck() {
    const dir = this.serveTowards === 0 ? -1 : 1;
    this.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.paused = true;
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => {
      this.paused = false;
      const angle = (Math.random() * 0.5 - 0.25);
      this.puck.vx = dir * 520 * Math.cos(angle);
      this.puck.vy = 520 * Math.sin(angle);
      this.lastTime = Date.now();
    }, SERVE_PAUSE_MS);
  }

  tick() {
    if (this.phase !== 'playing' || this.tableClosed) return;
    const now = Date.now();
    // Hold the table while someone is disconnected; the grace timer decides.
    if (this.players.some((p) => !p.connected)) { this.lastTime = now; return; }
    this.stepAccum += Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const dt = 1 / SIM_HZ;
    while (this.stepAccum >= dt) {
      this.step(dt);
      this.stepAccum -= dt;
      if (this.phase !== 'playing') break;
    }
  }

  step(dt) {
    // Paddles follow their targets at a capped speed; their velocity is kept for hits.
    for (let i = 0; i < 2; i++) {
      const p = this.paddles[i], t = this.targets[i];
      const dx = t.x - p.x, dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      const maxStep = PADDLE_MAX_SPEED * dt;
      const k = d > maxStep && d > 0 ? maxStep / d : 1;
      const nx = p.x + dx * k, ny = p.y + dy * k;
      p.vx = (nx - p.x) / dt;
      p.vy = (ny - p.y) / dt;
      p.x = nx; p.y = ny;
    }
    if (this.paused) return;
    this.clockMs -= dt * 1000;
    if (this.mode === 'time60' && this.clockMs <= 0) {
      this.clockMs = 0;
      return this.endByClock();
    }

    const puck = this.puck;
    // Slow down a little, then move, capped at the top speed.
    const drag = Math.exp(-PUCK_DRAG * dt);
    puck.vx *= drag; puck.vy *= drag;
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp > PUCK_MAX_SPEED) { puck.vx *= PUCK_MAX_SPEED / sp; puck.vy *= PUCK_MAX_SPEED / sp; }
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    this.collideWalls();
    for (let i = 0; i < 2; i++) this.collidePaddle(i);
    // A paddle hit can push the puck past an edge, so the walls are checked again.
    this.collideWalls();

    // Goal: the puck has fully crossed an edge inside the goal slot.
    const inSlot = puck.y > GOAL_TOP && puck.y < GOAL_BOTTOM;
    if (inSlot && puck.x < -PUCK_R * 0.5) return this.pointTo(1);
    if (inSlot && puck.x > W + PUCK_R * 0.5) return this.pointTo(0);
  }

  collideWalls() {
    const p = this.puck;
    // Side walls, with the goal slot left open on each side. The puck only gets
    // through when its whole edge is inside the slot, so a corner post bounces it.
    const throughSlot = p.y - PUCK_R >= GOAL_TOP && p.y + PUCK_R <= GOAL_BOTTOM;
    if (p.x - PUCK_R < 0 && !throughSlot) {
      p.x = PUCK_R; p.vx = Math.abs(p.vx) * RESTITUTION_WALL; this.events.push('wall');
    }
    if (p.x + PUCK_R > W && !throughSlot) {
      p.x = W - PUCK_R; p.vx = -Math.abs(p.vx) * RESTITUTION_WALL; this.events.push('wall');
    }
    if (p.y - PUCK_R < 0) { p.y = PUCK_R; p.vy = Math.abs(p.vy) * RESTITUTION_WALL; this.events.push('wall'); }
    if (p.y + PUCK_R > H) { p.y = H - PUCK_R; p.vy = -Math.abs(p.vy) * RESTITUTION_WALL; this.events.push('wall'); }
  }

  collidePaddle(i) {
    const p = this.paddles[i], puck = this.puck;
    const dx = puck.x - p.x, dy = puck.y - p.y;
    const dist = Math.hypot(dx, dy);
    const minDist = PUCK_R + PADDLE_R;
    if (dist >= minDist || dist === 0) return;
    // Push the puck out along the contact normal, then bounce it off the paddle.
    const nx = dx / dist, ny = dy / dist;
    puck.x = p.x + nx * minDist;
    puck.y = p.y + ny * minDist;
    const rvx = puck.vx - p.vx, rvy = puck.vy - p.vy;
    const along = rvx * nx + rvy * ny;
    if (along < 0) {
      puck.vx -= (1 + RESTITUTION_PADDLE) * along * nx;
      puck.vy -= (1 + RESTITUTION_PADDLE) * along * ny;
    }
    // A moving paddle gives the puck some of its speed, so a smash is faster than a tap.
    puck.vx += p.vx * PADDLE_IMPART;
    puck.vy += p.vy * PADDLE_IMPART;
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp > PUCK_MAX_SPEED) { puck.vx *= PUCK_MAX_SPEED / sp; puck.vy *= PUCK_MAX_SPEED / sp; }
    this.events.push('hit' + i);
  }

  // A goal. The player who conceded serves next.
  pointTo(scorer) {
    this.score[scorer]++;
    this.events.push('goal' + scorer);
    this.serveTowards = 1 - scorer;
    this.broadcastState();
    const winner = this.checkWinner();
    if (winner !== null) return this.finish(winner, 'score');
    this.servePuck();
  }

  // Returns the winner index, or null while the game goes on.
  checkWinner() {
    const [a, b] = this.score;
    if (this.mode === 'score7') {
      if (a >= SCORE_TO) return 0;
      if (b >= SCORE_TO) return 1;
    }
    if (this.mode === 'best5') {
      if (a >= BEST_OF_WINS) return 0;
      if (b >= BEST_OF_WINS) return 1;
    }
    return null;
  }

  endByClock() {
    const [a, b] = this.score;
    const winner = a === b ? -1 : a > b ? 0 : 1;   // -1 is a draw
    this.finish(winner, 'clock');
  }

  finish(winner, reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.winner = winner;
    clearInterval(this.loop);
    clearInterval(this.snapshotLoop);
    clearTimeout(this.pauseTimer);
    this.broadcast({ type: 'airhockey_over', winner, score: this.score, reason, mode: this.mode });
    this.broadcastState();
    this.beginRematchWindow();
  }

  // Snapshot: compact arrays keep the message small at 60 a second.
  broadcastState() {
    if (this.phase === 'over') return;
    const msg = {
      type: 'airhockey_state',
      t: Date.now(),
      puck: [round(this.puck.x), round(this.puck.y)],
      paddles: this.paddles.map((p) => [round(p.x), round(p.y)]),
      score: this.score.slice(),
      clock: Math.max(0, Math.round(this.clockMs)),
      paused: this.paused,
      events: this.events.splice(0),
    };
    this.broadcast(msg);
  }

  forfeitIndex(i, reason) {
    if (this.phase === 'over' || this.tableClosed) return;
    this.finish(1 - i, reason);
  }

  resync(i) {
    this.send(i, {
      type: 'resync', gameType: 'airhockey', yourIndex: i, opponentName: this.players[1 - i].name,
      mode: this.mode, phase: this.phase, winner: this.winner, score: this.score.slice(),
      puck: [round(this.puck.x), round(this.puck.y)], paddles: this.paddles.map((p) => [round(p.x), round(p.y)]),
      clock: Math.max(0, Math.round(this.clockMs)), paused: this.paused,
      field: { w: W, h: H, puckR: PUCK_R, paddleR: PADDLE_R, goalTop: GOAL_TOP, goalBottom: GOAL_BOTTOM },
    });
  }

  clearTimers() {
    clearInterval(this.loop);
    clearInterval(this.snapshotLoop);
    clearTimeout(this.pauseTimer);
  }
}

function round(v) { return Math.round(v * 10) / 10; }

module.exports = { AirHockeyGame, MODES, W, H, PUCK_R, PADDLE_R, GOAL_TOP, GOAL_BOTTOM };

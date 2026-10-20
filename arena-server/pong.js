/**
 * Pong 1v1 for the Arena. Friendly only (no Strubles change hands), so there
 * is nothing to charge or refund here; the shared ArenaGame handles the
 * connection grace period, rematch window and table cleanup.
 *
 * The server owns the physics: paddles move toward the target each player
 * sends, and the ball bounces, scores and serves on the server. The client
 * only draws what it is told, so a player cannot teleport a paddle or change
 * the score.
 *
 * Field coordinates are logical pixels (W x H). Clients receive positions and
 * draw them scaled to whatever size their screen gives the field.
 */

const ArenaGame = require('./game-base');

const W = 800;
const H = 500;
const PADDLE_H = 96;
const PADDLE_W = 12;
const PADDLE_X = [24, W - 24 - PADDLE_W];   // left (player 0) and right (player 1)
const BALL_R = 8;
const WIN_SCORE = 5;
const TICK_HZ = 60;
const STATE_EVERY = 2;                       // broadcast at 30 Hz
const PADDLE_SPEED = 620;                    // px per second toward the target
const SERVE_SPEED = 340;
const MAX_BALL_SPEED = 760;
const SPEEDUP = 1.05;                        // per paddle hit
const COUNTDOWN_MS = 1200;                   // pause before each serve

class PongGame extends ArenaGame {
  constructor(tableId, playerA, playerB, balance, opts = {}) {
    super(tableId, playerA, playerB, balance, opts);
    this.gameType = 'pong';
    this.loop = null;
    this.countdownTimer = null;
    this.frame = 0;
    this.events = [];
    this.phase = 'lobby';
    this.resetForRematch();
  }

  resetForRematch() {
    this.score = [0, 0];
    this.paddles = [H / 2, H / 2];
    this.targets = [H / 2, H / 2];
    this.winner = null;
    this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.serveTowards = Math.random() < 0.5 ? 0 : 1;
    this.countingDown = false;
  }

  async begin(isRematch = false) {
    this.resetForRematch();
    this.phase = 'playing';
    for (let i = 0; i < 2; i++) {
      this.send(i, {
        type: 'game_start', gameType: 'pong', yourIndex: i, opponentName: this.players[1 - i].name,
        friendly: true, bet: 0, isRematch, field: { w: W, h: H, paddleH: PADDLE_H, paddleW: PADDLE_W, ballR: BALL_R, winScore: WIN_SCORE },
      });
    }
    this.startLoop();
    this.serve();
  }

  startLoop() {
    clearInterval(this.loop);
    this.lastTick = Date.now();
    this.loop = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  // Each player's move: { action: 'move', y } with y as a 0..1 fraction of the field.
  handleAction(sessionId, action, payload) {
    if (action !== 'move' || this.phase !== 'playing') return;
    const i = this.indexOf(sessionId);
    if (i === -1) return;
    const y = Number(payload && payload.y);
    if (!Number.isFinite(y)) return;
    this.targets[i] = Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, y * H));
  }

  serve() {
    this.countingDown = true;
    const dir = this.serveTowards === 0 ? -1 : 1;
    this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    clearTimeout(this.countdownTimer);
    this.countdownTimer = setTimeout(() => {
      this.countingDown = false;
      const angle = (Math.random() * 0.6 - 0.3);       // up to ~17 degrees off horizontal
      this.ball.vx = dir * SERVE_SPEED * Math.cos(angle);
      this.ball.vy = SERVE_SPEED * Math.sin(angle);
    }, COUNTDOWN_MS);
  }

  tick() {
    if (this.phase !== 'playing' || this.tableClosed) return;
    // Hold the game while someone is disconnected; the grace timer decides.
    if (this.players.some((p) => !p.connected)) { this.lastTick = Date.now(); return; }
    const now = Date.now();
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;

    // Paddles move toward their targets at a capped speed.
    for (let i = 0; i < 2; i++) {
      const d = this.targets[i] - this.paddles[i];
      const step = PADDLE_SPEED * dt;
      this.paddles[i] += Math.max(-step, Math.min(step, d));
    }

    if (!this.countingDown) this.moveBall(dt);

    this.frame++;
    if (this.frame % STATE_EVERY === 0) this.broadcastState();
  }

  moveBall(dt) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Top and bottom walls.
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); this.events.push('wall'); }
    if (b.y + BALL_R > H) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy); this.events.push('wall'); }

    // Paddles: the ball has to cross the paddle's face this tick and be within its height.
    for (let i = 0; i < 2; i++) {
      const face = i === 0 ? PADDLE_X[0] + PADDLE_W : PADDLE_X[1];
      const towardsPaddle = i === 0 ? b.vx < 0 : b.vx > 0;
      const crossed = i === 0 ? (b.x - BALL_R <= face) : (b.x + BALL_R >= face);
      if (!towardsPaddle || !crossed) continue;
      const top = this.paddles[i] - PADDLE_H / 2;
      if (b.y < top - BALL_R || b.y > top + PADDLE_H + BALL_R) continue;
      // Hit: send the ball back, angled by where it struck the paddle.
      const offset = Math.max(-1, Math.min(1, (b.y - this.paddles[i]) / (PADDLE_H / 2)));
      const speed = Math.min(MAX_BALL_SPEED, Math.hypot(b.vx, b.vy) * SPEEDUP);
      const angle = offset * (Math.PI / 4);
      b.vx = (i === 0 ? 1 : -1) * speed * Math.cos(angle);
      b.vy = speed * Math.sin(angle);
      b.x = face + (i === 0 ? BALL_R : -BALL_R);
      this.events.push('paddle' + i);
    }

    // Goals: past a side's paddle line with no paddle to stop it.
    if (b.x < -BALL_R) return this.pointTo(1);
    if (b.x > W + BALL_R) return this.pointTo(0);
  }

  pointTo(scorer) {
    this.score[scorer]++;
    this.events.push('score' + scorer);
    this.broadcastState();
    if (this.score[scorer] >= WIN_SCORE) return this.finish(scorer, 'score');
    this.serveTowards = 1 - scorer;   // whoever conceded the point serves
    this.serve();
  }

  finish(winner, reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.winner = winner;
    clearInterval(this.loop);
    clearTimeout(this.countdownTimer);
    this.broadcast({ type: 'pong_over', winner, score: this.score, reason });
    this.broadcastState();
    this.beginRematchWindow();
  }

  broadcastState() {
    const msg = {
      type: 'pong_state',
      ball: { x: this.ball.x, y: this.ball.y },
      paddles: this.paddles.slice(),
      score: this.score.slice(),
      serving: this.countingDown,
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
      type: 'resync', gameType: 'pong', yourIndex: i, opponentName: this.players[1 - i].name,
      phase: this.phase, winner: this.winner, score: this.score.slice(),
      ball: { x: this.ball.x, y: this.ball.y }, paddles: this.paddles.slice(), serving: this.countingDown,
      field: { w: W, h: H, paddleH: PADDLE_H, paddleW: PADDLE_W, ballR: BALL_R, winScore: WIN_SCORE },
    });
  }

  clearTimers() {
    clearInterval(this.loop);
    clearTimeout(this.countdownTimer);
  }
}

module.exports = { PongGame };

/**
 * Tetris 1v1 for the Arena. Friendly only (nothing is staked), so nothing is
 * charged or refunded. The shared ArenaGame handles the connection grace period,
 * the rematch window and table cleanup.
 *
 * Staked matches: each player's stake is charged when the match starts (the
 * shared ArenaGame does this), and the winner takes the pot less a 5% rake,
 * the same as blackjack and battleship. Friendly matches (bet 0) pay nothing.
 *
 * Each player runs their own board on the shared engine (public/tetris/engine.js),
 * so moves feel instant. The server does the match rules:
 *   - both players get the same seed, so they get the same pieces in the same order
 *   - every line a player clears sends one grey garbage line to the opponent, with
 *     one hole in it so the receiver can clear it. The server builds the lines, so a
 *     client can't choose their contents or their hole
 *   - the opponent sees a small snapshot of the board, relayed as is for display
 *   - a top-out, a leave or a dropped connection that is not restored ends the match
 *
 * Rows and snapshots are validated before they are relayed: a row must be full
 * (cleared rows always are), every cell a piece letter, and a snapshot exactly 20
 * rows of 10 characters.
 */

const crypto = require('crypto');
const ArenaGame = require('./game-base');

const COLS = 10;
const VISIBLE = 20;
const MAX_ROWS_PER_CLEAR = 4;
const SNAPSHOT_ROW_RE = /^[.IOTSZJLG]{10}$/;

// The number of lines a clear sent: 1 to 4. Returns null if it isn't one of those.
function validLines(n) {
  return Number.isInteger(n) && n >= 1 && n <= MAX_ROWS_PER_CLEAR ? n : null;
}

// One grey garbage line: full, with a single random hole so it can be cleared.
function greyLine() {
  const row = Array(COLS).fill('G');
  row[crypto.randomInt(COLS)] = null;
  return row;
}

// A snapshot of the visible board: exactly 20 strings of 10 characters.
function validSnapshot(rows) {
  if (!Array.isArray(rows) || rows.length !== VISIBLE) return null;
  for (const row of rows) {
    if (typeof row !== 'string' || !SNAPSHOT_ROW_RE.test(row)) return null;
  }
  return rows;
}

function validScore(n) {
  return Number.isSafeInteger(n) && n >= 0 && n < 1e10 ? n : 0;
}

class TetrisGame extends ArenaGame {
  constructor(tableId, playerA, playerB, balance, opts = {}) {
    super(tableId, playerA, playerB, balance, opts);
    this.gameType = 'tetris';
    this.rake = 0.05;   // 5% rake on staked games only
    this.resetForRematch();
  }

  resetForRematch() {
    this.phase = 'playing';
    this.winner = null;
    this.reason = null;
    this.seed = crypto.randomInt(1, 2147483647);
    this.scores = [{ score: 0, lines: 0 }, { score: 0, lines: 0 }];
  }

  // The constructor and startRematch() both call resetForRematch() before this runs.
  async begin(isRematch = false) {
    for (let i = 0; i < 2; i++) {
      this.send(i, {
        type: 'game_start', gameType: 'tetris', yourIndex: i, opponentName: this.players[1 - i].name,
        friendly: this.friendly, bet: this.bet, isRematch, seed: this.seed,
      });
    }
  }

  // Input from a player. The payload is the whole message: cleared rows, a board
  // snapshot, or a top-out with the final score.
  handleAction(sessionId, action, msg) {
    if (this.phase !== 'playing') return;
    const i = this.indexOf(sessionId);
    if (i === -1) return;
    const other = 1 - i;

    if (action === 'cleared') {
      const lines = validLines(msg.lines);
      if (!lines) return;
      this.scores[i].lines += lines;
      const rows = Array.from({ length: lines }, greyLine);
      this.send(other, { type: 'tetris_garbage', rows });
    } else if (action === 'board') {
      const rows = validSnapshot(msg.rows);
      if (!rows) return;
      this.send(other, { type: 'tetris_board', rows });
    } else if (action === 'topout') {
      this.scores[i] = { score: validScore(msg.score), lines: validScore(msg.lines) };
      this.finish(other, 'topout');
    }
  }

  finish(winner, reason) {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    this.winner = winner;
    this.reason = reason;
    // The pot is both stakes. The winner gets it less the rake, and the result says how much.
    const pot = this.bet * 2;
    const payout = this.friendly ? 0 : pot - Math.floor(pot * this.rake);
    this.broadcast({ type: 'tetris_over', winner, reason, scores: this.scores, payout });
    this.beginRematchWindow();
    if (payout > 0) this.payWinner(winner, payout);
  }

  async payWinner(winner, payout) {
    try {
      this.pushBalance(winner, await this.balance.creditPayout(this.players[winner].userId, payout));
    } catch (e) {
      console.error('[tetris] payout failed:', e.message);
    }
  }

  forfeitIndex(i, reason) {
    if (this.phase !== 'playing' || this.tableClosed) return;
    this.finish(1 - i, reason);
  }

  // A player who reconnects keeps their own board (the page never reloaded), so only
  // the match state is sent. A reloaded page has no board, so it leaves.
  resync(i) {
    this.send(i, {
      type: 'resync', gameType: 'tetris', yourIndex: i, opponentName: this.players[1 - i].name,
      phase: this.phase, winner: this.winner, reason: this.reason, seed: this.seed, scores: this.scores,
    });
  }
}

module.exports = { TetrisGame, validLines, validSnapshot, greyLine };

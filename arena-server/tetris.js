/**
 * Tetris 1v1 for the Arena. Friendly only (nothing is staked), so nothing is
 * charged or refunded. The shared ArenaGame handles the connection grace period,
 * the rematch window and table cleanup.
 *
 * Each player runs their own board on the shared engine (public/tetris/engine.js),
 * so moves feel instant. The server does the match rules:
 *   - both players get the same seed, so they get the same pieces in the same order
 *   - rows a player clears go to the opponent (Flatris's versus transfer), with one
 *     hole punched in each row so the receiver can clear it; the server does the
 *     punching, so a client can't choose the hole
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
const CELL_RE = /^[IOTSZJL]$/;
const SNAPSHOT_ROW_RE = /^[.IOTSZJL]{10}$/;

// Cleared rows, as the client sends them: arrays of 10 piece letters. Returns null if invalid.
function validClearedRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS_PER_CLEAR) return null;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== COLS) return null;
    for (const cell of row) {
      if (typeof cell !== 'string' || !CELL_RE.test(cell)) return null;
    }
  }
  return rows;
}

// Takes full rows and punches one random hole in each, so they can be cleared on arrival.
function toGarbage(rows) {
  return rows.map((row) => {
    const copy = row.slice();
    copy[crypto.randomInt(COLS)] = null;
    return copy;
  });
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
        friendly: true, bet: 0, isRematch, seed: this.seed,
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
      const rows = validClearedRows(msg.rows);
      if (!rows) return;
      this.scores[i].lines += rows.length;
      this.send(other, { type: 'tetris_garbage', rows: toGarbage(rows) });
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
    this.broadcast({ type: 'tetris_over', winner, reason, scores: this.scores });
    this.beginRematchWindow();
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

module.exports = { TetrisGame, validClearedRows, validSnapshot, toGarbage };

/**
 * Behaviour shared by every Arena game: safe sends, charging and refunding
 * stakes, surviving a dropped connection, and the rematch window.
 *
 * Both games used to carry their own copies of this, and the copies had
 * drifted: Blackjack's rematch timer did nothing when exactly one player had
 * accepted (leaving them waiting forever), a failed start could keep a bet that
 * had already been taken, and any dropped connection was an instant forfeit,
 * which on a phone means locking the screen loses the game.
 *
 * Subclasses provide:
 *   async begin()                 deal / begin a round (stakes already charged)
 *   forfeitIndex(i, reason)       the player at index i loses; ends the game
 *   resync(i)                     send player i everything needed to rebuild their view
 *   resetForRematch()             clear per-round state
 */

const DEFAULT_TIMING = {
  graceMs: 30000,    // how long a dropped player has to come back before forfeiting
  rematchMs: 30000,  // how long the rematch prompt stays open
};

class ArenaGame {
  constructor(tableId, playerA, playerB, balanceManager, opts = {}) {
    this.tableId = tableId;
    this.balance = balanceManager;
    this.timing = Object.assign({}, DEFAULT_TIMING, opts.timing || {});
    this.players = [playerA, playerB];
    this.players.forEach((p) => { p.connected = true; p.graceTimer = null; });
    this.bet = playerA.bet;
    this.charged = [false, false];
    this.rematchAccepted = [false, false];
    this.rematchTimer = null;
    this.tableClosed = false;
    this.roundOver = false;
    this.closeTable = null; // set by the manager so a game can remove itself
  }

  get friendly() { return this.bet === 0; }

  indexOf(sessionId) { return this.players.findIndex((p) => p.sessionId === sessionId); }

  // ws.send on a socket that has gone away must never throw into game logic:
  // that is how one dead connection used to be able to break the other
  // player's turn.
  send(i, msg) {
    const p = this.players[i];
    if (!p || !p.ws || p.ws.readyState !== 1) return;
    try { p.ws.send(JSON.stringify(msg)); } catch (e) { /* socket died mid-send */ }
  }
  broadcast(msg) { this.send(0, msg); this.send(1, msg); }

  // Tells a player their new authoritative balance. The client used to learn
  // nothing: its local balance stayed stale, and cloud-sync's periodic push of
  // that stale number could overwrite what the server had just deducted or paid
  // out. Friendly games and guests have no balance, so there is nothing to send.
  pushBalance(i, balance) {
    if (Number.isFinite(balance)) this.send(i, { type: 'balance_update', balance });
  }

  // ----- stakes -----
  // Records which players have actually been charged, so that if the second
  // charge fails the first can be handed back instead of silently kept.
  async chargeBets() {
    if (this.friendly) return;
    for (let i = 0; i < 2; i++) {
      const next = await this.balance.deductBet(this.players[i].userId, this.bet);
      this.charged[i] = true;
      this.pushBalance(i, next);
    }
  }
  async refundCharged() {
    for (let i = 0; i < 2; i++) {
      if (!this.charged[i]) continue;
      try { this.pushBalance(i, await this.balance.refundBet(this.players[i].userId, this.bet)); }
      catch (e) { console.error('[refund] failed for', this.players[i].userId, e.message); }
      this.charged[i] = false;
    }
  }
  async start() {
    try {
      await this.chargeBets();
    } catch (e) {
      await this.refundCharged();
      throw e;
    }
    await this.begin();
  }

  // ----- dropped connections -----
  // Called by the manager when a player's socket closes. A game in progress
  // waits for them to come back; a finished game just closes its rematch window.
  disconnect(sessionId) {
    const i = this.indexOf(sessionId);
    if (i === -1 || this.tableClosed) return;
    const p = this.players[i];
    p.connected = false;
    if (this.roundOver) {
      // Nothing left to resume: treat leaving the result screen as declining.
      this.declineRematch(sessionId);
      return;
    }
    this.send(1 - i, { type: 'opponent_away', graceMs: this.timing.graceMs });
    clearTimeout(p.graceTimer);
    p.graceTimer = setTimeout(() => {
      Promise.resolve(this.forfeitIndex(i, 'disconnect')).catch((e) => console.error('[grace] forfeit failed:', e.message));
    }, this.timing.graceMs);
  }

  reconnect(i, sessionId, ws) {
    const p = this.players[i];
    clearTimeout(p.graceTimer);
    p.graceTimer = null;
    p.sessionId = sessionId;
    p.ws = ws;
    p.connected = true;
    this.send(1 - i, { type: 'opponent_back' });
    this.resync(i);
  }

  // An explicit "leave": a loss mid-round, or just declining once it is over.
  forfeit(sessionId) {
    const i = this.indexOf(sessionId);
    if (i === -1) return Promise.resolve();
    if (this.roundOver) { this.declineRematch(sessionId); return Promise.resolve(); }
    return Promise.resolve(this.forfeitIndex(i, 'left'));
  }

  // ----- rematch window (shared) -----
  beginRematchWindow() {
    this.roundOver = true;
    this.rematchAccepted = [false, false];
    clearTimeout(this.rematchTimer);
    this.broadcast({ type: 'show_rematch_prompt' });
    this.rematchTimer = setTimeout(() => this.rematchTimedOut(), this.timing.rematchMs);
  }

  async handleRematchResponse(sessionId) {
    const i = this.indexOf(sessionId);
    if (i === -1 || !this.roundOver || this.tableClosed || this.rematchAccepted[i]) return;
    this.rematchAccepted[i] = true;
    this.send(1 - i, { type: 'rematch_opponent_accepted' });
    if (this.rematchAccepted[0] && this.rematchAccepted[1]) {
      clearTimeout(this.rematchTimer);
      await this.startRematch();
    }
  }

  async startRematch() {
    this.roundOver = false;
    this.rematchAccepted = [false, false];
    this.charged = [false, false];
    try {
      await this.chargeBets();
    } catch (e) {
      await this.refundCharged();
      this.broadcast({ type: 'rematch_failed', message: 'Insufficient Strubles to rematch' });
      setTimeout(() => this.closeWith('ready_for_queue'), 1500);
      return;
    }
    this.resetForRematch();
    await this.begin(true);
  }

  declineRematch(sessionId) {
    if (this.tableClosed) return;
    const i = this.indexOf(sessionId);
    if (i !== -1) this.send(1 - i, { type: 'rematch_declined' });
    this.closeWith('ready_for_queue');
  }

  // Previously, if exactly one player had accepted when the timer ran out,
  // nothing happened at all and they waited forever.
  rematchTimedOut() {
    if (this.tableClosed || !this.roundOver) return;
    this.rematchAccepted.forEach((a, i) => { if (a) this.send(i, { type: 'rematch_declined', reason: 'timeout' }); });
    this.closeWith('ready_for_queue');
  }

  closeWith(finalMessage) {
    if (this.tableClosed) return;
    if (finalMessage) this.broadcast({ type: finalMessage });
    this.close();
  }

  // Idempotent: clears every timer the game owns and removes the table.
  close() {
    this.tableClosed = true;
    clearTimeout(this.rematchTimer);
    this.players.forEach((p) => clearTimeout(p.graceTimer));
    this.clearTimers();
    if (typeof this.closeTable === 'function') this.closeTable();
  }
  clearTimers() {}

  isFinished() { return this.tableClosed; }
}

module.exports = ArenaGame;

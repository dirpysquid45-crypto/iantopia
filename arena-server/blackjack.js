const fs = require('fs');
const path = require('path');

// The engine is a UMD file shared with the browser. `require()` of it only works
// when no ancestor package.json declares "type": "module" -- true inside the
// Docker image (it is mounted at /public) but not in the repo checkout, where
// the site's own package.json does. Reading and evaluating it directly behaves
// identically in both places.
function loadEngine() {
  const file = path.join(__dirname, '..', 'public', 'blackjack-engine.js');
  const mod = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(file, 'utf8'))(mod, mod.exports);
  return mod.exports;
}
const Engine = loadEngine();
const ArenaGame = require('./game-base');

const TIMING = {
  handMs: 60000, // a hand that nobody finishes is stood on automatically
};

class BlackjackGame extends ArenaGame {
  constructor(tableId, playerA, playerB, balanceManager, opts = {}) {
    super(tableId, playerA, playerB, balanceManager, opts);
    this.timing = Object.assign({}, TIMING, this.timing);
    this.db = opts.db || null;
    this.makeDeck = opts.makeDeck || Engine.makeDeck; // overridable so tests can fix the cards
    this.rake = 0.05; // 5% rake on staked games only
    this.resetForRematch();
  }

  resetForRematch() {
    this.deck = null;
    this.hands = [[], []];
    this.done = [false, false];
    this.handTimer = null;
    this.handDeadline = null;
    this.lastResult = null;
  }

  clearTimers() { clearTimeout(this.handTimer); }

  // Per-player view of a round in progress. A player sees all of their own hand
  // but only the first two cards of the opponent's, so neither can read the
  // other's current total.
  startMessage(i, isRematch, resync = false) {
    return {
      type: 'game_start', gameType: 'blackjack', tableId: this.tableId,
      yourHand: this.hands[i],
      opponentVisibleCards: this.hands[1 - i].slice(0, 2),
      yourBustLimit: Engine.getBustLimit(this.hands[i]),
      opponentBustLimit: Engine.getBustLimit(this.hands[1 - i]),
      yourIndex: i, opponentName: this.players[1 - i].name,
      friendly: this.friendly, bet: this.bet, done: this.done,
      handDeadline: this.handDeadline, isRematch, resync,
    };
  }

  async begin(isRematch = false) {
    this.deck = this.makeDeck();
    this.hands = [[this.deck.pop(), this.deck.pop()], [this.deck.pop(), this.deck.pop()]];
    this.done = [false, false];
    this.armHandTimer();
    for (let i = 0; i < 2; i++) this.send(i, this.startMessage(i, isRematch));
  }

  // A player who walks away from the table without leaving the page used to
  // hold both stakes hostage forever.
  armHandTimer() {
    clearTimeout(this.handTimer);
    this.handDeadline = Date.now() + this.timing.handMs;
    this.handTimer = setTimeout(() => {
      this.onHandTimeout().catch((e) => console.error('[blackjack] hand timeout failed:', e.message));
    }, this.timing.handMs);
  }

  async onHandTimeout() {
    if (this.tableClosed || this.roundOver) return;
    for (let i = 0; i < 2; i++) this.done[i] = true;
    this.pushUpdate();
    await this.resolve();
  }

  pushUpdate() {
    for (let i = 0; i < 2; i++) {
      this.send(i, {
        type: 'game_update', yourHand: this.hands[i],
        opponentVisibleCards: this.hands[1 - i].slice(0, 2), done: this.done,
      });
    }
  }

  async handleAction(sessionId, action) {
    const i = this.indexOf(sessionId);
    if (i === -1 || this.roundOver || this.done[i]) return;
    if (action === 'hit') {
      if (!this.deck.length) this.done[i] = true;
      else {
        this.hands[i].push(this.deck.pop());
        if (Engine.isBust(this.hands[i])) this.done[i] = true;
      }
    } else if (action === 'stand') {
      this.done[i] = true;
    } else {
      return; // unknown action: ignore, don't broadcast a no-op update
    }
    this.pushUpdate();
    if (this.done[0] && this.done[1]) await this.resolve();
  }

  async resolve() {
    if (this.roundOver) return; // a hand can only settle once
    clearTimeout(this.handTimer);
    const val = this.hands.map((h) => Engine.handValue(h));
    const bust = this.hands.map((h) => Engine.isBust(h));

    let winner = 'push';
    if (bust[0] && bust[1]) winner = 'push';
    else if (bust[0]) winner = 1;
    else if (bust[1]) winner = 0;
    else if (val[0] > val[1]) winner = 0;
    else if (val[1] > val[0]) winner = 1;

    const pot = this.bet * 2;
    const raked = this.friendly ? 0 : Math.floor(pot * this.rake);
    const payout = pot - raked; // 0 in a friendly game, since bet is 0
    let results;
    try {
      if (winner === 'push') {
        results = [{ result: 'push', payout: this.bet }, { result: 'push', payout: this.bet }];
        for (let i = 0; i < 2; i++) {
          if (this.bet > 0) this.pushBalance(i, await this.balance.creditPayout(this.players[i].userId, this.bet));
        }
      } else {
        results = [{ result: 'loss', payout: 0 }, { result: 'loss', payout: 0 }];
        results[winner] = { result: 'win', payout };
        if (payout > 0) this.pushBalance(winner, await this.balance.creditPayout(this.players[winner].userId, payout));
      }
    } catch (e) {
      console.error('[blackjack] payout failed:', e.message);
      results = results || [{ result: 'loss', payout: 0 }, { result: 'loss', payout: 0 }];
    }

    this.lastResult = { type: 'game_result', results, hands: this.hands, friendly: this.friendly };
    this.broadcast(this.lastResult);
    this.beginRematchWindow();
  }

  async forfeitIndex(i, reason = 'left') {
    if (this.tableClosed || this.roundOver) return;
    this.roundOver = true; // nothing can settle this table a second time
    clearTimeout(this.handTimer);
    const winner = 1 - i;
    const payout = this.friendly ? 0 : this.bet * 2 - Math.floor(this.bet * 2 * this.rake);
    if (payout > 0) {
      try { this.pushBalance(winner, await this.balance.creditPayout(this.players[winner].userId, payout)); }
      catch (e) { console.error('[blackjack] forfeit payout failed:', e.message); }
    }
    this.send(winner, { type: 'opponent_disconnected', winner, reason });
    this.close();
  }

  resync(i) {
    if (this.roundOver && this.lastResult) {
      this.send(i, this.lastResult);
      this.send(i, { type: 'show_rematch_prompt' });
      if (this.rematchAccepted[1 - i]) this.send(i, { type: 'rematch_opponent_accepted' });
      return;
    }
    this.send(i, this.startMessage(i, false, true));
  }
}

module.exports = BlackjackGame;

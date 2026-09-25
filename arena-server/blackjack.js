const Engine = require('../public/blackjack-engine.js');

class BlackjackGame {
  constructor(tableId, playerA, playerB, balanceManager, db) {
    this.tableId = tableId;
    this.players = [playerA, playerB];
    this.balanceManager = balanceManager;
    this.db = db;
    this.deck = null;
    this.hands = [[], []];
    this.done = [false, false];
    this.rake = 0.05; // 5% rake
  }

  async start() {
    // Deduct bets from both players
    const bet = this.players[0].bet;
    await this.balanceManager.deductBet(this.players[0].userId, bet);
    await this.balanceManager.deductBet(this.players[1].userId, bet);

    // Deal
    this.deck = Engine.makeDeck();
    this.hands[0] = [this.deck.pop(), this.deck.pop()];
    this.hands[1] = [this.deck.pop(), this.deck.pop()];

    // Send initial state
    this.broadcast({
      type: 'game_start',
      hands: this.hands,
      yourIndex: null // Client doesn't need this on initial, but structure it anyway
    });
  }

  async handleAction(sessionId, action) {
    const playerIndex = this.players.findIndex(p => p.sessionId === sessionId);
    if (playerIndex === -1 || this.done[playerIndex]) return;

    if (action === 'hit') {
      this.hands[playerIndex].push(this.deck.pop());
      if (Engine.isBust(this.hands[playerIndex])) {
        this.done[playerIndex] = true;
      }
    } else if (action === 'stand') {
      this.done[playerIndex] = true;
    }

    this.broadcast({ type: 'game_update', hands: this.hands, done: this.done });

    if (this.done[0] && this.done[1]) {
      await this.resolve();
    }
  }

  async resolve() {
    const val0 = Engine.handValue(this.hands[0]);
    const val1 = Engine.handValue(this.hands[1]);
    const bust0 = Engine.isBust(this.hands[0]);
    const bust1 = Engine.isBust(this.hands[1]);

    let winner = null;
    if (bust0 && bust1) {
      winner = 'push';
    } else if (bust0) {
      winner = 1;
    } else if (bust1) {
      winner = 0;
    } else if (val0 > val1) {
      winner = 0;
    } else if (val1 > val0) {
      winner = 1;
    } else {
      winner = 'push';
    }

    const bet = this.players[0].bet;
    const raked = Math.floor(bet * 2 * this.rake);
    const payout = (bet * 2) - raked;

    let results = [{ result: 'loss', payout: 0 }, { result: 'loss', payout: 0 }];
    if (winner === 'push') {
      results[0] = { result: 'push', payout: bet };
      results[1] = { result: 'push', payout: bet };
      await this.balanceManager.creditPayout(this.players[0].userId, bet);
      await this.balanceManager.creditPayout(this.players[1].userId, bet);
    } else {
      results[winner] = { result: 'win', payout };
      results[1 - winner] = { result: 'loss', payout: 0 };
      await this.balanceManager.creditPayout(this.players[winner].userId, payout);
    }

    this.broadcast({ type: 'game_result', results, hands: this.hands });

    // Clean up
    setTimeout(() => {
      this.players[0].ws.send(JSON.stringify({ type: 'ready_for_queue' }));
      this.players[1].ws.send(JSON.stringify({ type: 'ready_for_queue' }));
    }, 3000);
  }

  forfeit(sessionId) {
    const playerIndex = this.players.findIndex(p => p.sessionId === sessionId);
    if (playerIndex === -1) return;
    const otherIndex = 1 - playerIndex;
    const bet = this.players[0].bet;
    const raked = Math.floor(bet * 2 * this.rake);
    const payout = (bet * 2) - raked;
    this.balanceManager.creditPayout(this.players[otherIndex].userId, payout);
    this.broadcast({ type: 'opponent_disconnected', winner: otherIndex });
  }

  broadcast(msg) {
    this.players[0].ws.send(JSON.stringify(msg));
    this.players[1].ws.send(JSON.stringify(msg));
  }
}

module.exports = BlackjackGame;

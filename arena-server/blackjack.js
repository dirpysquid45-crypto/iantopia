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
    this.rematchAccepted = [false, false];
    this.rematchTimeout = null;
    // Only true once this table will NEVER see another message (timeout-
    // to-queue or an explicit decline) -- NOT once a hand resolves. The
    // previous isFinished() (done[0] && done[1]) was true the instant a
    // hand ended, which made manager.js delete this table from
    // `this.tables` right as the rematch prompt went out, so a later
    // 'rematch_accept' could never find it again (manager.js's handler
    // loops `this.tables.values()` and silently finds nothing).
    this.tableClosed = false;
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

    // Send initial state to each player separately
    // Player 0 sees: their full hand + opponent's visible cards (first 2) + bust limits
    this.sendTo(0, {
      type: 'game_start',
      yourHand: this.hands[0],
      opponentVisibleCards: this.hands[1].slice(0, 2),
      yourBustLimit: Engine.getBustLimit(this.hands[0]),
      opponentBustLimit: Engine.getBustLimit(this.hands[1]),
      yourIndex: 0
    });
    this.sendTo(1, {
      type: 'game_start',
      yourHand: this.hands[1],
      opponentVisibleCards: this.hands[0].slice(0, 2),
      yourBustLimit: Engine.getBustLimit(this.hands[1]),
      opponentBustLimit: Engine.getBustLimit(this.hands[0]),
      yourIndex: 1
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

    // Send each player only their own full hand + opponent's visible cards (first 2 only)
    // This prevents the second player from seeing the first player's current total
    this.sendTo(0, {
      type: 'game_update',
      yourHand: this.hands[0],
      opponentVisibleCards: this.hands[1].slice(0, 2),
      done: this.done
    });
    this.sendTo(1, {
      type: 'game_update',
      yourHand: this.hands[1],
      opponentVisibleCards: this.hands[0].slice(0, 2),
      done: this.done
    });

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

    // Show rematch prompt (30s timeout)
    this.rematchAccepted = [false, false];
    this.broadcast({ type: 'show_rematch_prompt', winner });

    this.rematchTimeout = setTimeout(() => {
      // Auto-decline if no response after 30s
      this.handleRematchResponse('timeout');
    }, 30000);
  }

  async handleRematchResponse(sessionIdOrType) {
    try {
      const isTimeout = sessionIdOrType === 'timeout';
      const playerIndex = isTimeout ? -1 : this.players.findIndex(p => p.sessionId === sessionIdOrType);

      if (!isTimeout && (playerIndex === -1 || this.rematchAccepted[playerIndex])) return;

      if (!isTimeout) {
        this.rematchAccepted[playerIndex] = true;

        // Notify opponent that this player accepted
        const oppIndex = 1 - playerIndex;
        try { this.players[oppIndex].ws.send(JSON.stringify({ type: 'rematch_opponent_accepted' })); } catch {}
      }

      // Check if both players accepted
      if (this.rematchAccepted[0] && this.rematchAccepted[1]) {
        clearTimeout(this.rematchTimeout);
        // Both accepted: start new game
        await this.startRematch();
        return;
      }

      // If timeout and not both accepted, send both to queue
      if (isTimeout && !this.rematchAccepted[0] && !this.rematchAccepted[1]) {
        clearTimeout(this.rematchTimeout);
        this.tableClosed = true;
        try { this.players[0].ws.send(JSON.stringify({ type: 'ready_for_queue' })); } catch {}
        try { this.players[1].ws.send(JSON.stringify({ type: 'ready_for_queue' })); } catch {}
        this.closeTable?.();
      }
    } catch (e) {
      console.error('[rematch] Error in handleRematchResponse:', e.message);
    }
  }

  // Explicit decline (as opposed to the 30s auto-decline above) -- the
  // client's "Back to Lobby" button previously just navigated away with
  // no message at all, so the opponent had no way to find out except by
  // waiting out the full 30s timeout. This tells them immediately.
  declineRematch(sessionId) {
    clearTimeout(this.rematchTimeout);
    this.tableClosed = true;
    const playerIndex = this.players.findIndex(p => p.sessionId === sessionId);
    const oppIndex = playerIndex === -1 ? -1 : 1 - playerIndex;
    if (oppIndex !== -1) {
      try { this.players[oppIndex].ws.send(JSON.stringify({ type: 'rematch_declined' })); } catch {}
    }
    try { this.players[0].ws.send(JSON.stringify({ type: 'ready_for_queue' })); } catch {}
    try { this.players[1].ws.send(JSON.stringify({ type: 'ready_for_queue' })); } catch {}
    this.closeTable?.();
  }

  async startRematch() {
    try {
      // Reset game state
      this.hands = [[], []];
      this.done = [false, false];
      this.rematchAccepted = [false, false];

      // Deduct bets again
      const bet = this.players[0].bet;
      try {
        await this.balanceManager.deductBet(this.players[0].userId, bet);
        await this.balanceManager.deductBet(this.players[1].userId, bet);
      } catch (e) {
        // Insufficient balance for rematch
        this.broadcast({
          type: 'rematch_failed',
          message: 'Insufficient Strubles to rematch'
        });
        setTimeout(() => {
          try { this.players[0].ws.send(JSON.stringify({ type: 'ready_for_queue' })); } catch {}
          try { this.players[1].ws.send(JSON.stringify({ type: 'ready_for_queue' })); } catch {}
        }, 3000);
        return;
      }

      // Deal new cards
      this.deck = Engine.makeDeck();
      this.hands[0] = [this.deck.pop(), this.deck.pop()];
      this.hands[1] = [this.deck.pop(), this.deck.pop()];

      // Send game start
      this.sendTo(0, {
        type: 'game_start',
        yourHand: this.hands[0],
        opponentVisibleCards: this.hands[1].slice(0, 2),
        yourBustLimit: Engine.getBustLimit(this.hands[0]),
        opponentBustLimit: Engine.getBustLimit(this.hands[1]),
        yourIndex: 0,
        isRematch: true
      });
      this.sendTo(1, {
        type: 'game_start',
        yourHand: this.hands[1],
        opponentVisibleCards: this.hands[0].slice(0, 2),
        yourBustLimit: Engine.getBustLimit(this.hands[1]),
        opponentBustLimit: Engine.getBustLimit(this.hands[0]),
        yourIndex: 1,
        isRematch: true
      });
    } catch (e) {
      console.error('[rematch] Error in startRematch:', e.message);
      try { this.players[0].ws.send(JSON.stringify({ type: 'error', message: 'Rematch failed' })); } catch {}
      try { this.players[1].ws.send(JSON.stringify({ type: 'error', message: 'Rematch failed' })); } catch {}
    }
  }

  isFinished() {
    return this.tableClosed;
  }

  forfeit(sessionId) {
    // A disconnect once the current hand has already resolved (its
    // payout already issued by resolve()) means we're in the
    // rematch-prompt window, not mid-hand -- paying out AGAIN here would
    // be a second, unearned payout on the same already-settled bet.
    // Treat it exactly like the player clicking "decline".
    if (this.done[0] && this.done[1]) {
      this.declineRematch(sessionId);
      return;
    }
    const playerIndex = this.players.findIndex(p => p.sessionId === sessionId);
    if (playerIndex === -1) return;
    const otherIndex = 1 - playerIndex;
    const bet = this.players[0].bet;
    const raked = Math.floor(bet * 2 * this.rake);
    const payout = (bet * 2) - raked;
    this.balanceManager.creditPayout(this.players[otherIndex].userId, payout);
    this.broadcast({ type: 'opponent_disconnected', winner: otherIndex });
  }

  sendTo(playerIndex, msg) {
    this.players[playerIndex].ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    this.players[0].ws.send(JSON.stringify(msg));
    this.players[1].ws.send(JSON.stringify(msg));
  }
}

module.exports = BlackjackGame;

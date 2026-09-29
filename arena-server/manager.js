const BlackjackGame = require('./blackjack');
const { BattleshipGame } = require('./battleship');
const BalanceManager = require('./balance');

class Manager {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
    this.balance = new BalanceManager(db);
    this.connections = new Map(); // sessionId -> ws
    this.userSessions = new Map(); // userId -> Set of sessionIds
    this.queue = []; // waiting players
    this.tables = new Map(); // tableId -> game
  }

  registerConnection(userId, sessionId, ws) {
    this.connections.set(sessionId, { userId, ws });
    if (!this.userSessions.has(userId)) this.userSessions.set(userId, new Set());
    this.userSessions.get(userId).add(sessionId);
    // A freshly-connected client has missed every lobby_update broadcast
    // that happened before it existed -- send it the current snapshot
    // directly so the lobby list is populated immediately on connect,
    // not just on the next change.
    const lobbies = this.queue.map(p => ({ queueId: p.queueId, bet: p.bet, gameType: p.gameType }));
    try { ws.send(JSON.stringify({ type: 'lobby_update', lobbies })); } catch {}
  }

  deregisterConnection(userId, sessionId) {
    this.connections.delete(sessionId);
    if (this.userSessions.has(userId)) {
      this.userSessions.get(userId).delete(sessionId);
      if (this.userSessions.get(userId).size === 0) this.userSessions.delete(userId);
    }
    // If in queue, remove and let every other browsing player know that
    // lobby is gone.
    const wasQueued = this.queue.some(p => p.sessionId === sessionId);
    this.queue = this.queue.filter(p => p.sessionId !== sessionId);
    if (wasQueued) this.broadcastLobbies();
    // If in table, forfeit and remove it — guards against a later stray
    // disconnect (either player, after the match already ended) finding
    // the same table again and forfeiting a second time.
    for (const [tableId, game] of this.tables) {
      if (game.players.some(p => p.sessionId === sessionId)) {
        game.forfeit(sessionId);
        this.tables.delete(tableId);
        break;
      }
    }
  }

  async handleMessage(userId, sessionId, msg) {
    const conn = this.connections.get(sessionId);
    if (!conn) return;

    if (msg.type === 'join_queue') {
      await this.joinQueue(userId, sessionId, msg.bet, msg.gameType || 'blackjack', conn.ws);
    } else if (msg.type === 'match_bet') {
      await this.matchBet(userId, sessionId, msg.queueId, conn.ws);
    } else if (msg.type === 'leave_queue') {
      this.leaveQueue(sessionId);
    } else if (msg.type === 'action') {
      await this.handleGameAction(sessionId, msg.action, { x: msg.x, y: msg.y });
    } else if (msg.type === 'place_ships') {
      await this.handleShipPlacement(sessionId, msg.ships);
    }
  }

  async joinQueue(userId, sessionId, bet, gameType, ws) {
    const balance = await this.balance.getBalance(userId);
    if (balance < bet) {
      ws.send(JSON.stringify({ type: 'error', message: 'Insufficient balance' }));
      return;
    }
    const queueId = Math.random().toString(36).substring(7);
    this.queue.push({ queueId, userId, sessionId, bet, gameType, ws });
    ws.send(JSON.stringify({ type: 'status', status: 'queued', queueId }));
    this.broadcastLobbies();
    this.tryMatchmake();
  }

  leaveQueue(sessionId) {
    const wasQueued = this.queue.some(p => p.sessionId === sessionId);
    this.queue = this.queue.filter(p => p.sessionId !== sessionId);
    if (wasQueued) this.broadcastLobbies();
  }

  // A player clicks "Match Bet" on someone else's open lobby, adopting
  // that lobby's exact bet amount rather than needing to type the same
  // number themselves and hope tryMatchmake's exact-equality check finds
  // them -- this is the explicit, visible alternative to that silent
  // auto-match, and the two coexist (typing the identical bet still
  // auto-matches via tryMatchmake, same as before).
  async matchBet(userId, sessionId, queueId, ws) {
    const idx = this.queue.findIndex(p => p.queueId === queueId);
    if (idx === -1) {
      ws.send(JSON.stringify({ type: 'error', message: 'That lobby is no longer available' }));
      return;
    }
    const target = this.queue[idx];
    if (target.sessionId === sessionId) {
      ws.send(JSON.stringify({ type: 'error', message: "You can't match your own lobby" }));
      return;
    }
    const balance = await this.balance.getBalance(userId);
    if (balance < target.bet) {
      ws.send(JSON.stringify({ type: 'error', message: 'Insufficient balance' }));
      return;
    }
    this.queue.splice(idx, 1);
    this.broadcastLobbies();
    const challenger = { userId, sessionId, bet: target.bet, gameType: target.gameType, ws };
    this.startGame(target, challenger).catch((e) => {
      console.error('[startGame] Failed to start matched-bet game:', e.message);
      const errMsg = JSON.stringify({ type: 'error', message: 'Failed to start match: ' + e.message });
      try { target.ws.send(errMsg); } catch {}
      try { challenger.ws.send(errMsg); } catch {}
    });
  }

  // Broadcasts the current open-lobby list to every connected, authed
  // socket. Sent on every queue change (join, leave, matched either way)
  // so a browsing player never has to guess whether a bet amount is
  // actually available -- they see it, live, with a button to join it.
  broadcastLobbies() {
    const lobbies = this.queue.map(p => ({ queueId: p.queueId, bet: p.bet, gameType: p.gameType }));
    const msg = JSON.stringify({ type: 'lobby_update', lobbies });
    for (const { ws } of this.connections.values()) {
      try { ws.send(msg); } catch {}
    }
  }

  tryMatchmake() {
    while (this.queue.length >= 2) {
      const a = this.queue[0];
      const b = this.queue[1];
      if (a.bet === b.bet && a.gameType === b.gameType) {
        const playerA = this.queue.shift();
        const playerB = this.queue.shift();
        this.broadcastLobbies();
        // startGame() is async and this call is intentionally not
        // awaited (tryMatchmake isn't async) -- so it MUST be
        // .catch()'d here. Previously it wasn't: an error from
        // balanceManager.deductBet() (e.g. a stale queue-time balance
        // check followed by a real insufficient-balance failure at
        // match time) became an unhandled promise rejection, which
        // crashes the entire Node process by default -- disconnecting
        // every player on the server, not just the two in this match.
        this.startGame(playerA, playerB).catch((e) => {
          console.error('[startGame] Failed to start match:', e.message);
          const errMsg = JSON.stringify({ type: 'error', message: 'Failed to start match: ' + e.message });
          try { playerA.ws.send(errMsg); } catch {}
          try { playerB.ws.send(errMsg); } catch {}
        });
      } else {
        break;
      }
    }
  }

  async startGame(playerA, playerB) {
    const tableId = Math.random().toString(36).substring(7);
    let game;

    if (playerA.gameType === 'battleship') {
      game = new BattleshipGame(tableId, playerA, playerB, this.balance);
    } else {
      game = new BlackjackGame(tableId, playerA, playerB, this.balance, this.db);
    }

    this.tables.set(tableId, game);
    try {
      await game.start();
    } catch (e) {
      // Table was already registered above -- if start() fails partway
      // (e.g. player A's bet deducted but player B's balance check
      // fails), remove it so it doesn't linger as a broken, unplayable
      // entry that a later disconnect could still match against.
      this.tables.delete(tableId);
      throw e;
    }
  }

  async handleShipPlacement(sessionId, ships) {
    for (const [tableId, game] of this.tables) {
      if (game instanceof BattleshipGame) {
        const playerIndex = game.players.findIndex(p => p.sessionId === sessionId);
        if (playerIndex === -1) continue;

        const result = game.placeShips(playerIndex, ships);
        if (result.valid && game.state === 'battle') {
          // Both players ready, start battle
          game.players[0].ws.send(JSON.stringify({ type: 'battle_start', currentTurn: game.currentTurn }));
          game.players[1].ws.send(JSON.stringify({ type: 'battle_start', currentTurn: game.currentTurn }));
        }
        game.sendTo(playerIndex, { type: 'placement_result', valid: result.valid, error: result.error });
        break;
      }
    }
  }

  async handleGameAction(sessionId, action, payload = {}) {
    for (const [tableId, game] of this.tables) {
      if (game.players.some(p => p.sessionId === sessionId)) {
        await game.handleAction(sessionId, action, payload);
        if (game.isFinished()) {
          this.tables.delete(tableId);
        }
        break;
      }
    }
  }
}

module.exports = Manager;

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
  }

  deregisterConnection(userId, sessionId) {
    this.connections.delete(sessionId);
    if (this.userSessions.has(userId)) {
      this.userSessions.get(userId).delete(sessionId);
      if (this.userSessions.get(userId).size === 0) this.userSessions.delete(userId);
    }
    // If in queue, remove
    this.queue = this.queue.filter(p => p.sessionId !== sessionId);
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
    this.queue.push({ userId, sessionId, bet, gameType, ws });
    ws.send(JSON.stringify({ type: 'status', status: 'queued' }));
    this.tryMatchmake();
  }

  tryMatchmake() {
    while (this.queue.length >= 2) {
      const a = this.queue[0];
      const b = this.queue[1];
      if (a.bet === b.bet && a.gameType === b.gameType) {
        const playerA = this.queue.shift();
        const playerB = this.queue.shift();
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

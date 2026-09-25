const BlackjackGame = require('./blackjack');
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
    // If in table, forfeit
    for (const [tableId, game] of this.tables) {
      if (game.players.some(p => p.sessionId === sessionId)) {
        game.forfeit(sessionId);
      }
    }
  }

  async handleMessage(userId, sessionId, msg) {
    const conn = this.connections.get(sessionId);
    if (!conn) return;

    if (msg.type === 'join_queue') {
      await this.joinQueue(userId, sessionId, msg.bet, conn.ws);
    } else if (msg.type === 'action') {
      await this.handleGameAction(sessionId, msg.action);
    }
  }

  async joinQueue(userId, sessionId, bet, ws) {
    const balance = await this.balance.getBalance(userId);
    if (balance < bet) {
      ws.send(JSON.stringify({ type: 'error', message: 'Insufficient balance' }));
      return;
    }
    this.queue.push({ userId, sessionId, bet, ws });
    ws.send(JSON.stringify({ type: 'status', status: 'queued' }));
    this.tryMatchmake();
  }

  tryMatchmake() {
    while (this.queue.length >= 2) {
      const a = this.queue.shift();
      const b = this.queue.shift();
      if (a.bet === b.bet) {
        this.startGame(a, b);
      } else {
        // Re-queue the one with lower bet
        if (a.bet < b.bet) {
          this.queue.unshift(b);
        } else {
          this.queue.unshift(a);
        }
        break;
      }
    }
  }

  async startGame(playerA, playerB) {
    const tableId = Math.random().toString(36).substring(7);
    const game = new BlackjackGame(tableId, playerA, playerB, this.balance, this.db);
    this.tables.set(tableId, game);
    await game.start();
  }

  async handleGameAction(sessionId, action) {
    for (const [tableId, game] of this.tables) {
      if (game.players.some(p => p.sessionId === sessionId)) {
        await game.handleAction(sessionId, action);
        break;
      }
    }
  }
}

module.exports = Manager;

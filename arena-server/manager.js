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
      await this.joinQueue(userId, sessionId, msg.bet, msg.gameType || 'blackjack', conn.ws);
    } else if (msg.type === 'action') {
      await this.handleGameAction(sessionId, msg.action);
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
        this.startGame(playerA, playerB);
      } else {
        break;
      }
    }
  }

  async startGame(playerA, playerB) {
    const tableId = Math.random().toString(36).substring(7);
    let game;

    if (playerA.gameType === 'battleship') {
      game = new BattleshipGame(playerA.userId, playerB.userId, playerA.bet, this.balance);
      game.tableId = tableId;
    } else {
      game = new BlackjackGame(tableId, playerA, playerB, this.balance, this.db);
    }

    this.tables.set(tableId, game);

    if (playerA.gameType === 'blackjack') {
      await game.start();
    } else {
      // Battleship: notify both players to start setup phase
      playerA.ws.send(JSON.stringify({ type: 'game_start', gameType: 'battleship', tableId, yourIndex: 0 }));
      playerB.ws.send(JSON.stringify({ type: 'game_start', gameType: 'battleship', tableId, yourIndex: 1 }));
    }
  }

  async handleShipPlacement(sessionId, ships) {
    for (const [tableId, game] of this.tables) {
      if (game instanceof BattleshipGame) {
        const playerIndex = game.player1Id === this.connections.get(sessionId).userId ? 0 : 1;
        const result = game.placeShips(playerIndex, ships);
        if (result.valid && game.state === 'battle') {
          // Both players ready, start battle
          const player1Session = Array.from(this.userSessions.get(game.player1Id) || [])[0];
          const player2Session = Array.from(this.userSessions.get(game.player2Id) || [])[0];
          const conn1 = this.connections.get(player1Session);
          const conn2 = this.connections.get(player2Session);
          if (conn1) conn1.ws.send(JSON.stringify({ type: 'battle_start', currentTurn: 0 }));
          if (conn2) conn2.ws.send(JSON.stringify({ type: 'battle_start', currentTurn: 0 }));
        }
        const conn = this.connections.get(sessionId);
        if (conn) conn.ws.send(JSON.stringify({ type: 'placement_result', valid: result.valid, error: result.error }));
        break;
      }
    }
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

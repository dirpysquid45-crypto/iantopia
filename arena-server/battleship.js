/**
 * Battleship game logic (server-authoritative).
 * Manages single-table state, ship placement, targeting, and win detection.
 *
 * Mirrors blackjack.js's shape deliberately: this.players is the same
 * [playerA, playerB] array of full queue-entry objects ({userId,
 * sessionId, bet, ws}) that BlackjackGame uses, so manager.js's generic
 * disconnect/action-routing code works identically for both game types
 * with no special-casing.
 */

const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 }
];

class BattleshipGame {
  constructor(tableId, playerA, playerB, balanceManager) {
    this.tableId = tableId;
    this.players = [playerA, playerB];
    this.bet = playerA.bet;
    this.balanceManager = balanceManager;
    this.rake = 0.05; // 5% rake, same as Blackjack

    // Game state
    this.state = 'setup'; // setup, battle, result
    this.currentTurn = 0; // 0 = players[0], 1 = players[1]
    this.playersReady = [false, false]; // track setup completion

    // Grids: 10x10, 0=water, 1=ship, 2=hit, 3=miss
    this.grids = [[], []];
    this.shipPlacements = [null, null];
    this.boards = [[], []]; // revealed boards (what opponent sees)
    this.shipsHealth = [
      { Carrier: 5, Battleship: 4, Cruiser: 3, Submarine: 3, Destroyer: 2 },
      { Carrier: 5, Battleship: 4, Cruiser: 3, Submarine: 3, Destroyer: 2 }
    ];

    this.winner = null;
    this.result = null; // 'win', 'loss', 'draw'
  }

  // Deducts both bets and notifies both players setup has begun. Called
  // once by manager.js's startGame(), mirroring BlackjackGame.start().
  async start() {
    await this.balanceManager.deductBet(this.players[0].userId, this.bet);
    await this.balanceManager.deductBet(this.players[1].userId, this.bet);

    this.initGrids();

    this.sendTo(0, { type: 'game_start', gameType: 'battleship', tableId: this.tableId, yourIndex: 0 });
    this.sendTo(1, { type: 'game_start', gameType: 'battleship', tableId: this.tableId, yourIndex: 1 });
  }

  // Initialize empty grids. Called exactly once from start() — NOT from
  // placeShips(), which previously reset both players' grids on every
  // call, wiping out whichever player had already placed their fleet.
  initGrids() {
    for (let i = 0; i < 2; i++) {
      this.grids[i] = Array(10).fill(null).map(() => Array(10).fill(0));
      this.boards[i] = Array(10).fill(null).map(() => Array(10).fill(0));
    }
  }

  // Place ships on grid (server-side validation)
  placeShips(playerIndex, ships) {
    if (this.playersReady[playerIndex]) {
      return { valid: false, error: 'Already submitted' };
    }

    const grid = this.grids[playerIndex];

    // Validate and place each ship
    for (const ship of ships) {
      const { name, x, y, horizontal } = ship;
      const shipData = SHIPS.find(s => s.name === name);

      if (!shipData) return { valid: false, error: `Invalid ship: ${name}` };

      const cells = [];
      for (let i = 0; i < shipData.size; i++) {
        const nx = horizontal ? x + i : x;
        const ny = horizontal ? y : y + i;

        if (nx < 0 || nx > 9 || ny < 0 || ny > 9) {
          return { valid: false, error: `${name} out of bounds` };
        }

        if (grid[ny][nx] !== 0) {
          return { valid: false, error: `${name} overlaps with another ship` };
        }

        cells.push([nx, ny]);
      }

      // Place ship
      for (const [nx, ny] of cells) {
        grid[ny][nx] = 1;
      }
    }

    this.shipPlacements[playerIndex] = ships;
    this.playersReady[playerIndex] = true;

    // Both players ready → start battle
    if (this.playersReady[0] && this.playersReady[1]) {
      this.state = 'battle';
    }

    return { valid: true };
  }

  // Fire at opponent's grid
  fire(playerIndex, x, y) {
    if (this.state !== 'battle') {
      return { valid: false, error: 'Not in battle phase' };
    }

    if (this.currentTurn !== playerIndex) {
      return { valid: false, error: 'Not your turn' };
    }

    const opponentIndex = 1 - playerIndex;
    const board = this.boards[opponentIndex];
    const opponentGrid = this.grids[opponentIndex];

    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 9 || y < 0 || y > 9) {
      return { valid: false, error: 'Coordinates out of bounds' };
    }

    if (board[y][x] !== 0) {
      return { valid: false, error: 'Already targeted this square' };
    }

    // Resolve hit
    const hit = opponentGrid[y][x] === 1;
    board[y][x] = hit ? 2 : 3; // 2=hit, 3=miss

    let sunkShip = null;
    if (hit) {
      // Damage ship
      const ships = this.shipPlacements[opponentIndex];
      for (const ship of ships) {
        const { name } = SHIPS.find(s => s.name === ship.name);
        const inShip = this.checkHitInShip(ship, x, y);
        if (inShip) {
          this.shipsHealth[opponentIndex][name]--;
          if (this.shipsHealth[opponentIndex][name] === 0) {
            sunkShip = name;
          }
          break;
        }
      }
    }

    // Check win condition
    const allSunk = Object.values(this.shipsHealth[opponentIndex]).every(h => h === 0);
    if (allSunk) {
      this.state = 'result';
      this.winner = playerIndex;
      this.result = playerIndex === 0 ? 'win' : 'loss';
      return { valid: true, hit, sunkShip, gameOver: true, winner: playerIndex, x, y, shooterIndex: playerIndex };
    }

    this.currentTurn = 1 - this.currentTurn;
    return { valid: true, hit, sunkShip, gameOver: false, x, y, shooterIndex: playerIndex };
  }

  checkHitInShip(ship, x, y) {
    const { x: sx, y: sy, horizontal, name } = ship;
    const size = SHIPS.find(s => s.name === name).size;

    if (horizontal) {
      return sy === y && x >= sx && x < sx + size;
    } else {
      return sx === x && y >= sy && y < sy + size;
    }
  }

  // Get state for client (obfuscate opponent's grid)
  getState(playerIndex) {
    const opponentIndex = 1 - playerIndex;
    return {
      state: this.state,
      playersReady: this.playersReady,
      currentTurn: this.currentTurn,
      yourGrid: this.grids[playerIndex],
      opponentBoard: this.boards[opponentIndex],
      shipsHealth: this.shipsHealth[opponentIndex],
      winner: this.winner,
      result: this.result
    };
  }

  // Routes a client action to the right handler and broadcasts the
  // result. Mirrors BlackjackGame.handleAction(sessionId, action)'s
  // signature, with an extra payload param for fire's x/y.
  async handleAction(sessionId, action, payload = {}) {
    const playerIndex = this.players.findIndex(p => p.sessionId === sessionId);
    if (playerIndex === -1) return;

    if (action === 'fire') {
      const result = this.fire(playerIndex, payload.x, payload.y);
      if (!result.valid) {
        this.sendTo(playerIndex, { type: 'error', message: result.error });
        return;
      }

      const lastMove = { x: result.x, y: result.y, hit: result.hit, sunkShip: result.sunkShip, shooterIndex: result.shooterIndex };
      this.sendTo(0, { type: 'fire_result', ...this.getState(0), lastMove });
      this.sendTo(1, { type: 'fire_result', ...this.getState(1), lastMove });

      if (result.gameOver) {
        await this.finish();
      }
    }
  }

  // Resolves payout for a completed game. Returns a results array
  // indexed by player index, same shape BlackjackGame.resolve() uses.
  async resolve() {
    if (this.state !== 'result' || this.winner === null) return null;

    const raked = Math.floor(this.bet * 2 * this.rake);
    const payout = (this.bet * 2) - raked;

    const results = [{ result: 'loss', payout: 0 }, { result: 'loss', payout: 0 }];
    results[this.winner] = { result: 'win', payout };
    await this.balanceManager.creditPayout(this.players[this.winner].userId, payout);

    return results;
  }

  // Called once a fire() result reports gameOver: resolves payout,
  // broadcasts game_result, then signals both clients they can requeue.
  async finish() {
    const results = await this.resolve();
    if (!results) return;

    this.broadcast({ type: 'game_result', results });

    setTimeout(() => {
      this.players[0].ws.send(JSON.stringify({ type: 'ready_for_queue' }));
      this.players[1].ws.send(JSON.stringify({ type: 'ready_for_queue' }));
    }, 3000);
  }

  // Handles a disconnect mid-game: the remaining player wins by
  // forfeit. Guarded so a stray disconnect after the game has already
  // finished can never trigger a second payout.
  forfeit(sessionId) {
    if (this.state === 'result') return;

    const playerIndex = this.players.findIndex(p => p.sessionId === sessionId);
    if (playerIndex === -1) return;

    const otherIndex = 1 - playerIndex;
    this.state = 'result';
    this.winner = otherIndex;

    const raked = Math.floor(this.bet * 2 * this.rake);
    const payout = (this.bet * 2) - raked;
    this.balanceManager.creditPayout(this.players[otherIndex].userId, payout);
    this.broadcast({ type: 'opponent_disconnected', winner: otherIndex });
  }

  isFinished() {
    return this.state === 'result';
  }

  sendTo(playerIndex, msg) {
    this.players[playerIndex].ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    this.players[0].ws.send(JSON.stringify(msg));
    this.players[1].ws.send(JSON.stringify(msg));
  }
}

module.exports = { BattleshipGame, SHIPS };

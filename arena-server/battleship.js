/**
 * Battleship game logic (server-authoritative).
 * Manages single-table state, ship placement, targeting, and win detection.
 */

const { Engine } = require('../public/blackjack-engine.js');

const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 }
];

class BattleshipGame {
  constructor(player1Id, player2Id, bet, balanceManager) {
    this.player1Id = player1Id;
    this.player2Id = player2Id;
    this.bet = bet;
    this.balanceManager = balanceManager;

    // Game state
    this.state = 'setup'; // setup, battle, result
    this.currentTurn = 0; // 0 = player1, 1 = player2
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

  // Initialize empty grids
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

    this.initGrids(); // Initialize on first placement attempt
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

    if (x < 0 || x > 9 || y < 0 || y > 9) {
      return { valid: false, error: 'Coordinates out of bounds' };
    }

    if (board[y][x] !== 0) {
      return { valid: false, error: 'Already targeted this square' };
    }

    // Resolve hit
    const hit = opponentGrid[y][x] === 1;
    board[y][x] = hit ? 2 : 3; // 2=hit, 3=miss

    if (hit) {
      // Damage ship
      const ships = this.shipPlacements[opponentIndex];
      for (const ship of ships) {
        const { name, size } = SHIPS.find(s => s.name === ship.name);
        const inShip = this.checkHitInShip(ship, x, y);
        if (inShip) {
          this.shipsHealth[opponentIndex][name]--;
          if (this.shipsHealth[opponentIndex][name] === 0) {
            // Ship sunk
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
      return { valid: true, hit, gameOver: true, winner: playerIndex };
    }

    this.currentTurn = 1 - this.currentTurn;
    return { valid: true, hit, gameOver: false };
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

  // Resolve payout
  async resolve(balanceManager) {
    if (this.state !== 'result' || !this.winner) return;

    const bet = this.bet;
    const rake = Math.floor(bet * 0.05);
    const payout = bet * 2 - rake;

    const winnerPayout = payout;
    const loserPayout = 0; // Already deducted at match start

    await balanceManager.creditPayout(this.winner === 0 ? this.player1Id : this.player2Id, winnerPayout);

    return {
      player1: { result: this.winner === 0 ? 'win' : 'loss', payout: this.winner === 0 ? winnerPayout : loserPayout },
      player2: { result: this.winner === 1 ? 'win' : 'loss', payout: this.winner === 1 ? winnerPayout : loserPayout }
    };
  }
}

module.exports = { BattleshipGame, SHIPS };

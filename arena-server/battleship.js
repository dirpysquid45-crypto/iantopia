/**
 * Battleship (server-authoritative).
 *
 * The server owns every fact about the game: where each fleet is, whose turn it
 * is, and when someone has run out of time. Clients only ever receive what the
 * player is entitled to see (their own fleet, and the results of their own
 * shots) until the game ends, when both fleets are revealed.
 */
const ArenaGame = require('./game-base');

const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];
const SIZE = 10;
const WATER = 0, SHIP = 1, HIT = 2, MISS = 3;

const TIMING = {
  setupMs: 150000, // time to place a fleet
  turnMs: 40000,   // time to take a shot
};
// Two consecutive timed-out turns forfeits: otherwise an abandoned game would
// sit there holding both players' stakes.
const MAX_MISSED_TURNS = 2;

const emptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(WATER));
const fullHealth = () => Object.fromEntries(SHIPS.map((s) => [s.name, s.size]));

class BattleshipGame extends ArenaGame {
  constructor(tableId, playerA, playerB, balanceManager, opts = {}) {
    super(tableId, playerA, playerB, balanceManager, opts);
    this.timing = Object.assign({}, TIMING, this.timing);
    this.rake = 0.05;
    this.resetForRematch();
  }

  resetForRematch() {
    this.state = 'setup'; // setup -> battle -> result
    this.currentTurn = 0;
    this.playersReady = [false, false];
    this.grids = [emptyGrid(), emptyGrid()];   // grids[i] = player i's own fleet
    this.boards = [emptyGrid(), emptyGrid()];  // boards[i] = shots that have landed on player i
    this.shipPlacements = [null, null];
    this.health = [fullHealth(), fullHealth()];
    this.missed = [0, 0];
    this.winner = null;
    this.setupTimer = null;
    this.turnTimer = null;
    this.setupDeadline = null;
    this.turnDeadline = null;
  }

  clearTimers() {
    clearTimeout(this.setupTimer);
    clearTimeout(this.turnTimer);
  }

  // ---- lifecycle ---------------------------------------------------------
  async begin(isRematch = false) {
    this.setupDeadline = Date.now() + this.timing.setupMs;
    this.setupTimer = setTimeout(() => {
      this.onSetupTimeout().catch((e) => console.error('[battleship] setup timeout failed:', e.message));
    }, this.timing.setupMs);
    for (let i = 0; i < 2; i++) {
      this.send(i, {
        type: 'game_start', gameType: 'battleship', tableId: this.tableId, yourIndex: i,
        opponentName: this.players[1 - i].name, friendly: this.friendly, bet: this.bet,
        isRematch, setupMs: this.timing.setupMs,
      });
    }
  }

  // ---- setup -------------------------------------------------------------
  // Validates a whole fleet against a scratch grid and only commits if all of
  // it is legal. It used to write each ship straight into the real grid as it
  // went, so a fleet that failed on its last ship left the earlier ones behind
  // as ghosts, and every later attempt then failed with "overlaps another ship".
  static validateFleet(ships) {
    if (!Array.isArray(ships) || ships.length !== SHIPS.length) {
      return { valid: false, error: `Place all ${SHIPS.length} ships` };
    }
    const scratch = emptyGrid();
    const seen = new Set();
    const normalised = [];
    for (const ship of ships) {
      if (!ship || typeof ship !== 'object') return { valid: false, error: 'Invalid ship data' };
      const { name, x, y, horizontal } = ship;
      const def = SHIPS.find((s) => s.name === name);
      if (!def) return { valid: false, error: `Unknown ship: ${String(name).slice(0, 20)}` };
      if (seen.has(name)) return { valid: false, error: `${name} placed twice` };
      seen.add(name);
      if (!Number.isInteger(x) || !Number.isInteger(y) || typeof horizontal !== 'boolean') {
        return { valid: false, error: 'Invalid ship data' };
      }
      for (let i = 0; i < def.size; i++) {
        const nx = horizontal ? x + i : x;
        const ny = horizontal ? y : y + i;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) return { valid: false, error: `${name} is out of bounds` };
        if (scratch[ny][nx] !== WATER) return { valid: false, error: `${name} overlaps another ship` };
        scratch[ny][nx] = SHIP;
      }
      normalised.push({ name, x, y, horizontal });
    }
    return { valid: true, grid: scratch, ships: normalised };
  }

  submitFleet(i, ships) {
    if (this.state !== 'setup') {
      this.send(i, { type: 'placement_result', valid: false, error: 'Not in setup' });
      return;
    }
    if (this.playersReady[i]) {
      this.send(i, { type: 'placement_result', valid: false, error: 'Already submitted' });
      return;
    }
    const res = BattleshipGame.validateFleet(ships);
    if (!res.valid) {
      this.send(i, { type: 'placement_result', valid: false, error: res.error });
      return;
    }
    this.grids[i] = res.grid;
    this.shipPlacements[i] = res.ships;
    this.playersReady[i] = true;
    this.send(i, { type: 'placement_result', valid: true });
    this.send(1 - i, { type: 'opponent_ready' });
    if (this.playersReady[0] && this.playersReady[1]) this.startBattle();
  }

  startBattle() {
    clearTimeout(this.setupTimer);
    this.state = 'battle';
    // Coin flip, not "whoever opened the lobby": going first is an advantage.
    this.currentTurn = Math.random() < 0.5 ? 0 : 1;
    this.armTurnTimer();
    this.broadcast({ type: 'battle_start', currentTurn: this.currentTurn, turnDeadline: this.turnDeadline, turnMs: this.timing.turnMs });
  }

  async onSetupTimeout() {
    if (this.state !== 'setup' || this.tableClosed) return;
    const ready = this.playersReady;
    if (!ready[0] && !ready[1]) {
      // Nobody placed anything: nobody wins, so everyone gets their stake back.
      await this.refundCharged();
      this.broadcast({ type: 'game_voided', reason: 'Neither player finished placing ships in time.' });
      this.close();
      return;
    }
    await this.forfeitIndex(ready[0] ? 1 : 0, 'timeout');
  }

  // ---- battle ------------------------------------------------------------
  armTurnTimer() {
    clearTimeout(this.turnTimer);
    this.turnDeadline = Date.now() + this.timing.turnMs;
    this.turnTimer = setTimeout(() => {
      this.onTurnTimeout().catch((e) => console.error('[battleship] turn timeout failed:', e.message));
    }, this.timing.turnMs);
  }

  async onTurnTimeout() {
    if (this.state !== 'battle' || this.tableClosed) return;
    const i = this.currentTurn;
    this.missed[i]++;
    if (this.missed[i] >= MAX_MISSED_TURNS) {
      await this.forfeitIndex(i, 'timeout');
      return;
    }
    // Take a random shot on their behalf so the game keeps moving.
    const open = [];
    const radar = this.boards[1 - i];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (radar[y][x] === WATER) open.push([x, y]);
    if (!open.length) return;
    const [x, y] = open[Math.floor(Math.random() * open.length)];
    await this.takeShot(i, x, y, true);
  }

  fire(i, x, y) {
    if (this.state !== 'battle') return { valid: false, error: 'Not in battle phase' };
    if (this.currentTurn !== i) return { valid: false, error: 'Not your turn' };
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= SIZE || y < 0 || y >= SIZE) {
      return { valid: false, error: 'Coordinates out of bounds' };
    }
    const target = 1 - i;
    const board = this.boards[target];
    if (board[y][x] !== WATER) return { valid: false, error: 'Already targeted this square' };

    const hit = this.grids[target][y][x] === SHIP;
    board[y][x] = hit ? HIT : MISS;

    let sunkShip = null;
    if (hit) {
      const ship = this.shipPlacements[target].find((s) => this.cellInShip(s, x, y));
      if (ship && --this.health[target][ship.name] === 0) sunkShip = ship.name;
    }
    const gameOver = Object.values(this.health[target]).every((h) => h === 0);
    if (!gameOver) this.currentTurn = target;
    return { valid: true, hit, sunkShip, gameOver, x, y, shooterIndex: i };
  }

  cellInShip(ship, x, y) {
    const size = SHIPS.find((s) => s.name === ship.name).size;
    return ship.horizontal
      ? ship.y === y && x >= ship.x && x < ship.x + size
      : ship.x === x && y >= ship.y && y < ship.y + size;
  }

  // One entry point for a shot, whether the player fired it or the clock did.
  async takeShot(i, x, y, auto = false) {
    const result = this.fire(i, x, y);
    if (!result.valid) {
      this.send(i, { type: 'error', message: result.error });
      return;
    }
    if (!auto) this.missed[i] = 0;
    const lastMove = { x: result.x, y: result.y, hit: result.hit, sunkShip: result.sunkShip, shooterIndex: i, auto };
    if (!result.gameOver) this.armTurnTimer();
    for (let p = 0; p < 2; p++) {
      this.send(p, {
        type: 'fire_result', state: this.state, currentTurn: this.currentTurn, lastMove,
        yourHealth: { ...this.health[p] }, enemyHealth: { ...this.health[1 - p] },
        turnDeadline: result.gameOver ? null : this.turnDeadline, turnMs: this.timing.turnMs,
      });
    }
    if (result.gameOver) await this.finish(i, 'sunk');
  }

  async handleAction(sessionId, action, payload = {}) {
    const i = this.indexOf(sessionId);
    if (i === -1) return;
    if (action === 'fire') await this.takeShot(i, payload.x, payload.y);
  }

  // ---- ending ------------------------------------------------------------
  async finish(winnerIndex, reason, allowRematch = true) {
    if (this.state === 'result') return; // a second ending can never pay twice
    this.state = 'result';
    this.winner = winnerIndex;
    this.clearTimers();

    const pot = this.bet * 2;
    const raked = this.friendly ? 0 : Math.floor(pot * this.rake);
    const payout = this.friendly ? 0 : pot - raked;
    const results = [{ result: 'loss', payout: 0 }, { result: 'loss', payout: 0 }];
    results[winnerIndex] = { result: 'win', payout };
    if (payout > 0) {
      try { this.pushBalance(winnerIndex, await this.balance.creditPayout(this.players[winnerIndex].userId, payout)); }
      catch (e) { console.error('[battleship] payout failed:', e.message); }
    }
    // Both fleets are revealed now that nothing can be exploited with them, so
    // the loser can see where the ships they never found were hiding.
    this.broadcast({ type: 'game_result', results, reason, friendly: this.friendly, fleets: this.shipPlacements });
    // A rematch needs two people. If one of them has left there is nobody to
    // play, so the table closes instead of leaving the winner on a prompt that
    // can only time out.
    if (allowRematch) this.beginRematchWindow(); else this.close();
  }

  async forfeitIndex(i, reason = 'left') {
    if (this.tableClosed || this.state === 'result') return;
    const winner = 1 - i;
    const leaving = reason === 'disconnect' || reason === 'left';
    await this.finish(winner, reason, !leaving);
    // Older clients only understand this message for "your opponent left".
    if (leaving) this.send(winner, { type: 'opponent_disconnected', winner, reason });
  }

  // ---- reconnecting ------------------------------------------------------
  view(i) {
    const opp = 1 - i;
    return {
      currentTurn: this.currentTurn,
      yourShips: this.shipPlacements[i],
      mine: this.boards[i],      // shots that have landed on me
      radar: this.boards[opp],   // my shots at them
      yourHealth: { ...this.health[i] },
      enemyHealth: { ...this.health[opp] },
      turnDeadline: this.turnDeadline,
      turnMs: this.timing.turnMs,
    };
  }

  resync(i) {
    this.send(i, {
      type: 'resync', gameType: 'battleship', tableId: this.tableId, yourIndex: i,
      opponentName: this.players[1 - i].name, friendly: this.friendly, bet: this.bet,
      state: this.state, yourReady: this.playersReady[i], opponentReady: this.playersReady[1 - i],
      setupMsLeft: Math.max(0, (this.setupDeadline || 0) - Date.now()), ...this.view(i),
      turnMsLeft: this.state === 'battle' ? Math.max(0, (this.turnDeadline || 0) - Date.now()) : 0,
      ...(this.state === 'result' ? { winner: this.winner, fleets: this.shipPlacements } : {}),
    });
  }
}

module.exports = { BattleshipGame, SHIPS };

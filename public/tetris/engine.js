// Tetris rules for Iantopia, shared by the single-player page and Arena versus.
//
// The rules follow Tetrigo (pkg/tetris): Super Rotation System kicks, a seven-piece
// bag, one hold slot, a ghost piece, lock-out / block-out game over, and its
// scoring (line points times level, back-to-back Tetris bonus, soft and hard drop
// points, a level every five lines, and the same fall-speed curve).
//
// The versus transfer follows Flatris: when a player clears rows, those rows go to
// the opponent's well, pushing their stack up. One change: each transferred row
// gets a single hole, so the rows can be cleared by the receiver. Flatris sends
// full rows, and a full row clears on the receiver's next lock and bounces back.
//
// Loads as a plain <script> (window.TetrisEngine) and as a CommonJS module (tests).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TetrisEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 10;
  var ROWS = 40;          // 20 hidden rows above the skyline, then the 20 visible rows
  var SKYLINE = 20;
  var PREVIEW = 5;        // how many upcoming pieces the page shows

  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  // Piece colours (from Flatris). The page draws each piece as a black block with
  // this colour as its outline and glow.
  // J is the blue piece, L the orange one, Z the red one, T the purple one.
  // G is grey garbage: a line sent by an opponent's clear.
  var COLORS = { G: '#7b8496', I: '#3cc7d6', O: '#fbb414', T: '#5b1b82', J: '#1b3f94', L: '#d9480f', S: '#95c43d', Z: '#a3111f' };

  var SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
  };
  // Top-left of the shape when it enters, relative to the skyline (as in Tetrigo).
  var SPAWN = {
    I: { x: 3, y: -1 }, O: { x: 4, y: -2 },
    T: { x: 3, y: -2 }, S: { x: 3, y: -2 }, Z: { x: 3, y: -2 }, J: { x: 3, y: -2 }, L: { x: 3, y: -2 }
  };
  // SRS kick tables, indexed by compass direction (0 N, 1 E, 2 S, 3 W), copied from Tetrigo.
  var KICKS_I = [
    [[-1, 1], [0, 1], [-3, 1], [0, 3], [-3, 0]],
    [[2, -1], [0, -1], [3, -1], [0, 0], [3, -3]],
    [[-2, 2], [-3, 2], [0, 2], [-3, 0], [0, 3]],
    [[1, -2], [3, -2], [0, -2], [3, -3], [0, 0]]
  ];
  var KICKS_6 = [
    [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    [[1, 0], [0, 0], [0, -1], [1, 2], [0, 2]],
    [[-1, 1], [0, 1], [0, 2], [-1, -1], [0, -1]],
    [[0, -1], [1, -1], [1, -2], [0, 1], [1, 1]]
  ];

  var LINE_POINTS = { 1: 100, 2: 300, 3: 500, 4: 800 };
  // Strubles earned per clear, before the combo and level multipliers. The page
  // turns the total into Strubles at game over (see rewards.js for the caps).
  var LINE_REWARD = { 1: 0, 2: 1, 3: 2, 4: 5 };

  // Fall time per row in seconds. Same curve as Tetrigo's Fall.
  function fallInterval(level) {
    var d = level - 1;
    return Math.pow(0.8 - d * 0.007, d);
  }

  // Seeded PRNG, so both players in a versus match get the same piece order.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function emptyRow() { var r = []; for (var c = 0; c < COLS; c++) r.push(null); return r; }
  function emptyGrid() { var g = []; for (var r = 0; r < ROWS; r++) g.push(emptyRow()); return g; }

  // Clockwise: reverse the rows, then transpose. Counter-clockwise: reverse each row, then transpose.
  function rotateCells(cells, cw) {
    var src = cw
      ? cells.slice().reverse()
      : cells.map(function (r) { return r.slice().reverse(); });
    var out = [];
    for (var c = 0; c < src[0].length; c++) {
      out.push(src.map(function (r) { return r[c]; }));
    }
    return out;
  }

  function spawnPiece(type) {
    return { type: type, cells: SHAPES[type].map(function (r) { return r.slice(); }), x: SPAWN[type].x, y: SPAWN[type].y + SKYLINE, dir: 0 };
  }

  // Does `cells` fit at (x, y)? Out of bounds or on a filled cell both fail.
  function fits(grid, cells, x, y) {
    for (var r = 0; r < cells.length; r++) {
      for (var c = 0; c < cells[r].length; c++) {
        if (!cells[r][c]) continue;
        var gr = y + r, gc = x + c;
        if (gr < 0 || gr >= ROWS || gc < 0 || gc >= COLS) return false;
        if (grid[gr][gc]) return false;
      }
    }
    return true;
  }

  function Board(opts) {
    opts = opts || {};
    this.rand = mulberry32(opts.seed == null ? 1 : opts.seed);
    this.grid = emptyGrid();
    this.version = 0;          // bumped whenever the locked grid changes, so the view can cache it
    this.queue = [];
    this.fillQueue();
    this.held = null;          // the piece type in the hold slot
    this.canHold = true;
    this.active = null;
    this.score = 0;
    this.lines = 0;
    this.level = opts.level || 1;
    this.b2b = false;
    this.combo = 0;            // clears in a row, one lock after another
    this.rewardPoints = 0;     // Strubles earned so far, before the page's caps
    this.gravity = 0;
    this.softDropping = false;
    this.over = false;
    this.overReason = null;
    this.onLock = opts.onLock || null;      // (clearedRows) fired when a lock clears rows
    this.onEvent = opts.onEvent || null;    // (name, data) for sound: lock, clear, level, garbage, over
    this.hardLock = false;
    this.spawnNext();
  }

  Board.prototype.fillQueue = function () {
    while (this.queue.length <= 7) {
      var bag = TYPES.slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(this.rand() * (i + 1));
        var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
      }
      this.queue = this.queue.concat(bag);
    }
  };

  Board.prototype.nextType = function () {
    var type = this.queue.shift();
    this.fillQueue();
    return type;
  };

  Board.prototype.preview = function () { return this.queue.slice(0, PREVIEW); };

  // Puts a piece in play. Block-out if it overlaps; lock-out if it cannot drop and
  // is still entirely above the skyline. Returns false if the game just ended.
  Board.prototype.place = function (type) {
    var p = spawnPiece(type);
    this.active = p;
    if (!fits(this.grid, p.cells, p.x, p.y)) return this.end('blockout');
    if (fits(this.grid, p.cells, p.x, p.y + 1)) {
      p.y++;
    } else if (this.allAboveSkyline(p)) {
      return this.end('lockout');
    }
    return true;
  };

  Board.prototype.allAboveSkyline = function (p) {
    for (var r = 0; r < p.cells.length; r++) {
      for (var c = 0; c < p.cells[r].length; c++) {
        if (p.cells[r][c] && p.y + r >= SKYLINE) return false;
      }
    }
    return true;
  };

  Board.prototype.spawnNext = function () {
    this.canHold = true;
    return this.place(this.nextType());
  };

  Board.prototype.end = function (reason) {
    if (!this.over) { this.over = true; this.overReason = reason; this.active = null; this.emit('over', reason); }
    return false;
  };

  Board.prototype.move = function (dx) {
    var a = this.active;
    if (this.over || !a) return false;
    if (!fits(this.grid, a.cells, a.x + dx, a.y)) return false;
    a.x += dx;
    return true;
  };

  // Tries the SRS kicks in order. Clockwise uses the table of the new direction,
  // counter-clockwise the table of the old one, with the offset subtracted (as in Tetrigo).
  Board.prototype.rotate = function (cw) {
    var a = this.active;
    if (this.over || !a || a.type === 'O') return false;
    var table = a.type === 'I' ? KICKS_I : KICKS_6;
    var cells = rotateCells(a.cells, cw);
    var nd = cw ? (a.dir + 1) % 4 : (a.dir + 3) % 4;
    var kicks = cw ? table[nd] : table[a.dir];
    for (var k = 0; k < kicks.length; k++) {
      var nx = cw ? a.x + kicks[k][0] : a.x - kicks[k][0];
      var ny = cw ? a.y + kicks[k][1] : a.y - kicks[k][1];
      if (fits(this.grid, cells, nx, ny)) {
        a.cells = cells; a.x = nx; a.y = ny; a.dir = nd;
        return true;
      }
    }
    return false;
  };

  Board.prototype.ghostY = function () {
    var a = this.active;
    if (!a) return null;
    var y = a.y;
    while (fits(this.grid, a.cells, a.x, y + 1)) y++;
    return y;
  };

  // One row down. Soft drop scores a point per row.
  Board.prototype.stepDown = function () {
    var a = this.active;
    if (!a || !fits(this.grid, a.cells, a.x, a.y + 1)) return false;
    a.y++;
    if (this.softDropping) this.score += 1;
    return true;
  };

  Board.prototype.canStepDown = function () {
    var a = this.active;
    return !!a && fits(this.grid, a.cells, a.x, a.y + 1);
  };

  // Drops straight to the ghost position. 2 points a row (as in Tetrigo).
  Board.prototype.hardDrop = function () {
    if (this.over || !this.active) return;
    var rows = 0;
    while (this.canStepDown()) { this.active.y++; rows++; }
    this.score += rows * 2;
    this.hardLock = true;
    this.lock();
  };

  // Gravity step. Locks the piece when it cannot fall any further.
  Board.prototype.fall = function () {
    if (this.over || !this.active) return;
    if (!this.stepDown()) this.lock();
  };

  // Advances gravity by `seconds`. The page calls this once per frame.
  Board.prototype.tick = function (seconds) {
    if (this.over) return;
    var interval = fallInterval(this.level) / (this.softDropping ? 15 : 1);
    this.gravity += Math.min(seconds, 0.25);
    var guard = 0;
    while (this.gravity >= interval && !this.over && guard++ < 60) {
      this.gravity -= interval;
      this.fall();
    }
  };

  Board.prototype.setSoftDrop = function (on) { this.softDropping = !!on; };

  // Swaps the active piece with the held one (or stores it, if the hold is empty).
  // Once per lock.
  // Returns true if a hold happened.
  Board.prototype.holdPiece = function () {
    if (this.over || !this.active || !this.canHold) return false;
    var current = this.active.type;
    var next = this.held === null ? this.nextType() : this.held;
    this.held = current;
    this.gravity = 0;
    this.place(next);
    this.canHold = false;
    return true;
  };

  Board.prototype.emit = function (name, data) {
    if (this.onEvent) this.onEvent(name, data);
  };

  // Locks the active piece, clears full rows, scores, and spawns the next piece.
  Board.prototype.lock = function () {
    var a = this.active;
    if (!a) return;
    var bottom = -Infinity;
    for (var r = 0; r < a.cells.length; r++) {
      for (var c = 0; c < a.cells[r].length; c++) {
        if (!a.cells[r][c]) continue;
        this.grid[a.y + r][a.x + c] = a.type;
        if (a.y + r > bottom) bottom = a.y + r;
      }
    }
    this.version++;
    this.active = null;
    this.gravity = 0;
    this.emit('lock', { hard: this.hardLock });
    this.hardLock = false;

    // Only rows the piece touched can have become full.
    var full = [];
    for (var rr = 0; rr < a.cells.length; rr++) {
      var row = a.y + rr;
      if (row >= 0 && row < ROWS && this.grid[row].every(Boolean)) full.push(row);
    }
    full.sort(function (x, y) { return y - x; });   // bottom to top, so the indices stay valid

    var cleared = [];
    if (full.length) {
      // Positions and contents, read before the rows move, for the flash effect.
      var where = full.slice().reverse().map(function (r) { return r - SKYLINE; });
      // Remove every full row in one pass, then put the same number of empty rows on top.
      // Removing them one at a time shifts the rows above each one, so the next index
      // would point at the wrong row: a full row was left behind and an ordinary row lost.
      var gone = {};
      for (var f = 0; f < full.length; f++) gone[full[f]] = true;
      cleared = full.slice().reverse().map(function (r) { return this.grid[r].slice(); }, this);
      var kept = [];
      for (var y = 0; y < ROWS; y++) if (!gone[y]) kept.push(this.grid[y]);
      var fresh = [];
      for (var e = 0; e < full.length; e++) fresh.push(emptyRow());
      this.grid = fresh.concat(kept);
      this.version++;
      this.combo++;
      var bonus = this.applyClearScore(full.length);
      this.emit('clear', { lines: full.length, b2b: bonus, combo: this.combo, rows: where, cells: cleared });
      if (this.onLock) this.onLock(cleared);
    } else {
      this.combo = 0;
    }

    // Lock-out: the whole piece locked above the skyline.
    if (bottom < SKYLINE) {
      this.end('lockout');
      return;
    }
    this.spawnNext();
  };

  // Strubles for one clear: the line base, plus 1 for each clear beyond the first in
  // a combo, times 1.5 for a back-to-back Tetris, times a level factor (up to 2x).
  function clearReward(lines, combo, backToBack, level) {
    var base = LINE_REWARD[lines] + (combo > 1 ? combo - 1 : 0);
    var b2b = backToBack ? 1.5 : 1;
    var levelFactor = Math.min(2, 1 + 0.1 * (level - 1));
    return base * b2b * levelFactor;
  }

  // Returns true when the back-to-back bonus applied.
  Board.prototype.applyClearScore = function (n) {
    var pts = LINE_POINTS[n];
    var bonus = false;
    if (n === 4) {
      if (this.b2b) { pts += pts * 0.5; bonus = true; }   // back-to-back Tetris bonus
      this.b2b = true;
    } else {
      this.b2b = false;
    }
    this.score += Math.round(pts) * this.level;
    this.rewardPoints += clearReward(n, this.combo, bonus, this.level);
    this.lines += n;
    var before = this.level;
    while (this.lines >= this.level * 5) this.level++;
    if (this.level > before) this.emit('level', this.level);
    return bonus;
  };

  // Garbage from the opponent: `rows` are full rows of piece letters. The stack moves up
  // by that many rows. If any block would leave the top of the grid, the game is over.
  Board.prototype.receiveRows = function (rows) {
    if (this.over || !rows.length) return !this.over;
    var k = rows.length;
    for (var r = 0; r < k; r++) {
      if (this.grid[r].some(Boolean)) return this.end('topout');
    }
    this.grid.splice(0, k);
    for (var i = 0; i < k; i++) this.grid.push(rows[i].slice());
    this.version++;
    this.emit('garbage', k);
    var a = this.active;
    if (a) {
      var guard = 0;
      while (!fits(this.grid, a.cells, a.x, a.y) && guard++ < 40) a.y--;
      if (!fits(this.grid, a.cells, a.x, a.y)) return this.end('topout');
    }
    return true;
  };

  // The visible rows (20 strings of 10 characters: '.' empty, else a piece letter),
  // with the active piece drawn in. The versus opponent sees this.
  Board.prototype.snapshot = function () {
    var cells = this.grid.map(function (row) { return row.map(function (c) { return c || '.'; }); });
    var a = this.active;
    if (a) {
      for (var r = 0; r < a.cells.length; r++) {
        for (var c = 0; c < a.cells[r].length; c++) {
          if (a.cells[r][c] && a.y + r >= 0 && a.y + r < ROWS) cells[a.y + r][a.x + c] = a.type;
        }
      }
    }
    var out = [];
    for (var y = SKYLINE; y < ROWS; y++) out.push(cells[y].join(''));
    return out;
  };

  return {
    COLS: COLS, ROWS: ROWS, SKYLINE: SKYLINE, TYPES: TYPES, COLORS: COLORS, SHAPES: SHAPES,
    LINE_POINTS: LINE_POINTS, LINE_REWARD: LINE_REWARD, PREVIEW: PREVIEW, clearReward: clearReward,
    Board: Board, rotateCells: rotateCells, fallInterval: fallInterval, mulberry32: mulberry32, fits: fits
  };
});

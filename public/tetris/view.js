// Drawing for the Tetris pages. Used by both the single-player game and the Arena
// versus game, so they look the same: a black board, and every piece is a black
// block with a coloured outline that glows.
//
// window.TetrisView:
//   createBoard(canvas)   -> { draw(board, opts), flash(info) }   the player's own well
//   createRows(canvas)    -> { draw(rows) }                       the opponent's well (snapshot strings)
//   createPreview(canvas) -> { draw(types) }                      hold / next boxes
//   resize(canvas)        -> sizes the canvas bitmap to its CSS box (device pixels)
//
// opts for board.draw:
//   ghost   (default true)  the landing spot, drawn as stacked outlines
//   onion   (default true)  faint trail of the falling piece's last positions
//   effects (default true)  row flashes after a clear
(function () {
  var E = window.TetrisEngine;
  var COLS = E.COLS, SKYLINE = E.SKYLINE, ROWS = E.ROWS, VISIBLE = ROWS - SKYLINE;

  var FLASH_MS = 380;        // a line clear blinks this long
  var TETRIS_FLASH_MS = 600; // a Tetris also flashes the whole board
  var TRAIL_LENGTH = 4;      // how many earlier positions the onion skin keeps

  function resize(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }

  // One block: black body, coloured outline, outer glow. Ghosts are a dim outline with no glow.
  function drawBlock(ctx, x, y, s, type, alpha, glow) {
    var color = E.COLORS[type] || '#ffffff';
    var inset = Math.max(1, s * 0.1);
    ctx.save();
    if (alpha === undefined || alpha >= 1) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, s * 0.1);
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = s * 0.5;
    }
    ctx.strokeRect(x + inset, y + inset, s - inset * 2, s - inset * 2);
    ctx.restore();
  }

  function drawGrid(ctx, w, h, s) {
    ctx.fillStyle = '#030408';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,140,190,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 1; c < COLS; c++) { ctx.moveTo(c * s + 0.5, 0); ctx.lineTo(c * s + 0.5, h); }
    for (var r = 1; r < VISIBLE; r++) { ctx.moveTo(0, r * s + 0.5); ctx.lineTo(w, r * s + 0.5); }
    ctx.stroke();
  }

  // Blink: on for 60ms, off for 60ms, so a row visibly flickers.
  function blinkOn(elapsed) { return Math.floor(elapsed / 60) % 2 === 0; }

  // The board view. The stack is cached on an offscreen canvas and only redrawn
  // when the grid changes; the active piece, ghost, onion trail and flashes are
  // drawn every frame.
  function createBoard(canvas) {
    var ctx = canvas.getContext('2d');
    var layer = document.createElement('canvas');
    var layerCtx = layer.getContext('2d');
    var cachedVersion = -1;
    var cachedSize = '';
    var flashes = [];       // { rows: [visible row index], cells: [[letters]], start, ms, tetris }
    var trail = [];         // recent active-piece positions, newest last

    function drawStack(board) {
      var s = canvas.width / COLS;
      var key = s + 'x' + canvas.height;
      if (board.version === cachedVersion && key === cachedSize) return;
      layer.width = canvas.width; layer.height = canvas.height;
      drawGrid(layerCtx, layer.width, layer.height, s);
      for (var r = SKYLINE; r < ROWS; r++) {
        var row = board.grid[r];
        for (var c = 0; c < COLS; c++) {
          if (row[c]) drawBlock(layerCtx, c * s, (r - SKYLINE) * s, s, row[c], undefined, true);
        }
      }
      cachedVersion = board.version;
      cachedSize = key;
    }

    // Keeps the last few positions of the falling piece (onion skin). A new piece is
    // a new object, so the trail restarts with it; a move or rotation adds the old spot.
    var trailOwner = null, lastState = null;
    function stateOf(a) { return { type: a.type, cells: a.cells, x: a.x, y: a.y, dir: a.dir }; }
    function updateTrail(a) {
      if (!a) { trail = []; trailOwner = null; lastState = null; return; }
      if (a !== trailOwner) { trail = []; trailOwner = a; lastState = stateOf(a); return; }
      var now = stateOf(a);
      if (now.x === lastState.x && now.y === lastState.y && now.dir === lastState.dir) return;
      trail.push(lastState);
      if (trail.length > TRAIL_LENGTH) trail.shift();
      lastState = now;
    }

    function drawShape(ctx2, cells, x, y, s, type, alpha, glow) {
      for (var r = 0; r < cells.length; r++) {
        for (var c = 0; c < cells[r].length; c++) {
          var vr = y + r - SKYLINE;
          if (cells[r][c] && vr >= 0) drawBlock(ctx2, (x + c) * s, vr * s, s, type, alpha, glow);
        }
      }
    }

    return {
      // Starts the flash for a line clear. `info` is the engine's clear event.
      flash: function (info) {
        if (!info || !info.rows || !info.rows.length) return;
        flashes.push({
          rows: info.rows, cells: info.cells || [], start: performance.now(),
          ms: info.lines >= 4 ? TETRIS_FLASH_MS : FLASH_MS, tetris: info.lines >= 4
        });
        if (flashes.length > 6) flashes.shift();
      },
      draw: function (board, opts) {
        opts = opts || {};
        var showGhost = opts.ghost !== false;
        var showOnion = opts.onion !== false;
        var showEffects = opts.effects !== false;
        resize(canvas);
        var s = canvas.width / COLS;
        if (!board) {
          // No game yet (the versus lobby): an empty well.
          drawGrid(ctx, canvas.width, canvas.height, s);
          updateTrail(null);
          return;
        }
        drawStack(board);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(layer, 0, 0);
        var now = performance.now();

        // Row flashes: each cleared row blinks in its place, and a Tetris washes the board.
        if (showEffects && flashes.length) {
          flashes = flashes.filter(function (f) { return now - f.start < f.ms; });
          flashes.forEach(function (f) {
            var elapsed = now - f.start;
            if (!blinkOn(elapsed)) return;
            f.rows.forEach(function (vr, i) {
              if (vr < 0 || vr >= VISIBLE) return;
              var cells = f.cells[i] || [];
              for (var c = 0; c < COLS; c++) {
                if (!cells[c]) continue;
                drawBlock(ctx, c * s, vr * s, s, cells[c], undefined, true);
              }
              ctx.save();
              ctx.globalAlpha = f.tetris ? 0.55 : 0.4;
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, vr * s, canvas.width, s);
              ctx.restore();
            });
            if (f.tetris) {
              ctx.save();
              ctx.globalAlpha = 0.12;
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.restore();
            }
          });
        }

        if (board.active && !board.over) {
          var a = board.active;
          if (showOnion) {
            updateTrail(a);
            // Older positions fade out: 0.22, 0.14, 0.08, 0.04.
            var fades = [0.22, 0.14, 0.08, 0.04];
            for (var t = trail.length - 1, k = 0; t >= 0 && k < fades.length; t--, k++) {
              var old = trail[t];
              drawShape(ctx, old.cells, old.x, old.y, s, old.type, fades[k], false);
            }
          } else {
            updateTrail(null);
          }
          if (showGhost) {
            var gy = board.ghostY();
            // The landing spot as stacked outlines: a faint outer layer and a brighter inner one.
            drawShape(ctx, a.cells, a.x, gy, s, a.type, 0.2, false);
            drawShape(ctx, a.cells, a.x, gy, s, a.type, 0.38, false);
          }
          drawShape(ctx, a.cells, a.x, a.y, s, a.type, undefined, true);
        } else {
          updateTrail(null);
        }
      }
    };
  }

  // The opponent's well, from the 20 visible rows the server relays.
  function createRows(canvas) {
    var ctx = canvas.getContext('2d');
    return {
      draw: function (rows) {
        resize(canvas);
        var s = canvas.width / COLS;
        drawGrid(ctx, canvas.width, canvas.height, s);
        if (!rows) return;
        for (var r = 0; r < rows.length && r < VISIBLE; r++) {
          for (var c = 0; c < COLS; c++) {
            var ch = rows[r].charAt(c);
            if (ch && ch !== '.') drawBlock(ctx, c * s, r * s, s, ch, undefined, true);
          }
        }
      }
    };
  }

  // A small piece in a box (the hold box, or one slot of the next list).
  function createPreview(canvas) {
    var ctx = canvas.getContext('2d');
    return {
      draw: function (types) {
        resize(canvas);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!types || !types.length) return;
        // Each entry gets its own slot, stacked top to bottom (the next list).
        var slotH = canvas.height / types.length;
        types.forEach(function (type, i) {
          var shape = E.SHAPES[type];
          var rows = shape.length, cols = shape[0].length;
          var s = Math.min(canvas.width / 4.6, slotH / 2.6);
          var ox = (canvas.width - cols * s) / 2;
          var oy = i * slotH + (slotH - rows * s) / 2;
          for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
              if (shape[r][c]) drawBlock(ctx, ox + c * s, oy + r * s, s, type, undefined, true);
            }
          }
        });
      }
    };
  }

  window.TetrisView = { resize: resize, createBoard: createBoard, createRows: createRows, createPreview: createPreview };
})();

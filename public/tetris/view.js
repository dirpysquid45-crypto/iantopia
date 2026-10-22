// Drawing for the Tetris pages. Used by both the single-player game and the Arena
// versus game, so they look the same: a black board, and every piece is a black
// block with a coloured outline that glows.
//
// window.TetrisView:
//   createBoard(canvas)  -> { draw(board, opts) }   the player's own well
//   createRows(canvas)   -> { draw(rows) }          the opponent's well (snapshot strings)
//   createPreview(canvas)-> { draw(types) }         hold / next boxes
//   resize(canvas)       -> sizes the canvas bitmap to its CSS box (device pixels)
(function () {
  var E = window.TetrisEngine;
  var COLS = E.COLS, SKYLINE = E.SKYLINE, ROWS = E.ROWS, VISIBLE = ROWS - SKYLINE;

  function resize(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }

  // One block: black body, coloured outline, outer glow. Ghosts are a dim outline with no glow.
  function drawBlock(ctx, x, y, s, type, ghost) {
    var color = E.COLORS[type] || '#ffffff';
    var inset = Math.max(1, s * 0.1);
    ctx.save();
    if (!ghost) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = ghost ? 0.45 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, s * 0.1);
    if (!ghost) {
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

  // The stack is cached on an offscreen canvas and only redrawn when the grid changes.
  function createBoard(canvas) {
    var ctx = canvas.getContext('2d');
    var layer = document.createElement('canvas');
    var layerCtx = layer.getContext('2d');
    var cachedVersion = -1;
    var cachedSize = '';

    function drawStack(board) {
      var s = canvas.width / COLS;
      var key = s + 'x' + canvas.height;
      if (board.version === cachedVersion && key === cachedSize) return;
      layer.width = canvas.width; layer.height = canvas.height;
      drawGrid(layerCtx, layer.width, layer.height, s);
      for (var r = SKYLINE; r < ROWS; r++) {
        var row = board.grid[r];
        for (var c = 0; c < COLS; c++) {
          if (row[c]) drawBlock(layerCtx, c * s, (r - SKYLINE) * s, s, row[c], false);
        }
      }
      cachedVersion = board.version;
      cachedSize = key;
    }

    return {
      draw: function (board, opts) {
        opts = opts || {};
        resize(canvas);
        var s = canvas.width / COLS;
        if (!board) {
          // No game yet (the versus lobby): an empty well.
          drawGrid(ctx, canvas.width, canvas.height, s);
          return;
        }
        drawStack(board);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(layer, 0, 0);
        if (board.active && !board.over) {
          var a = board.active;
          if (opts.ghost !== false) {
            var gy = board.ghostY();
            for (var r = 0; r < a.cells.length; r++) {
              for (var c = 0; c < a.cells[r].length; c++) {
                var gr = gy + r - SKYLINE;
                if (a.cells[r][c] && gr >= 0) drawBlock(ctx, (a.x + c) * s, gr * s, s, a.type, true);
              }
            }
          }
          for (var rr = 0; rr < a.cells.length; rr++) {
            for (var cc = 0; cc < a.cells[rr].length; cc++) {
              var vr = a.y + rr - SKYLINE;
              if (a.cells[rr][cc] && vr >= 0) drawBlock(ctx, (a.x + cc) * s, vr * s, s, a.type, false);
            }
          }
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
            if (ch && ch !== '.') drawBlock(ctx, c * s, r * s, s, ch, false);
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
              if (shape[r][c]) drawBlock(ctx, ox + c * s, oy + r * s, s, type, false);
            }
          }
        });
      }
    };
  }

  window.TetrisView = { resize: resize, createBoard: createBoard, createRows: createRows, createPreview: createPreview };
})();

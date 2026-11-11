/* Tycoon mini-games: short, skippable overlays. Each one removes itself and calls onDone exactly once. */
(function () {
  'use strict';

  var GOLD = '#ffd700';
  var TARGET = 56; // px; every tappable thing is well over 44px

  var CSS = [
    '.tmg-overlay{position:fixed;top:0;right:0;bottom:0;left:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.72);font-family:ui-monospace,"Courier New",monospace;color:#fff}',
    '.tmg-panel{width:min(92vw,420px);box-sizing:border-box;padding:14px;background:#000;border:3px solid ' + GOLD + ';text-align:center}',
    '.tmg-title{margin:0 0 10px;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase}',
    '.tmg-bar{height:10px;margin-bottom:8px;border:2px solid ' + GOLD + ';background:#111}',
    '.tmg-fill{height:100%;width:0;background:' + GOLD + '}',
    '.tmg-status{min-height:1.4em;margin:0 0 10px;font-size:12px;line-height:1.4}',
    '.tmg-area{position:relative;width:100%;height:300px;box-sizing:border-box;border:2px solid #333;background:#0a0a0a;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.tmg-area-auto{height:auto;border:0;background:none;overflow:visible}',
    '.tmg-target{position:absolute;display:flex;align-items:center;justify-content:center;width:' + TARGET + 'px;height:' + TARGET + 'px;box-sizing:border-box;border:3px solid ' + GOLD + ';border-radius:50%;background:#000;font-size:24px;cursor:pointer;touch-action:manipulation}',
    '.tmg-crate{border-radius:6px}',
    '.tmg-pop{animation:tmg-pop .2s ease-out}',
    '@keyframes tmg-pop{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.tmg-pop{animation:none}}',
    '.tmg-track{position:absolute;top:50%;left:16px;right:16px;height:40px;margin-top:-20px;box-sizing:border-box;border:2px solid ' + GOLD + ';background:#111}',
    '.tmg-zone{position:absolute;top:0;bottom:0;left:40%;width:20%;background:#1e9e4a}',
    '.tmg-marker{position:absolute;top:-8px;bottom:-8px;width:8px;background:#fff}',
    '.tmg-grid{position:absolute;top:0;right:0;bottom:0;left:0;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,1fr);gap:10px;padding:12px;box-sizing:border-box}',
    '.tmg-cell{position:relative;min-width:44px;min-height:44px;padding:0;font:inherit;font-size:28px;color:#fff;background:#111;border:2px solid #555;cursor:pointer;touch-action:manipulation}',
    '.tmg-cell.tmg-ok{background:#0a6b2a;border-color:#2ecc40}',
    '.tmg-cell.tmg-bad{background:#7a0000;border-color:#ff4136}',
    '.tmg-stamp{position:absolute;top:2px;right:2px;padding:1px 3px;font-size:8px;background:#d00;color:#fff;pointer-events:none}',
    '.tmg-pipe{display:grid;gap:4px;width:100%;max-width:340px;margin:0 auto}',
    '.tmg-tile{position:relative;aspect-ratio:1;min-width:44px;min-height:44px;box-sizing:border-box;background:#111;border:2px solid #444;cursor:pointer;touch-action:manipulation}',
    '.tmg-tile *{pointer-events:none}',
    '.tmg-tile svg{position:absolute;top:0;left:0;width:100%;height:100%}',
    '.tmg-mark{position:absolute;top:0;left:2px;font-size:12px;line-height:1}',
    '.tmg-skip{min-width:44px;min-height:44px;margin-top:10px;padding:0 18px;font:inherit;font-size:12px;font-weight:700;color:#fff;background:#000;border:2px solid ' + GOLD + ';cursor:pointer;touch-action:manipulation}'
  ].join('\n');

  // Empty result for each game, used when the overlay cannot open.
  var BLANK = {
    fireFight: function () { return { hits: 0, rounds: 4 }; },
    rush: function () { return { hits: 0, rounds: 3 }; },
    caravan: function () { return { catches: 0, total: 12 }; },
    audit: function () { return { score: 0 }; },
    pipe: function () { return { solved: false }; }
  };

  function callDone(onDone, result) {
    if (typeof onDone === 'function') onDone(result);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function injectCss() {
    if (document.getElementById('tmg-style')) return;
    var style = el('style', null, CSS);
    style.id = 'tmg-style';
    (document.head || document.documentElement).appendChild(style);
  }

  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      return false;
    }
  }

  // 0 to 1 and back again, once per unit of x.
  function tri(x) {
    var f = x - Math.floor(x);
    return 1 - Math.abs(2 * f - 1);
  }

  function fireFight(s) {
    var ROUNDS = 4;
    var SLOT = 1500; // a new target every slot
    var SHOW = 1200; // it vanishes after this long
    var hits = 0;
    var round = -1;
    var target = null;

    function res() { return { hits: hits, rounds: ROUNDS }; }

    function drop() {
      if (target) {
        target.remove();
        target = null;
      }
    }

    function spawn() {
      var node = el('div', 'tmg-target', '🧯');
      var w = s.area.clientWidth || 300;
      var h = s.area.clientHeight || 300;
      node.style.left = Math.round(Math.random() * Math.max(0, w - TARGET)) + 'px';
      node.style.top = Math.round(Math.random() * Math.max(0, h - TARGET)) + 'px';
      if (!s.reduce) node.classList.add('tmg-pop');
      s.on(node, 'pointerdown', function (e) {
        e.preventDefault();
        if (node !== target) return;
        hits++;
        drop();
        s.status('Hit! ' + hits + ' so far');
      });
      s.area.appendChild(node);
      target = node;
    }

    return {
      title: 'Fire drill',
      limit: ROUNDS * SLOT,
      tick: function (t) {
        var r = Math.floor(t / SLOT);
        if (r !== round) {
          round = r;
          drop();
          if (r < ROUNDS) {
            spawn();
            s.status('Round ' + (r + 1) + ' of ' + ROUNDS + ': tap the 🧯');
          }
        } else if (target && t - round * SLOT >= SHOW) {
          drop();
          s.status('Too slow');
        }
      },
      result: res
    };
  }

  function rush(s) {
    var ROUNDS = 3;
    var ROUND_MS = 3000;
    var SWEEP_MS = 1100; // one trip across and back
    var PAUSE_MS = 500;  // time to read the result before the next round
    var ZONE_LO = 0.4;
    var ZONE_HI = 0.6;
    var hits = 0;
    var round = -1;
    var roundStart = 0;
    var decided = false;
    var decidedAt = 0;
    var pos = 0;
    var lastT = 0;

    var track = el('div', 'tmg-track');
    var marker = el('div', 'tmg-marker');
    track.appendChild(el('div', 'tmg-zone'));
    track.appendChild(marker);
    s.area.appendChild(track);

    function res() { return { hits: hits, rounds: ROUNDS }; }

    function judge(ok) {
      decided = true;
      decidedAt = lastT;
      if (ok) hits++;
      s.status(ok ? 'Green! ' + hits + ' so far' : 'Missed');
    }

    function nextRound() {
      round++;
      roundStart = lastT;
      decided = false;
      marker.style.left = '0px';
      s.status('Round ' + (round + 1) + ' of ' + ROUNDS + ': tap in the green');
    }

    s.on(s.area, 'pointerdown', function (e) {
      e.preventDefault();
      if (!decided) judge(pos >= ZONE_LO && pos <= ZONE_HI);
    });

    nextRound();

    return {
      title: 'Quality check',
      limit: 12000,
      tick: function (t) {
        lastT = t;
        if (!decided) {
          var inRound = t - roundStart;
          pos = tri(inRound / SWEEP_MS);
          marker.style.left = 'calc(' + (pos * 100).toFixed(2) + '% - 4px)';
          if (inRound >= ROUND_MS) judge(false);
        } else if (t - decidedAt >= PAUSE_MS) {
          if (round + 1 >= ROUNDS) s.finish(res());
          else nextRound();
        }
      },
      result: res
    };
  }

  function caravan(s) {
    var TOTAL = 12;
    var GAP = 600;   // ms between drops
    var FALL = 2400; // ms from the top to the bottom
    var spawned = 0;
    var resolved = 0;
    var catches = 0;
    var crates = [];

    function res() { return { catches: catches, total: TOTAL }; }

    function spawn(t0) {
      var node = el('div', 'tmg-target tmg-crate', '📦');
      var w = s.area.clientWidth || 300;
      var crate = { t0: t0, live: true, node: node };
      node.style.left = Math.round(Math.random() * Math.max(0, w - TARGET)) + 'px';
      node.style.top = '0px';
      s.on(node, 'pointerdown', function (e) {
        e.preventDefault();
        if (!crate.live) return;
        crate.live = false;
        catches++;
        resolved++;
        node.remove();
        s.status('Caught ' + catches + ' of ' + TOTAL);
      });
      s.area.appendChild(node);
      crates.push(crate);
    }

    return {
      title: 'Caravan',
      limit: 10000,
      tick: function (t) {
        while (spawned < TOTAL && t >= spawned * GAP) {
          spawn(spawned * GAP);
          spawned++;
        }
        var h = s.area.clientHeight || 300;
        for (var i = 0; i < crates.length; i++) {
          var c = crates[i];
          if (!c.live) continue;
          var f = (t - c.t0) / FALL;
          if (f >= 1) {
            c.live = false;
            resolved++;
            c.node.remove();
            s.status('Missed one · caught ' + catches + ' of ' + TOTAL);
          } else {
            c.node.style.top = Math.round(f * Math.max(0, h - TARGET)) + 'px';
          }
        }
        if (resolved >= TOTAL) s.finish(res());
      },
      result: res
    };
  }

  function audit(s) {
    var COLS = 4;
    var ROWS = 3;
    var STAMPS = 3;
    var stamped = {};
    var answered = {};
    var correct = 0;
    var wrong = 0;

    function res() {
      var score = (correct - wrong) / STAMPS;
      return { score: Math.min(1, Math.max(0, score)) };
    }

    function formCell(index) {
      var cell = el('button', 'tmg-cell', '📄');
      cell.type = 'button';
      if (stamped[index]) cell.appendChild(el('span', 'tmg-stamp', 'STAMP'));
      s.on(cell, 'pointerdown', function (e) {
        e.preventDefault();
        if (answered[index]) return;
        answered[index] = true;
        if (stamped[index]) {
          correct++;
          cell.classList.add('tmg-ok');
        } else {
          wrong++;
          cell.classList.add('tmg-bad');
        }
        s.status(correct + ' of ' + STAMPS + ' found · ' + wrong + ' wrong');
      });
      return cell;
    }

    // Pick the stamped forms with a shuffle.
    var order = [];
    var i;
    for (i = 0; i < COLS * ROWS; i++) order.push(i);
    for (i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    for (i = 0; i < STAMPS; i++) stamped[order[i]] = true;

    var grid = el('div', 'tmg-grid');
    for (i = 0; i < COLS * ROWS; i++) grid.appendChild(formCell(i));
    s.area.appendChild(grid);
    s.status('Tap the ' + STAMPS + ' stamped forms');

    return {
      title: 'Audit',
      limit: 12000,
      tick: function () {
        if (correct >= STAMPS) s.finish(res());
      },
      result: res
    };
  }

  // Open sides at rot 0; each rot step turns the piece clockwise.
  // Sides: 0 = N, 1 = E, 2 = S, 3 = W.
  var EDGE = [[50, 0], [100, 50], [50, 100], [0, 50]];
  var BASE_SIDES = { straight: [0, 2], corner: [0, 1], empty: [] };

  function pipeSvg(cell) {
    var type = cell && BASE_SIDES.hasOwnProperty(cell.type) ? cell.type : 'empty';
    var rot = cell ? (cell.rot || 0) % 4 : 0;
    var d = BASE_SIDES[type].map(function (side) {
      var e = EDGE[(side + rot) % 4];
      return 'M50 50L' + e[0] + ' ' + e[1];
    }).join('');
    if (!d) return '<svg viewBox="0 0 100 100"></svg>';
    return '<svg viewBox="0 0 100 100"><path d="' + d + '" fill="none" stroke="' + GOLD +
      '" stroke-width="16"/><circle cx="50" cy="50" r="8" fill="' + GOLD + '"/></svg>';
  }

  function pipe(s) {
    var M = window.TycoonMinigames;
    var puzzle = M.makePipePuzzle(5, Math.random);
    var size = puzzle.size || 5;
    var grid = el('div', 'tmg-pipe');
    grid.style.gridTemplateColumns = 'repeat(' + size + ', 1fr)';

    function render() {
      var html = '';
      for (var i = 0; i < puzzle.cells.length; i++) {
        var x = i % size;
        var y = Math.floor(i / size);
        var mark = '';
        if (x === puzzle.start.x && y === puzzle.start.y) mark = '<span class="tmg-mark">🏡</span>';
        else if (x === puzzle.end.x && y === puzzle.end.y) mark = '<span class="tmg-mark">🏠</span>';
        html += '<div class="tmg-tile" data-i="' + i + '">' + pipeSvg(puzzle.cells[i]) + mark + '</div>';
      }
      grid.innerHTML = html;
    }

    s.area.classList.add('tmg-area-auto');
    s.area.appendChild(grid);
    render();
    s.status('Join 🏡 to 🏠 by turning the pipes');

    s.on(grid, 'pointerdown', function (e) {
      e.preventDefault();
      var tile = e.target.closest ? e.target.closest('[data-i]') : null;
      if (!tile) return;
      var next = M.rotatePiece(puzzle, Number(tile.getAttribute('data-i')));
      if (next && next.cells) puzzle = next;
      render();
      if (M.isSolved(puzzle)) s.finish({ solved: true });
    });

    return {
      title: 'Pipe fix',
      limit: 40000,
      tick: function () {},
      result: function () { return { solved: false }; }
    };
  }

  var FACTORIES = {
    fireFight: fireFight,
    rush: rush,
    caravan: caravan,
    audit: audit,
    pipe: pipe
  };

  function open(kind, opts, onDone) {
    if (!document.body) {
      callDone(onDone, BLANK[kind]());
      return;
    }
    injectCss();

    var overlay = el('div', 'tmg-overlay');
    var panel = el('div', 'tmg-panel');
    var title = el('h2', 'tmg-title');
    var bar = el('div', 'tmg-bar');
    var fill = el('div', 'tmg-fill');
    var line = el('p', 'tmg-status');
    var area = el('div', 'tmg-area');
    var skip = el('button', 'tmg-skip', 'Skip');
    skip.type = 'button';
    bar.appendChild(fill);
    panel.appendChild(title);
    panel.appendChild(bar);
    panel.appendChild(line);
    panel.appendChild(area);
    panel.appendChild(skip);
    overlay.appendChild(panel);

    var done = false;
    var frameId = 0;
    var capId = 0;
    var start = null;
    var bound = [];
    var game;

    function on(target, type, fn) {
      target.addEventListener(type, fn);
      bound.push([target, type, fn]);
    }

    function finish(result) {
      if (done) return;
      done = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (capId) clearTimeout(capId);
      for (var i = 0; i < bound.length; i++) {
        bound[i][0].removeEventListener(bound[i][1], bound[i][2]);
      }
      bound = [];
      overlay.remove();
      callDone(onDone, result);
    }

    var s = {
      area: area,
      reduce: reducedMotion(),
      status: function (text) { line.textContent = text; },
      on: on,
      finish: finish
    };

    try {
      game = FACTORIES[kind](s, opts || {});
    } catch (err) {
      callDone(onDone, BLANK[kind]());
      return;
    }

    title.textContent = game.title;
    on(skip, 'click', function () { finish(game.result()); });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape') finish(game.result());
    });

    function frame(now) {
      frameId = 0;
      if (done) return;
      if (start === null) start = now;
      var elapsed = now - start;
      if (elapsed >= game.limit) {
        finish(game.result());
        return;
      }
      fill.style.width = (elapsed / game.limit * 100).toFixed(1) + '%';
      game.tick(elapsed);
      if (!done) frameId = requestAnimationFrame(frame);
    }

    document.body.appendChild(overlay);
    frameId = requestAnimationFrame(frame);
    // Safety net: ends the game even if the frame loop stalls, e.g. in a hidden tab.
    capId = setTimeout(function () {
      capId = 0;
      finish(game.result());
    }, game.limit + 400);
  }

  window.TycoonMinigame = {
    fireFight: function (onDone) { open('fireFight', {}, onDone); },
    rush: function (onDone) { open('rush', {}, onDone); },
    caravan: function (onDone) { open('caravan', {}, onDone); },
    audit: function (onDone) { open('audit', {}, onDone); },
    pipe: function (onDone) {
      // Read at call time: the logic script may load after this one.
      var M = window.TycoonMinigames;
      if (!M || typeof M.makePipePuzzle !== 'function' ||
          typeof M.rotatePiece !== 'function' || typeof M.isSolved !== 'function') {
        callDone(onDone, { solved: false });
        return;
      }
      open('pipe', {}, onDone);
    }
  };
})();

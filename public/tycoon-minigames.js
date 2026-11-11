// tycoon-minigames.js
// Rules for the mini-games that speed up or pay out Tycoon work: fire-fighting
// (cuts a cost), rushing (cuts remaining build time), the caravan (a bonus paid
// partly now and partly as the player catches goods), the audit (adds debt,
// less for a good score), the build boost, and the "clear the jam" pipe puzzle.
// Pure functions: no DOM, no localStorage. The only randomness comes through
// the injected rand argument, so the Node tests can replay a run exactly.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TycoonMinigames = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Coerce to a number and keep it in [lo, hi]. NaN falls to lo, so a missing
  // hit count counts as no progress rather than an error.
  function clamp(n, lo, hi) {
    const v = Number(n);
    if (!(v >= lo)) return lo;
    return v > hi ? hi : v;
  }

  // Fire-fighting: each hit in the round cuts the cost, to at most half off.
  // Half is the floor, so even a bad run never makes the fire free and a good
  // run never makes it cost nothing.
  const FIRE_ROUNDS = 4;
  function fireFightCost(cost, hits, rounds = FIRE_ROUNDS) {
    const share = rounds > 0 ? clamp(hits, 0, rounds) / rounds : 0;
    return Math.round(cost * (1 - 0.5 * share));
  }

  // Rushing: each hit takes 10% off the time left, to at most 30% off. It only
  // ever shortens a build, so a rush can never make the wait longer.
  const RUSH_ROUNDS = 3;
  function rushRemainingMs(remainingMs, hits) {
    return Math.round(remainingMs * (1 - 0.1 * clamp(hits, 0, RUSH_ROUNDS)));
  }

  // Caravan: 40% of the bonus is paid as soon as the caravan arrives, and the
  // other 60% is paid in proportion to the goods caught. The two parts are
  // rounded separately, so the cap below keeps now + later within the bonus.
  const CARAVAN_UPFRONT = 0.4;
  function caravanSplit(bonus, catches, total) {
    const now = Math.round(bonus * CARAVAN_UPFRONT);
    const share = total > 0 ? clamp(catches, 0, total) / total : 0;
    const later = total > 0 ? Math.round(bonus * (1 - CARAVAN_UPFRONT) * share) : 0;
    return { now, later: Math.max(0, Math.min(later, bonus - now)) };
  }

  // Audit: the debt added is the full doubling at score 0 (the old behaviour)
  // and nothing at score 1. Floor, so the debt never gains a fraction.
  function auditAddedDebt(debt, score) {
    return Math.floor(debt * (1 - clamp(score, 0, 1)));
  }

  // Build boost: while the boost lasts, building takes half the time.
  const BUILD_BOOST_FACTOR = 0.5;
  function buildTimeFactor(boostLeft) {
    return boostLeft > 0 ? BUILD_BOOST_FACTOR : 1;
  }

  // Pipe puzzle. Sides are named N/E/S/W and listed clockwise, so one quarter
  // turn clockwise moves each open side to the next entry in the list.
  const SIDES = ['N', 'E', 'S', 'W'];
  const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' };
  const DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const BASE_SIDES = { empty: [], straight: ['N', 'S'], corner: ['N', 'E'] };

  // The side name after turning `side` clockwise by `rot` quarter turns.
  function turn(side, rot) {
    const i = SIDES.indexOf(side);
    return SIDES[(((i + rot) % 4) + 4) % 4];
  }

  // Which sides a cell opens toward right now, after its rotation.
  function openSides(cell) {
    const base = BASE_SIDES[cell.type] || [];
    return base.map((s) => turn(s, cell.rot));
  }

  // The side of `from` that faces the adjacent cell `to`.
  function sideToward(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 1) return 'E';
    if (dx === -1) return 'W';
    if (dy === 1) return 'S';
    if (dy === -1) return 'N';
    return null;
  }

  // Lay a path from the left column to the right column. Each column gets a
  // vertical run to a random row, then the path steps east. A column is only
  // visited once, so the path is simple, and it always moves right, so it
  // always reaches the far column.
  function carvePath(n, rand) {
    const pick = (k) => Math.min(k - 1, Math.floor(rand() * k));
    const startY = pick(n);
    const endY = pick(n);
    const path = [{ x: 0, y: startY }];
    let y = startY;
    for (let x = 0; x < n; x++) {
      const target = x < n - 1 ? pick(n) : endY;
      const step = target >= y ? 1 : -1;
      while (y !== target) {
        y += step;
        path.push({ x, y });
      }
      if (x < n - 1) path.push({ x: x + 1, y });
    }
    return path;
  }

  // Build a solvable puzzle. The start is entered from the left edge (W) and the
  // end leaves to the right edge (E), so both edge sides are part of the path.
  // `solution` holds the rot that makes each cell correct, and cells are scrambled
  // until the puzzle is not already solved.
  function makePipePuzzle(size, rand) {
    const n = Math.max(2, Math.floor(size));
    const path = carvePath(n, rand);
    const cells = Array.from({ length: n * n }, () => ({ type: 'empty', rot: 0 }));
    const solution = new Array(n * n).fill(0);
    const pathIndex = [];

    path.forEach((cur, i) => {
      const prev = i > 0 ? path[i - 1] : null;
      const next = i < path.length - 1 ? path[i + 1] : null;
      const inSide = prev ? sideToward(cur, prev) : 'W';
      const outSide = next ? sideToward(cur, next) : 'E';
      const type = OPPOSITE[inSide] === outSide ? 'straight' : 'corner';
      let rot = 0;
      for (let r = 0; r < 4; r++) {
        const sides = BASE_SIDES[type].map((s) => turn(s, r));
        if (sides.includes(inSide) && sides.includes(outSide)) {
          rot = r;
          break;
        }
      }
      const idx = cur.y * n + cur.x;
      cells[idx] = { type, rot };
      solution[idx] = rot;
      pathIndex.push(idx);
    });

    const puzzle = {
      size: n,
      start: { ...path[0] },
      end: { ...path[path.length - 1] },
      cells,
      solution,
    };

    // A real rand almost never returns an already-solved scramble, so the loop is
    // a guard for a degenerate rand rather than a normal path.
    for (let tries = 0; tries < 100; tries++) {
      for (const idx of pathIndex) cells[idx].rot = Math.min(3, Math.floor(rand() * 4));
      if (!isSolved(puzzle)) return puzzle;
    }
    throw new Error('makePipePuzzle: could not scramble an unsolved puzzle');
  }

  // Turn one cell a quarter turn clockwise. Empty cells can be turned harmlessly.
  function rotatePiece(puzzle, index) {
    const cell = puzzle.cells[index];
    cell.rot = (((cell.rot + 1) % 4) + 4) % 4;
  }

  // Solved when a walk of matching open sides runs from the start (entered from
  // the W edge) to the end (left by the E edge). Two cells connect only when each
  // opens toward the other.
  function isSolved(puzzle) {
    const n = puzzle.size;
    const at = (x, y) => puzzle.cells[y * n + x];
    const s = puzzle.start;
    const e = puzzle.end;
    if (!openSides(at(s.x, s.y)).includes('W')) return false;

    const seen = new Set([s.y * n + s.x]);
    const queue = [{ x: s.x, y: s.y }];
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      const open = openSides(at(c.x, c.y));
      if (c.x === e.x && c.y === e.y && open.includes('E')) return true;
      for (const d of open) {
        const nx = c.x + DELTA[d][0];
        const ny = c.y + DELTA[d][1];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const k = ny * n + nx;
        if (seen.has(k)) continue;
        if (!openSides(at(nx, ny)).includes(OPPOSITE[d])) continue;
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return false;
  }

  return {
    FIRE_ROUNDS,
    RUSH_ROUNDS,
    CARAVAN_UPFRONT,
    BUILD_BOOST_FACTOR,
    fireFightCost,
    rushRemainingMs,
    caravanSplit,
    auditAddedDebt,
    buildTimeFactor,
    openSides,
    makePipePuzzle,
    rotatePiece,
    isSolved,
  };
});

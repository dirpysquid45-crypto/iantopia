// Rules for the Tycoon mini-games (public/tycoon-minigames.js). These pin the
// bounds that stop a mini-game from ever costing more, or paying out more,
// than the rule allows, and check that every pipe puzzle can be solved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadModule(name) {
  const file = path.join(__dirname, '..', '..', 'public', name);
  const mod = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(file, 'utf8'))(mod, mod.exports);
  return mod.exports;
}
const M = loadModule('tycoon-minigames.js');

// Small seeded PRNG (mulberry32), so every puzzle in a test is the same each run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('fire-fighting saves between nothing and half the cost, and never goes negative', () => {
  assert.equal(M.fireFightCost(1000, 0), 1000);
  assert.equal(M.fireFightCost(1000, M.FIRE_ROUNDS), 500);
  let prev = Infinity;
  for (let hits = -2; hits <= M.FIRE_ROUNDS + 3; hits++) {
    const c = M.fireFightCost(1000, hits);
    assert.ok(c >= 500 && c <= 1000, `hits ${hits} gave ${c}`);
    assert.ok(c <= prev, `more hits must not raise the cost (at ${hits})`);
    prev = c;
  }
  assert.equal(M.fireFightCost(1000, 99), 500, 'hits above the rounds clamp to the max saving');
  assert.equal(M.fireFightCost(0, 2), 0);
});

test('fire-fighting uses the rounds it is given', () => {
  assert.equal(M.fireFightCost(1000, 2, 2), 500);
  assert.equal(M.fireFightCost(1000, 1, 2), 750);
});

test('rushing never lengthens a build, and clamps the hits', () => {
  assert.equal(M.rushRemainingMs(60000, 0), 60000);
  assert.equal(M.rushRemainingMs(60000, -4), 60000);
  for (let hits = 0; hits <= 6; hits++) {
    assert.ok(M.rushRemainingMs(60000, hits) <= 60000, `hits ${hits} grew the time`);
  }
  assert.equal(M.rushRemainingMs(60000, M.RUSH_ROUNDS), 42000);
  assert.equal(M.rushRemainingMs(60000, 10), M.rushRemainingMs(60000, M.RUSH_ROUNDS));
  assert.ok(M.rushRemainingMs(60000, 10) >= 0);
});

test('the caravan never pays out more than its bonus', () => {
  for (const bonus of [0, 1, 3, 7, 9, 11, 250, 1001]) {
    for (let catches = 0; catches <= 12; catches++) {
      const { now, later } = M.caravanSplit(bonus, catches, 10);
      assert.ok(now >= 0 && later >= 0, `negative payout for bonus ${bonus}`);
      assert.ok(now + later <= bonus, `bonus ${bonus}, catches ${catches} paid ${now + later}`);
    }
    const full = M.caravanSplit(bonus, 10, 10);
    assert.equal(full.now + full.later, bonus, `a full catch pays the whole bonus (${bonus})`);
  }
});

test('the caravan pays 40% up front and nothing later when there were no goods', () => {
  assert.deepEqual(M.caravanSplit(1000, 0, 0), { now: 400, later: 0 });
  assert.deepEqual(M.caravanSplit(1000, 5, 0), { now: 400, later: 0 });
  assert.deepEqual(M.caravanSplit(1000, 0, 10), { now: 400, later: 0 });
  assert.deepEqual(M.caravanSplit(1000, 10, 10), { now: 400, later: 600 });
  assert.deepEqual(M.caravanSplit(1000, 50, 10), { now: 400, later: 600 }, 'catches clamp to total');
});

test('the audit adds the full doubling at score 0 and nothing at a perfect score', () => {
  assert.equal(M.auditAddedDebt(800, 0), 800, 'score 0 doubles the debt');
  assert.equal(M.auditAddedDebt(800, 1), 0, 'a perfect score adds nothing');
  assert.equal(M.auditAddedDebt(800, 0.5), 400);
  assert.equal(M.auditAddedDebt(801, 0.5), 400, 'floors the added debt');
  assert.equal(M.auditAddedDebt(800, -3), 800, 'scores below 0 clamp to 0');
  assert.equal(M.auditAddedDebt(800, 7), 0, 'scores above 1 clamp to 1');
});

test('the build boost halves build time only while it lasts', () => {
  assert.equal(M.buildTimeFactor(1), M.BUILD_BOOST_FACTOR);
  assert.equal(M.BUILD_BOOST_FACTOR, 0.5);
  assert.equal(M.buildTimeFactor(0), 1);
  assert.equal(M.buildTimeFactor(-5), 1);
});

test('a quarter turn moves open sides clockwise', () => {
  assert.deepEqual(M.openSides({ type: 'straight', rot: 0 }).sort(), ['N', 'S']);
  assert.deepEqual(M.openSides({ type: 'straight', rot: 1 }).sort(), ['E', 'W']);
  assert.deepEqual(M.openSides({ type: 'corner', rot: 0 }).sort(), ['E', 'N']);
  assert.deepEqual(M.openSides({ type: 'corner', rot: 2 }).sort(), ['S', 'W']);
  assert.deepEqual(M.openSides({ type: 'empty', rot: 3 }), []);
});

test('a new pipe puzzle starts unsolved, and the stored solution solves it', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const puzzle = M.makePipePuzzle(5, mulberry32(seed));
    assert.equal(puzzle.size, 5);
    assert.equal(puzzle.cells.length, 25);
    assert.equal(puzzle.solution.length, 25);
    assert.deepEqual(puzzle.start, { x: 0, y: puzzle.start.y });
    assert.deepEqual(puzzle.end, { x: 4, y: puzzle.end.y });
    assert.equal(M.isSolved(puzzle), false, `seed ${seed} starts already solved`);

    const applied = { ...puzzle, cells: puzzle.cells.map((c, i) => ({ type: c.type, rot: puzzle.solution[i] })) };
    assert.equal(M.isSolved(applied), true, `seed ${seed}: the stored solution does not solve it`);
  }
});

test('the solution uses only real pieces, with empty cells at rot 0', () => {
  const puzzle = M.makePipePuzzle(6, mulberry32(7));
  let pieces = 0;
  puzzle.cells.forEach((c, i) => {
    if (c.type === 'empty') assert.equal(puzzle.solution[i], 0);
    else pieces++;
  });
  assert.ok(pieces >= 6, 'a path from the left to the right column has at least `size` cells');
  assert.ok(puzzle.cells.every((c) => ['empty', 'straight', 'corner'].includes(c.type)));
});

test('the start is on the left column, the end on the right column', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const p = M.makePipePuzzle(4, mulberry32(seed));
    assert.equal(p.start.x, 0);
    assert.equal(p.end.x, 3);
    assert.ok(p.start.y >= 0 && p.start.y < 4 && p.end.y >= 0 && p.end.y < 4);
  }
});

test('the same seed makes the same puzzle', () => {
  const a = M.makePipePuzzle(5, mulberry32(42));
  const b = M.makePipePuzzle(5, mulberry32(42));
  assert.deepEqual(a, b);
});

test('rotatePiece turns one cell a quarter turn and wraps at 4', () => {
  const puzzle = M.makePipePuzzle(5, mulberry32(3));
  const idx = puzzle.solution.findIndex((_, i) => puzzle.cells[i].type !== 'empty');
  const before = puzzle.cells[idx].rot;
  M.rotatePiece(puzzle, idx);
  assert.equal(puzzle.cells[idx].rot, (before + 1) % 4);
  for (let k = 0; k < 3; k++) M.rotatePiece(puzzle, idx);
  assert.equal(puzzle.cells[idx].rot, before, 'four turns return the piece to where it was');
});

test('rotating an empty cell is harmless', () => {
  const puzzle = M.makePipePuzzle(5, mulberry32(9));
  const idx = puzzle.cells.findIndex((c) => c.type === 'empty');
  const solvedBefore = M.isSolved(puzzle);
  M.rotatePiece(puzzle, idx);
  assert.equal(puzzle.cells[idx].type, 'empty');
  assert.equal(M.isSolved(puzzle), solvedBefore);
});

test('a puzzle is solved once every path piece is turned to its solution', () => {
  const puzzle = M.makePipePuzzle(5, mulberry32(11));
  puzzle.cells.forEach((c, i) => {
    while (c.rot !== puzzle.solution[i]) M.rotatePiece(puzzle, i);
  });
  assert.equal(M.isSolved(puzzle), true);
});

test('isSolved is false on the scrambled start for several seeds and sizes', () => {
  for (const size of [2, 3, 5, 8]) {
    for (let seed = 1; seed <= 15; seed++) {
      const puzzle = M.makePipePuzzle(size, mulberry32(seed * 101 + size));
      assert.equal(M.isSolved(puzzle), false, `size ${size}, seed ${seed} starts solved`);
    }
  }
});

test('isSolved is false when the start is not open toward the left edge', () => {
  const puzzle = M.makePipePuzzle(5, mulberry32(5));
  const s = puzzle.start;
  const idx = s.y * puzzle.size + s.x;
  puzzle.cells[idx] = { type: 'straight', rot: 0 };
  assert.equal(M.isSolved(puzzle), false);
});

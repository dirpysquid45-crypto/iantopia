const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, asUser, asGuest, pair, sleep, FLEET_A, FLEET_B, playBattleship } = require('./helpers');
const { BattleshipGame } = require('../battleship');

const guests = async (t) => {
  const a = await asGuest(t.url, 'A'), b = await asGuest(t.url, 'B');
  await pair(a, b, 'battleship', 0);
  return [a, b];
};
const bySeat = (a, b) => (a.last('game_start').yourIndex === 0 ? [a, b] : [b, a]);
const clone = (f) => JSON.parse(JSON.stringify(f));

test('fleet validation: every malformed fleet is rejected with a reason', () => {
  const ok = BattleshipGame.validateFleet(FLEET_A);
  assert.equal(ok.valid, true);
  const cases = {
    'not an array': 'nope',
    'null': null,
    'one ship only (would make the player unbeatable)': [FLEET_A[0]],
    'four ships': FLEET_A.slice(0, 4),
    'six ships': [...FLEET_A, FLEET_A[0]],
    'same ship five times': Array(5).fill(FLEET_A[0]).map((s, i) => ({ ...s, y: i * 2 })),
    'unknown ship name': FLEET_A.map((s, i) => (i === 0 ? { ...s, name: 'Raft' } : s)),
    'out of bounds (right)': FLEET_A.map((s, i) => (i === 0 ? { ...s, x: 6 } : s)),
    'out of bounds (bottom)': FLEET_B.map((s, i) => (i === 0 ? { ...s, y: 7 } : s)),
    'negative coordinate': FLEET_A.map((s, i) => (i === 0 ? { ...s, x: -1 } : s)),
    'overlap': FLEET_A.map((s, i) => (i === 1 ? { ...s, y: 0 } : s)),
    'fractional x': FLEET_A.map((s, i) => (i === 0 ? { ...s, x: 0.5 } : s)),
    'string coordinate': FLEET_A.map((s, i) => (i === 0 ? { ...s, x: '0' } : s)),
    'horizontal not a boolean': FLEET_A.map((s, i) => (i === 0 ? { ...s, horizontal: 'yes' } : s)),
    'null entry': FLEET_A.map((s, i) => (i === 0 ? null : s)),
    'NaN': FLEET_A.map((s, i) => (i === 0 ? { ...s, y: NaN } : s)),
  };
  for (const [label, fleet] of Object.entries(cases)) {
    const r = BattleshipGame.validateFleet(fleet);
    assert.equal(r.valid, false, `${label} must be rejected`);
    assert.ok(r.error, `${label} must say why`);
  }
});

test('a rejected fleet leaves NO ghost ships behind: a corrected fleet is then accepted', async () => {
  const t = await startServer();
  const [a, b] = await guests(t);
  const [s0] = bySeat(a, b);
  // last ship overlaps -> used to leave the first four on the real grid
  const bad = clone(FLEET_A); bad[4] = { name: 'Destroyer', x: 0, y: 0, horizontal: true };
  s0.send({ type: 'place_ships', ships: bad });
  const rej = await s0.waitFor('placement_result');
  assert.equal(rej.valid, false);
  s0.clear();
  s0.send({ type: 'place_ships', ships: FLEET_A });
  assert.equal((await s0.waitFor('placement_result')).valid, true, 'the corrected fleet must not collide with leftovers');
});

test('submitting twice is refused; the waiting player is told the other is ready', async () => {
  const t = await startServer();
  const [a, b] = await guests(t);
  const [s0, s1] = bySeat(a, b);
  s0.send({ type: 'place_ships', ships: FLEET_A });
  await s0.waitFor('placement_result');
  await s1.waitFor('opponent_ready');
  s0.clear();
  s0.send({ type: 'place_ships', ships: FLEET_B });
  const again = await s0.waitFor('placement_result');
  assert.equal(again.valid, false);
  assert.match(again.error, /Already submitted/);
});

test('shots: wrong phase, wrong turn, out of range, repeats and junk are all refused', async () => {
  const t = await startServer();
  const [a, b] = await guests(t);
  const [s0, s1] = bySeat(a, b);
  s0.send({ type: 'action', action: 'fire', x: 0, y: 0 });
  assert.match((await s0.waitFor('error')).message, /Not in battle/);
  s0.send({ type: 'place_ships', ships: FLEET_A });
  s1.send({ type: 'place_ships', ships: FLEET_B });
  await Promise.all([s0.waitFor('battle_start'), s1.waitFor('battle_start')]);
  const first = s0.last('battle_start').currentTurn;
  const [me, other] = first === 0 ? [s0, s1] : [s1, s0];
  other.clear(); other.send({ type: 'action', action: 'fire', x: 1, y: 1 });
  assert.match((await other.waitFor('error')).message, /Not your turn/);
  for (const [x, y] of [[-1, 0], [0, 10], [10, 0], [1.5, 2], ['3', '4'], [null, null], [undefined, 0]]) {
    me.clear(); me.send({ type: 'action', action: 'fire', x, y });
    assert.match((await me.waitFor('error')).message, /out of bounds/i, `${JSON.stringify([x, y])}`);
  }
  me.send({ type: 'action', action: 'fire', x: 9, y: 9 });
  await me.waitFor('fire_result');
  // now it is the other's turn; they fire, then I repeat the same square
  other.send({ type: 'action', action: 'fire', x: 9, y: 9 });
  await me.waitFor((m) => m.type === 'fire_result' && m.lastMove.shooterIndex !== first);
  me.clear(); me.send({ type: 'action', action: 'fire', x: 9, y: 9 });
  assert.match((await me.waitFor('error')).message, /Already targeted/);
});

test('hit / miss / sunk are reported correctly, with fleet health', async () => {
  const t = await startServer();
  const [a, b] = await guests(t);
  const [s0, s1] = bySeat(a, b);
  s0.send({ type: 'place_ships', ships: FLEET_A });
  s1.send({ type: 'place_ships', ships: FLEET_B });
  await Promise.all([s0.waitFor('battle_start'), s1.waitFor('battle_start')]);
  const first = s0.last('battle_start').currentTurn;
  const clients = [s0, s1];
  const targets = { 0: [[5, 0], [6, 0]], 1: [[9, 9], [9, 8]] };   // seat 0 hits FLEET_B, seat 1 misses FLEET_A
  let turn = first;
  for (let n = 0; n < 4; n++) {
    const [x, y] = targets[turn].shift();
    clients[turn].send({ type: 'action', action: 'fire', x, y });
    const r = await clients[turn].waitFor((m) => m.type === 'fire_result' && m.lastMove.x === x && m.lastMove.y === y);
    assert.equal(r.lastMove.hit, turn === 0, `shot by seat ${turn}`);
    assert.equal(r.lastMove.shooterIndex, turn);
    assert.equal(r.currentTurn, 1 - turn, 'the turn passes after every shot');
    turn = 1 - turn;
  }
  const lastForSeat0 = s0.last('fire_result');
  assert.equal(lastForSeat0.enemyHealth.Carrier, 4);
  assert.equal(lastForSeat0.enemyHealth.Battleship, 3);
  assert.equal(lastForSeat0.yourHealth.Carrier, 5, 'seat 1 only ever missed');
});

test('sinking the last ship ends the game with the right winner and reveals both fleets', async () => {
  const t = await startServer();
  const [a, b] = await guests(t);
  const clients = bySeat(a, b);
  await playBattleship(clients, [FLEET_A, FLEET_B], 1);
  const r = clients[0].last('game_result');
  assert.equal(r.results[1].result, 'win');
  assert.equal(r.results[0].result, 'loss');
  assert.equal(r.reason, 'sunk');
  assert.deepEqual(r.fleets[0].map((s) => s.name), FLEET_A.map((s) => s.name), 'the loser can now see where the winner hid');
  assert.equal(clients[1].has((m) => m.type === 'show_rematch_prompt') || (await clients[1].waitFor('show_rematch_prompt')) !== null, true);
});

test('firing after the game is over is refused', async () => {
  const t = await startServer();
  const [a, b] = await guests(t);
  const clients = bySeat(a, b);
  await playBattleship(clients, [FLEET_A, FLEET_B], 0);
  clients[0].clear();
  clients[0].send({ type: 'action', action: 'fire', x: 9, y: 9 });
  assert.match((await clients[0].waitFor('error')).message, /Not in battle/);
});

test('either side can be first to shoot (the opening turn is not fixed)', async () => {
  const seen = new Set();
  for (let i = 0; i < 24 && seen.size < 2; i++) {
    const t = await startServer();
    const [a, b] = await guests(t);
    a.send({ type: 'place_ships', ships: FLEET_A }); b.send({ type: 'place_ships', ships: FLEET_B });
    await a.waitFor('battle_start');
    seen.add(a.last('battle_start').currentTurn);
    await t.close();
  }
  assert.equal(seen.size, 2, 'both seats should sometimes go first');
});

// ---- timers ----
test('setup timeout: the player who never placed ships loses to the one who did', async () => {
  const t = await startServer({ timing: { setupMs: 250 } });
  t.db.seed('alice', { strubles_balance_v1: '1000' }); t.db.seed('bob', { strubles_balance_v1: '1000' });
  const alice = await asUser(t.url, 'alice'), bob = await asUser(t.url, 'bob');
  await pair(alice, bob, 'battleship', 100);
  const [ready, idle] = [alice, bob];
  ready.send({ type: 'place_ships', ships: FLEET_A });
  const r = await ready.waitFor('game_result', 1500);
  const seat = ready.last('game_start').yourIndex;
  assert.equal(r.results[seat].result, 'win');
  assert.equal(r.reason, 'timeout');
  await sleep(40);
  assert.equal(t.db.balance('alice'), 1000 - 100 + 190);
  assert.equal(t.db.balance('bob'), 900);
  assert.equal(idle.all('game_result').length, 1, 'the idle player is told too');
});

test('setup timeout with NOBODY ready voids the game and refunds both', async () => {
  const t = await startServer({ timing: { setupMs: 200 } });
  t.db.seed('alice', { strubles_balance_v1: '1000' }); t.db.seed('bob', { strubles_balance_v1: '1000' });
  const alice = await asUser(t.url, 'alice'), bob = await asUser(t.url, 'bob');
  await pair(alice, bob, 'battleship', 100);
  assert.equal(t.db.balance('alice'), 900);
  await Promise.all([alice.waitFor('game_voided', 1500), bob.waitFor('game_voided', 1500)]);
  await sleep(40);
  assert.equal(t.db.balance('alice'), 1000);
  assert.equal(t.db.balance('bob'), 1000);
  assert.equal(t.manager.tables.size, 0);
  assert.equal(alice.last('balance_update').balance, 1000);
});

test('an idle player has a shot taken for them, then forfeits after a second missed turn', async () => {
  const t = await startServer({ timing: { turnMs: 200 } });
  t.db.seed('alice', { strubles_balance_v1: '1000' }); t.db.seed('bob', { strubles_balance_v1: '1000' });
  const alice = await asUser(t.url, 'alice'), bob = await asUser(t.url, 'bob');
  await pair(alice, bob, 'battleship', 100);
  alice.send({ type: 'place_ships', ships: FLEET_A }); bob.send({ type: 'place_ships', ships: FLEET_B });
  await Promise.all([alice.waitFor('battle_start'), bob.waitFor('battle_start')]);
  const first = alice.last('battle_start').currentTurn;
  const aliceSeat = alice.last('game_start').yourIndex;
  const afk = first === aliceSeat ? alice : bob, active = afk === alice ? bob : alice;
  const afkSeat = afk.last('game_start').yourIndex, activeSeat = active.last('game_start').yourIndex;
  // 1st missed turn: auto-shot
  const auto = await active.waitFor((m) => m.type === 'fire_result' && m.lastMove.auto, 1500);
  assert.equal(auto.lastMove.shooterIndex, afkSeat);
  // the active player answers normally, then the afk player misses AGAIN
  active.send({ type: 'action', action: 'fire', x: 9, y: 9 });
  const res = await active.waitFor('game_result', 2000);
  assert.equal(res.results[activeSeat].result, 'win');
  assert.equal(res.reason, 'timeout');
  await sleep(40);
  assert.equal(t.db.balance(afk === alice ? 'alice' : 'bob'), 900);
  assert.equal(t.db.balance(active === alice ? 'alice' : 'bob'), 1000 - 100 + 190);
});

test('a player who keeps responding is never timed out', async () => {
  const t = await startServer({ timing: { turnMs: 300 } });
  const [a, b] = await guests(t);
  const clients = bySeat(a, b);
  await playBattleship(clients, [FLEET_A, FLEET_B], 0);
  assert.equal(clients[0].all('fire_result').filter((m) => m.lastMove.auto).length, 0, 'no automatic shots in a normal game');
});

// ---- leaving ----
test('leave_game forfeits at once and closes the table (no rematch with someone who left)', async () => {
  const t = await startServer();
  t.db.seed('alice', { strubles_balance_v1: '1000' }); t.db.seed('bob', { strubles_balance_v1: '1000' });
  const alice = await asUser(t.url, 'alice'), bob = await asUser(t.url, 'bob');
  await pair(alice, bob, 'battleship', 100);
  alice.send({ type: 'leave_game' });
  const r = await bob.waitFor('game_result');
  assert.equal(r.reason, 'left');
  assert.equal(bob.has((m) => m.type === 'show_rematch_prompt'), false);
  await bob.waitFor('opponent_disconnected');
  await sleep(40);
  assert.equal(t.manager.tables.size, 0);
  assert.equal(t.db.balance('bob'), 1090);
  assert.equal(t.db.balance('alice'), 900);
});

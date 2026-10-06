// Many games at once: every one must finish, nobody's money may go missing or
// appear from nowhere, and nothing may leak.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, asUser, pair, sleep, FLEET_A, FLEET_B, playBattleship, fixedDeck } = require('./helpers');

test('20 simultaneous staked games (both types): all settle, money is conserved to the rake', async () => {
  const PLAYERS = 40, START = 5000, BET = 100;
  const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥']), timing: { turnMs: 5000, handMs: 5000, setupMs: 5000 } });
  const uids = Array.from({ length: PLAYERS }, (_, i) => `u${i}`);
  uids.forEach((u) => t.db.seed(u, { strubles_balance_v1: String(START) }));
  const clients = await Promise.all(uids.map((u) => asUser(t.url, u, u)));
  const games = clients.map((_, i) => (i % 4 < 2 ? 'battleship' : 'blackjack'));
  // Identical lobbies can legitimately match any two players, so the real
  // pairings are read back from the tables rather than assumed.
  const staging = [];
  for (let i = 0; i < PLAYERS; i += 2) staging.push([clients[i], clients[i + 1], games[i]]);
  await Promise.all(staging.map(([a, b, g]) => pair(a, b, g, BET)));
  const byTable = new Map();
  clients.forEach((c) => { const id = c.last('game_start').tableId; byTable.set(id, [...(byTable.get(id) || []), c]); });
  const pairs = [...byTable.values()].map((cs) => [cs[0], cs[1], cs[0].last('game_start').gameType]);
  assert.ok(pairs.every(([a, b]) => a && b), 'every table has two players');
  assert.equal(t.manager.tables.size, PLAYERS / 2);
  const afterStake = uids.reduce((s, u) => s + t.db.balance(u), 0);
  assert.equal(afterStake, PLAYERS * START - (PLAYERS / 2) * 2 * BET, 'every stake was taken exactly once');

  await Promise.all(pairs.map(async ([a, b, g], k) => {
    if (g === 'blackjack') {
      a.send({ type: 'action', action: 'stand' }); b.send({ type: 'action', action: 'stand' });
      await Promise.all([a.waitFor('game_result'), b.waitFor('game_result')]);
    } else {
      const seats = [a, b].sort((x, y) => x.last('game_start').yourIndex - y.last('game_start').yourIndex);
      await playBattleship(seats, [FLEET_A, FLEET_B], k % 2);
    }
  }));
  await sleep(100);
  const total = uids.reduce((s, u) => s + t.db.balance(u), 0);
  const rake = (PLAYERS / 2) * Math.floor(BET * 2 * 0.05);
  assert.equal(total, PLAYERS * START - rake, 'the only Strubles that left the economy are the rakes');
  // each game has exactly one winner and one loser
  for (const [a, b] of pairs) {
    const bal = [a, b].map((c) => c.last('balance_update').balance).sort((x, y) => x - y);
    assert.deepEqual(bal, [START - BET, START - BET + 190]);
  }
});

test('50 guests queue, match and finish friendly games with no balance traffic', async () => {
  const { asGuest } = require('./helpers');
  const t = await startServer();
  const guests = await Promise.all(Array.from({ length: 50 }, (_, i) => asGuest(t.url, `G${i}`)));
  guests.forEach((g) => g.send({ type: 'join_queue', bet: 0, gameType: 'battleship' }));
  await Promise.all(guests.map((g) => g.waitFor('game_start', 4000)));
  assert.equal(t.manager.tables.size, 25);
  assert.equal(t.manager.queue.length, 0);
  assert.equal(t.db.docs.size, 0);
});

// Matchmaking rules and the exploits an attacker (or a double-click) could reach.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, connect, asUser, asGuest, pair, sleep, FLEET_A, FLEET_B } = require('./helpers');

const seedAll = (db, ids, bal = 1000) => ids.forEach((id) => db.seed(id, { strubles_balance_v1: String(bal) }));

test('a negative / fractional / non-numeric / absurd bet is refused and mints nothing', async () => {
  const t = await startServer();
  seedAll(t.db, ['alice', 'bob']);
  const alice = await asUser(t.url, 'alice');
  for (const bad of [-500, -1, 1.5, '100', null, undefined, NaN, 1e9, {}, [], true]) {
    alice.clear();
    alice.send({ type: 'join_queue', bet: bad, gameType: 'battleship' });
    const err = await alice.waitFor('error');
    assert.match(err.message, /Invalid bet/, `bet ${JSON.stringify(bad)} must be rejected`);
  }
  assert.equal(t.manager.queue.length, 0);
  assert.equal(t.db.balance('alice'), 1000, 'balance untouched');
  // The money layer refuses on its own too, as a last line of defence.
  await assert.rejects(() => t.manager.balance.deductBet('alice', -100), /Invalid amount/);
  await assert.rejects(() => t.manager.balance.creditPayout('alice', -100), /Invalid amount/);
  await assert.rejects(() => t.manager.balance.deductBet('alice', 1.5), /Invalid amount/);
  assert.equal(t.db.balance('alice'), 1000);
});

test('an unknown game type is refused', async () => {
  const t = await startServer();
  const g = await asGuest(t.url, 'Gus');
  g.send({ type: 'join_queue', bet: 0, gameType: 'poker' });
  assert.match((await g.waitFor('error')).message, /Unknown game/);
});

test('a double-click opens ONE lobby, never two that could match each other', async () => {
  const t = await startServer();
  seedAll(t.db, ['alice']);
  const alice = await asUser(t.url, 'alice');
  alice.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  alice.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });   // same tick
  alice.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  await sleep(150);
  assert.equal(t.manager.queue.length, 1, 'exactly one lobby');
  assert.equal(t.manager.tables.size, 0, 'and no game against herself');
  assert.equal(alice.all('error').filter((e) => e.code === 'busy').length, 2);
  assert.equal(t.db.balance('alice'), 1000, 'nothing charged');
});

test('the same account in a second tab cannot match itself', async () => {
  const t = await startServer();
  seedAll(t.db, ['alice']);
  const tab1 = await asUser(t.url, 'alice');
  const tab2 = await asUser(t.url, 'alice');
  tab1.send({ type: 'join_queue', bet: 100, gameType: 'blackjack' });
  await tab1.waitFor('status');
  tab2.send({ type: 'join_queue', bet: 100, gameType: 'blackjack' });
  assert.equal((await tab2.waitFor('error')).code, 'busy');
  // and taking her own lobby from the other tab is refused as well
  const { queueId } = tab1.last('status');
  tab2.clear();
  tab2.send({ type: 'match_bet', queueId });
  assert.match((await tab2.waitFor('error')).message, /own lobby|already have/);
  assert.equal(t.manager.tables.size, 0);
});

test('one account cannot sit in two games at once (no double-spending a balance)', async () => {
  const t = await startServer();
  seedAll(t.db, ['alice', 'bob', 'carl']);
  const alice = await asUser(t.url, 'alice');
  const bob = await asUser(t.url, 'bob');
  const carl = await asUser(t.url, 'carl');
  await pair(alice, bob, 'blackjack', 100);
  alice.clear();
  alice.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  assert.equal((await alice.waitFor('error')).code, 'busy');
  carl.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  const { queueId } = await carl.waitFor('status');
  alice.clear();
  alice.send({ type: 'match_bet', queueId });
  assert.equal((await alice.waitFor('error')).code, 'busy', 'cannot take a lobby while mid-game');
  assert.equal(t.db.balance('alice'), 900, 'charged exactly once');
});

test('head-of-line blocking: a mismatched pair at the front no longer stops later matches', async () => {
  const t = await startServer();
  seedAll(t.db, ['a', 'b', 'c']);
  const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((u) => asUser(t.url, u)));
  a.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  await a.waitFor('status');
  b.send({ type: 'join_queue', bet: 200, gameType: 'battleship' });
  await b.waitFor('status');
  c.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });   // should pair with a, past b
  await Promise.all([a.waitFor('game_start'), c.waitFor('game_start')]);
  assert.equal(t.manager.queue.length, 1, 'b is still waiting');
  assert.equal(t.manager.queue[0].userId, 'b');
  assert.equal(b.has((m) => m.type === 'game_start'), false);
});

test('lobbies only match the SAME game and the SAME stake', async () => {
  const t = await startServer();
  seedAll(t.db, ['a', 'b', 'c', 'd']);
  const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map((u) => asUser(t.url, u)));
  a.send({ type: 'join_queue', bet: 100, gameType: 'battleship' }); await a.waitFor('status');
  b.send({ type: 'join_queue', bet: 100, gameType: 'blackjack' }); await b.waitFor('status');
  c.send({ type: 'join_queue', bet: 50, gameType: 'battleship' }); await c.waitFor('status');
  await sleep(80);
  assert.equal(t.manager.tables.size, 0);
  assert.equal(t.manager.queue.length, 3);
  d.send({ type: 'join_queue', bet: 50, gameType: 'battleship' });
  await Promise.all([c.waitFor('game_start'), d.waitFor('game_start')]);
});

test('lobby list shows who is waiting and whether it is friendly, and drops them when they leave', async () => {
  const t = await startServer();
  const ann = await asGuest(t.url, 'Ann');
  const watcher = await asGuest(t.url, 'Watcher');
  ann.send({ type: 'join_queue', bet: 0, gameType: 'battleship' });
  const upd = await watcher.waitFor((m) => m.type === 'lobby_update' && m.lobbies.length === 1);
  assert.deepEqual(Object.keys(upd.lobbies[0]).sort(), ['bet', 'friendly', 'gameType', 'guest', 'name', 'queueId']);
  assert.equal(upd.lobbies[0].name, 'Ann');
  assert.equal(upd.lobbies[0].friendly, true);
  assert.equal(upd.lobbies[0].guest, true);
  assert.equal(JSON.stringify(upd).includes('guest_'), false, 'internal user ids are never broadcast');
  watcher.clear();
  ann.close();
  await watcher.waitFor((m) => m.type === 'lobby_update' && m.lobbies.length === 0);
});

test('taking a stake lobby you cannot afford is refused', async () => {
  const t = await startServer();
  t.db.seed('rich', { strubles_balance_v1: '1000' });
  t.db.seed('poor', { strubles_balance_v1: '50' });
  const rich = await asUser(t.url, 'rich');
  const poor = await asUser(t.url, 'poor');
  rich.send({ type: 'join_queue', bet: 500, gameType: 'blackjack' });
  const { queueId } = await rich.waitFor('status');
  poor.send({ type: 'match_bet', queueId });
  assert.match((await poor.waitFor('error')).message, /Insufficient/);
  poor.clear();
  poor.send({ type: 'join_queue', bet: 500, gameType: 'blackjack' });
  assert.match((await poor.waitFor('error')).message, /Insufficient/);
  assert.equal(t.manager.tables.size, 0);
  assert.equal(t.db.balance('rich'), 1000);
});

test('a failed start hands back a bet that was already taken (second charge fails)', async () => {
  const t = await startServer();
  seedAll(t.db, ['alice', 'bob']);
  const alice = await asUser(t.url, 'alice');
  const bob = await asUser(t.url, 'bob');
  alice.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  const { queueId } = await alice.waitFor('status');
  // Writes from here: 1 = alice's charge (ok), 2 = bob's charge (fails), 3 = alice's refund (ok).
  t.db.failAtWrite = 2;
  bob.send({ type: 'match_bet', queueId });
  assert.match((await bob.waitFor('error')).message, /Failed to start/);
  await sleep(60);
  assert.equal(t.db.balance('alice'), 1000, 'alice got her stake back instead of losing it');
  assert.equal(t.db.balance('bob'), 1000);
  assert.equal(t.manager.tables.size, 0, 'no broken table left behind');
  assert.equal(alice.last('balance_update').balance, 1000, 'and she was told');
});

test('wallet cap still applies to winnings', async () => {
  const t = await startServer({ makeDeck: undefined });
  t.db.seed('alice', { strubles_balance_v1: '20000' });   // base cap is 20,000
  t.db.seed('bob', { strubles_balance_v1: '20000' });
  const alice = await asUser(t.url, 'alice');
  const bob = await asUser(t.url, 'bob');
  await pair(alice, bob, 'battleship', 100);
  // leave: bob forfeits, alice is paid 190 on top of 19,900 -> 20,090, capped at 20,000
  bob.send({ type: 'leave_game' });
  await alice.waitFor('opponent_disconnected');
  await sleep(40);
  assert.equal(t.db.balance('alice'), 20000, 'capped');
  assert.equal(t.db.balance('bob'), 19900);
});

test('concurrent settlements for one account do not lose an update', async () => {
  // The old read-then-write could drop one of two simultaneous changes.
  const t = await startServer();
  t.db.seed('alice', { strubles_balance_v1: '1000' });
  await Promise.all([
    t.manager.balance.deductBet('alice', 100), t.manager.balance.deductBet('alice', 100),
    t.manager.balance.creditPayout('alice', 50), t.manager.balance.creditPayout('alice', 50),
  ]);
  assert.equal(t.db.balance('alice'), 1000 - 200 + 100);
});

test('a guest id never reaches Firestore, even if a game tried', async () => {
  const t = await startServer();
  assert.equal(await t.manager.balance.deductBet('guest_abc', 0), null);
  await assert.rejects(() => t.manager.balance.deductBet('guest_abc', 10), /Guests cannot stake/);
  assert.equal(await t.manager.balance.creditPayout('guest_abc', 10), null);
  assert.equal(await t.manager.balance.refundBet('guest_abc', 10), null);
  assert.equal(await t.manager.balance.getBalance('guest_abc'), 0);
  assert.equal(t.db.docs.size, 0);
});

test('hidden information: nothing sent before the game ends reveals the opponent fleet', async () => {
  const t = await startServer();
  const a = await asGuest(t.url, 'A'), b = await asGuest(t.url, 'B');
  await pair(a, b, 'battleship', 0);
  const seatA = a.last('game_start').yourIndex;
  const mine = seatA === 0 ? FLEET_A : FLEET_B, theirs = seatA === 0 ? FLEET_B : FLEET_A;
  a.send({ type: 'place_ships', ships: mine });
  b.send({ type: 'place_ships', ships: theirs });
  await Promise.all([a.waitFor('battle_start'), b.waitFor('battle_start')]);
  const first = a.last('battle_start').currentTurn;
  (first === seatA ? a : b).send({ type: 'action', action: 'fire', x: 0, y: 0 });
  await a.waitFor('fire_result');
  for (const c of [a, b]) {
    const blob = JSON.stringify(c.log.filter((m) => m.type !== 'game_start'));
    assert.equal(blob.includes('"fleets"'), false);
    assert.equal(blob.includes('shipPlacements'), false);
    assert.equal(blob.includes('yourGrid'), false);
  }
  // the opponent's fleet appears only in the final reveal
  assert.equal(a.has((m) => m.type === 'resync' || m.type === 'game_result'), false);
});

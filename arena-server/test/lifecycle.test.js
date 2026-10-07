const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, connect, asUser, asGuest, pair, sleep, FLEET_A, FLEET_B, playBattleship, fixedDeck } = require('./helpers');

const START = 1000;
const seat = (c) => c.last('game_start').yourIndex;

async function stakedBattleship(opts) {
  const t = await startServer(opts);
  t.db.seed('alice', { strubles_balance_v1: String(START) }); t.db.seed('bob', { strubles_balance_v1: String(START) });
  const alice = await asUser(t.url, 'alice', 'Alice'), bob = await asUser(t.url, 'bob', 'Bob');
  await pair(alice, bob, 'battleship', 100);
  return { ...t, alice, bob };
}
const place = async (t) => {
  const fleet = (c) => (seat(c) === 0 ? FLEET_A : FLEET_B);
  t.alice.send({ type: 'place_ships', ships: fleet(t.alice) });
  t.bob.send({ type: 'place_ships', ships: fleet(t.bob) });
  await Promise.all([t.alice.waitFor('battle_start'), t.bob.waitFor('battle_start')]);
};

// ---------------- reconnecting ----------------
test('a dropped player is NOT forfeited: they reconnect within the grace period and carry on', async () => {
  const t = await stakedBattleship({ timing: { graceMs: 600, turnMs: 5000 } });
  await place(t);
  const first = t.alice.last('battle_start').currentTurn;
  // play one shot each so there is real state to restore
  const [one, two] = first === seat(t.alice) ? [t.alice, t.bob] : [t.bob, t.alice];
  one.send({ type: 'action', action: 'fire', x: 5, y: 0 });
  await two.waitFor('fire_result');
  two.send({ type: 'action', action: 'fire', x: 9, y: 9 });
  await one.waitFor((m) => m.type === 'fire_result' && m.lastMove.shooterIndex === seat(two));

  two.kill();                                                    // phone loses signal
  const away = await one.waitFor('opponent_away');
  assert.equal(away.graceMs, 600);
  await sleep(150);

  const two2 = await asUser(t.url, two === t.alice ? 'alice' : 'bob');
  const rs = await two2.waitFor('resync');
  assert.equal(rs.gameType, 'battleship');
  assert.equal(rs.state, 'battle');
  assert.equal(rs.yourIndex, seat(two));
  assert.ok(rs.yourShips.length === 5, 'their own fleet is restored');
  assert.equal(rs.mine.flat().filter((c) => c !== 0).length, 1 + (seat(one) === 0 ? 0 : 0), 'the shots that landed on them are restored');
  assert.equal(rs.radar.flat().filter((c) => c !== 0).length, 1, 'and the shots they made');
  await one.waitFor('opponent_back');

  await sleep(800);                                              // well past the grace period
  assert.equal(t.manager.tables.size, 1, 'the game is still alive');
  assert.equal(one.has((m) => m.type === 'game_result'), false, 'nobody was forfeited');
  // and it is playable: whoever's turn it is can fire
  const turn = rs.currentTurn;
  const mover = turn === seat(one) ? one : two2;
  mover.send({ type: 'action', action: 'fire', x: 8, y: 8 });
  await one.waitFor((m) => m.type === 'fire_result' && m.lastMove.x === 8);
});

test('a player who never returns forfeits after the grace period and the opponent is paid', async () => {
  const t = await stakedBattleship({ timing: { graceMs: 250 } });
  await place(t);
  t.bob.kill();
  await t.alice.waitFor('opponent_away');
  const r = await t.alice.waitFor('game_result', 1500);
  assert.equal(r.results[seat(t.alice)].result, 'win');
  await t.alice.waitFor('opponent_disconnected');
  await sleep(40);
  assert.equal(t.db.balance('alice'), 1090);
  assert.equal(t.db.balance('bob'), 900);
  assert.equal(t.manager.tables.size, 0);
});

test('reconnecting twice is fine, and a late reconnect (after forfeit) just lands in the lobby', async () => {
  const t = await stakedBattleship({ timing: { graceMs: 200 } });
  await place(t);
  t.bob.kill();
  await t.alice.waitFor('game_result', 1500);
  const bob2 = await asUser(t.url, 'bob');
  await sleep(60);
  assert.equal(bob2.has((m) => m.type === 'resync'), false, 'nothing to resume');
  bob2.send({ type: 'join_queue', bet: 0, gameType: 'battleship' });
  await bob2.waitFor('status');                                  // free to queue again
});

test('a NEW connection takes over the seat even before the old socket has been noticed dead', async () => {
  const t = await stakedBattleship({ timing: { graceMs: 5000 } });
  await place(t);
  const bobOld = t.bob;
  const bobNew = await asUser(t.url, 'bob');
  const rs = await bobNew.waitFor('resync');
  assert.equal(rs.state, 'battle');
  await bobOld.waitFor(() => bobOld.closed !== null || false).catch(() => {});
  await sleep(50);
  assert.equal(bobOld.closed && bobOld.closed.code, 4000, 'the old socket is told it was replaced');
  assert.equal(t.alice.last('opponent_back') !== undefined, true);
  // the game continues with the NEW socket
  const turn = rs.currentTurn;
  const bobSeat = rs.yourIndex;
  if (turn === bobSeat) bobNew.send({ type: 'action', action: 'fire', x: 7, y: 7 });
  else t.alice.send({ type: 'action', action: 'fire', x: 7, y: 7 });
  await bobNew.waitFor('fire_result');
});

test('guests resume with the same guest id, and a different id cannot hijack the seat', async () => {
  const t = await startServer({ timing: { graceMs: 2000 } });
  const a = await asGuest(t.url, 'Ann', 'aaaaaaaaaaaaaaaa');
  const b = await asGuest(t.url, 'Ben', 'bbbbbbbbbbbbbbbb');
  await pair(a, b, 'battleship', 0);
  b.kill();
  await a.waitFor('opponent_away');
  const imposter = await asGuest(t.url, 'Ben', 'cccccccccccccccc');
  await sleep(80);
  assert.equal(imposter.has((m) => m.type === 'resync'), false, 'a different guest id gets nothing');
  const real = await asGuest(t.url, 'Ben', 'bbbbbbbbbbbbbbbb');
  const rs = await real.waitFor('resync');
  assert.equal(rs.opponentName, 'Ann');
});

test('blackjack resumes mid-hand with the same cards', async () => {
  const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥']), timing: { graceMs: 1500, handMs: 5000 } });
  const a = await asGuest(t.url, 'Ann', 'aaaaaaaaaaaaaaaa'), b = await asGuest(t.url, 'Ben', 'bbbbbbbbbbbbbbbb');
  await pair(a, b, 'blackjack', 0);
  const before = b.last('game_start');
  b.kill();
  await a.waitFor('opponent_away');
  const b2 = await asGuest(t.url, 'Ben', 'bbbbbbbbbbbbbbbb');
  const again = await b2.waitFor('game_start');
  assert.equal(again.resync, true);
  assert.deepEqual(again.yourHand, before.yourHand, 'the same cards, not a re-deal');
  assert.equal(again.opponentCardCount, before.opponentCardCount);
  assert.equal(again.yourIndex, before.yourIndex);
});

test('blackjack: resuming after the hand ended shows the result and the rematch prompt', async () => {
  const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥']), timing: { rematchMs: 3000, graceMs: 2000 } });
  const a = await asGuest(t.url, 'Ann', 'aaaaaaaaaaaaaaaa'), b = await asGuest(t.url, 'Ben', 'bbbbbbbbbbbbbbbb');
  await pair(a, b, 'blackjack', 0);
  a.send({ type: 'action', action: 'stand' }); b.send({ type: 'action', action: 'stand' });
  await b.waitFor('game_result');
  a.kill();
  await sleep(60);
  // Leaving the result screen counts as declining: the other player is released.
  await b.waitFor('rematch_declined');
  await b.waitFor('ready_for_queue');
});

// ---------------- rematches ----------------
test('battleship rematch: both accept -> new game, stakes charged again, boards reset', async () => {
  const t = await stakedBattleship();
  const clients = [t.alice, t.bob].sort((x, y) => seat(x) - seat(y));
  await playBattleship(clients, [FLEET_A, FLEET_B], 0);
  await Promise.all(clients.map((c) => c.waitFor('show_rematch_prompt')));
  await sleep(40);
  const afterGame = { w: t.db.balance(clients[0] === t.alice ? 'alice' : 'bob'), l: t.db.balance(clients[1] === t.alice ? 'alice' : 'bob') };
  assert.deepEqual(afterGame, { w: 1090, l: 900 });
  clients[0].send({ type: 'rematch_accept' });
  await clients[1].waitFor('rematch_opponent_accepted');
  clients[1].send({ type: 'rematch_accept' });
  const [g0, g1] = await Promise.all(clients.map((c) => c.waitFor((m) => m.type === 'game_start' && m.isRematch)));
  assert.equal(g0.isRematch, true);
  assert.equal(t.db.balance(clients[0] === t.alice ? 'alice' : 'bob'), 990, 'both staked again');
  assert.equal(t.db.balance(clients[1] === t.alice ? 'alice' : 'bob'), 800);
  // the new game is a fresh setup phase and fully playable
  clients.forEach((c, i) => c.send({ type: 'place_ships', ships: i === 0 ? FLEET_A : FLEET_B }));
  await Promise.all(clients.map((c) => c.waitFor((m) => m.type === 'battle_start', 2000, c.log.findIndex((x) => x.type === 'game_start' && x.isRematch))));
});

test('battleship rematch: declining releases both players', async () => {
  const t = await stakedBattleship();
  const clients = [t.alice, t.bob].sort((x, y) => seat(x) - seat(y));
  await playBattleship(clients, [FLEET_A, FLEET_B], 1);
  await clients[0].waitFor('show_rematch_prompt');
  clients[0].send({ type: 'rematch_decline' });
  await clients[1].waitFor('rematch_declined');
  await Promise.all(clients.map((c) => c.waitFor('ready_for_queue')));
  assert.equal(t.manager.tables.size, 0);
  // and both are free to queue again straight away
  clients[1].send({ type: 'join_queue', bet: 0, gameType: 'battleship' });
  await clients[1].waitFor((m) => m.type === 'status');
});

test('rematch prompt times out for everyone, including a player who had already accepted', async () => {
  // Blackjack used to leave an accepting player waiting forever when the other said nothing.
  for (const game of ['battleship', 'blackjack']) {
    const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥']), timing: { rematchMs: 250 } });
    const a = await asGuest(t.url, 'A'), b = await asGuest(t.url, 'B');
    await pair(a, b, game, 0);
    if (game === 'battleship') await playBattleship([a, b].sort((x, y) => seat(x) - seat(y)), [FLEET_A, FLEET_B], 0);
    else { a.send({ type: 'action', action: 'stand' }); b.send({ type: 'action', action: 'stand' }); await a.waitFor('game_result'); }
    await a.waitFor('show_rematch_prompt');
    a.send({ type: 'rematch_accept' });                                  // only one accepts
    const dec = await a.waitFor('rematch_declined', 1500);
    assert.equal(dec.reason, 'timeout', game);
    await a.waitFor('ready_for_queue');
    await b.waitFor('ready_for_queue');
    assert.equal(t.manager.tables.size, 0, game);
    await t.close();
  }
});

test('rematch with a player who can no longer afford it: refunds the other and closes', async () => {
  const t = await stakedBattleship();
  const clients = [t.alice, t.bob].sort((x, y) => seat(x) - seat(y));
  await playBattleship(clients, [FLEET_A, FLEET_B], 0);
  await clients[0].waitFor('show_rematch_prompt');
  const loserUid = clients[1] === t.alice ? 'alice' : 'bob', winnerUid = clients[0] === t.alice ? 'alice' : 'bob';
  t.db.seed(loserUid, { strubles_balance_v1: '10' });                   // can't cover another 100
  clients[0].send({ type: 'rematch_accept' }); clients[1].send({ type: 'rematch_accept' });
  await clients[0].waitFor('rematch_failed', 2000);
  await sleep(60);
  assert.equal(t.db.balance(winnerUid), 1090, 'the winner was not left charged for a game that never began');
  assert.equal(t.db.balance(loserUid), 10);
  await clients[0].waitFor('ready_for_queue', 2500);
});

// ---------------- blackjack timers ----------------
test('blackjack: a hand nobody finishes is stood on automatically and settled', async () => {
  const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥']), timing: { handMs: 250 } });
  t.db.seed('alice', { strubles_balance_v1: '1000' }); t.db.seed('bob', { strubles_balance_v1: '1000' });
  const alice = await asUser(t.url, 'alice'), bob = await asUser(t.url, 'bob');
  await pair(alice, bob, 'blackjack', 100);
  const r = await alice.waitFor('game_result', 1500);                   // neither ever acted
  assert.ok(r.results.some((x) => x.result === 'win'));
  await sleep(40);
  assert.equal(t.db.balance('alice') + t.db.balance('bob'), 2000 - 20 /* the 10% pot... */ + 10, 'pot minus the 10 rake');
});

test('blackjack: only the slow player is auto-stood; the quick one keeps their choice', async () => {
  const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥'], ['2♣']), timing: { handMs: 300 } });
  const a = await asGuest(t.url, 'A'), b = await asGuest(t.url, 'B');
  await pair(a, b, 'blackjack', 0);
  const fast = seat(a) === 0 ? a : b;
  fast.send({ type: 'action', action: 'stand' });
  const r = await a.waitFor('game_result', 1500);
  assert.equal(r.results[0].result, 'win', 'seat 0 held 19 against 17');
});

test('blackjack: junk actions are ignored and cannot act twice', async () => {
  const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥'], ['2♣', '3♣']) });
  const a = await asGuest(t.url, 'A'), b = await asGuest(t.url, 'B');
  await pair(a, b, 'blackjack', 0);
  a.clear();
  a.send({ type: 'action', action: 'fold' });
  a.send({ type: 'action', action: undefined });
  a.send({ type: 'action' });
  await sleep(80);
  assert.equal(a.all('game_update').length, 0, 'nothing happened');
  a.send({ type: 'action', action: 'stand' });
  a.send({ type: 'action', action: 'stand' });
  a.send({ type: 'action', action: 'hit' });                             // after standing
  await sleep(80);
  assert.equal(a.all('game_update').length, 1, 'only the first stand counted');
});

test('REGRESSION: a reconnected player can still act (their session is not deleted by the takeover)', async () => {
  const t = await startServer({ timing: { graceMs: 5000, turnMs: 20000, handMs: 20000 } });
  const a = await asGuest(t.url, 'A', 'aaaaaaaaaaaaaaaa'), b = await asGuest(t.url, 'B', 'bbbbbbbbbbbbbbbb');
  await pair(a, b, 'battleship', 0);
  const fleet = (c) => (seat(c) === 0 ? FLEET_A : FLEET_B);
  a.send({ type: 'place_ships', ships: fleet(a) }); b.send({ type: 'place_ships', ships: fleet(b) });
  await Promise.all([a.waitFor('battle_start'), b.waitFor('battle_start')]);
  a.kill();
  await b.waitFor('opponent_away');
  const a2 = await asGuest(t.url, 'A', 'aaaaaaaaaaaaaaaa');
  const rs = await a2.waitFor('resync');
  assert.equal(t.manager.connections.size, 2, 'both players are still registered after the takeover');
  // The reconnected player fires when it is their turn, otherwise the opponent shoots first.
  if (rs.currentTurn !== seat(a)) {
    b.send({ type: 'action', action: 'fire', x: 9, y: 9 });
    await a2.waitFor('fire_result');
  }
  a2.send({ type: 'action', action: 'fire', x: 8, y: 8 });
  const r = await a2.waitFor((m) => m.type === 'fire_result' && m.lastMove.x === 8);
  assert.equal(r.lastMove.shooterIndex, seat(a), 'the reconnected player\'s shot was processed');
  await b.waitFor((m) => m.type === 'fire_result' && m.lastMove.x === 8);
});

test('REGRESSION: a reconnected blackjack player can hit/stand', async () => {
  const t = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥']), timing: { graceMs: 5000, handMs: 20000 } });
  const a = await asGuest(t.url, 'A', 'aaaaaaaaaaaaaaaa'), b = await asGuest(t.url, 'B', 'bbbbbbbbbbbbbbbb');
  await pair(a, b, 'blackjack', 0);
  a.kill();
  await b.waitFor('opponent_away');
  const a2 = await asGuest(t.url, 'A', 'aaaaaaaaaaaaaaaa');
  await a2.waitFor('game_start');
  a2.send({ type: 'action', action: 'stand' });
  b.send({ type: 'action', action: 'stand' });
  const r = await a2.waitFor('game_result', 2000);
  assert.ok(r.results.some((x) => x.result === 'win'), 'the hand settled, so the reconnected player\'s stand counted');
});

test('REGRESSION: a reconnected player can leave / rematch / be matched again', async () => {
  const t = await startServer({ timing: { graceMs: 5000 } });
  const a = await asGuest(t.url, 'A', 'aaaaaaaaaaaaaaaa'), b = await asGuest(t.url, 'B', 'bbbbbbbbbbbbbbbb');
  await pair(a, b, 'battleship', 0);
  a.kill();
  await b.waitFor('opponent_away');
  const a2 = await asGuest(t.url, 'A', 'aaaaaaaaaaaaaaaa');
  await a2.waitFor('resync');
  a2.send({ type: 'leave_game' });
  await b.waitFor('game_result');
  assert.equal(t.manager.tables.size, 0);
});

// Who gets paid, who pays, and what each player is told. These are the tests
// that matter most: they use two different accounts and check BOTH balances
// against the fake Firestore, so a payout to the wrong account, a missing
// deduction, or a swapped winner all fail loudly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, asUser, asGuest, pair, sleep, FLEET_A, FLEET_B, playBattleship, fixedDeck } = require('./helpers');

const START = 1000, BET = 100;
const RAKE = Math.floor(BET * 2 * 0.05);      // 10
const PAYOUT = BET * 2 - RAKE;                // 190: winner receives the pot minus the rake

async function setup(deck) {
  const ctx = await startServer({ makeDeck: deck ? () => deck.slice() : undefined });
  ctx.db.seed('alice', { strubles_balance_v1: String(START) });
  ctx.db.seed('bob', { strubles_balance_v1: String(START) });
  const alice = await asUser(ctx.url, 'alice', 'Alice');
  const bob = await asUser(ctx.url, 'bob', 'Bob');
  return { ...ctx, alice, bob };
}
const last = (c) => c.all('balance_update').map((m) => m.balance).pop();

test('blackjack: the WINNER is paid pot minus rake and the LOSER pays their bet', async () => {
  // alice 10+9 = 19 beats bob 10+7 = 17; both stand
  const t = await setup(fixedDeck(['K♠', '9♦'], ['10♣', '7♥']));
  await pair(t.alice, t.bob, 'blackjack', BET);
  assert.equal(t.db.balance('alice'), START - BET, 'alice staked');
  assert.equal(t.db.balance('bob'), START - BET, 'bob staked');
  const ai = t.alice.last('game_start').yourIndex;
  assert.notEqual(ai, t.bob.last('game_start').yourIndex);
  // each side's own seat does the standing
  t.alice.send({ type: 'action', action: 'stand' });
  t.bob.send({ type: 'action', action: 'stand' });
  const [ra, rb] = await Promise.all([t.alice.waitFor('game_result'), t.bob.waitFor('game_result')]);
  // the seat that dealt 19 wins, whichever seat that is
  const aliceWon = ai === 0;
  assert.equal(ra.results[ai].result, aliceWon ? 'win' : 'loss');
  assert.equal(rb.results[1 - ai].result, aliceWon ? 'loss' : 'win');
  await sleep(30);
  const winner = aliceWon ? 'alice' : 'bob', loser = aliceWon ? 'bob' : 'alice';
  assert.equal(t.db.balance(winner), START - BET + PAYOUT, 'winner: +pot minus rake');
  assert.equal(t.db.balance(loser), START - BET, 'loser: stake gone, nothing back');
  // and the money in Firestore is exactly what each client was told
  const clients = { alice: t.alice, bob: t.bob };
  assert.equal(last(clients[winner]), START - BET + PAYOUT);
  assert.equal(last(clients[loser]), START - BET);
  assert.equal(t.db.balance('alice') + t.db.balance('bob'), START * 2 - RAKE, 'only the rake leaves the economy');
  await t.close();
});

test('blackjack: the payout follows the WINNING cards, not seat order or who queued first', async () => {
  // Same as above but the second seat holds the better hand.
  const t = await setup(fixedDeck(['10♠', '7♦'], ['K♣', '9♥']));
  await pair(t.alice, t.bob, 'blackjack', BET);
  const ai = t.alice.last('game_start').yourIndex;
  t.alice.send({ type: 'action', action: 'stand' });
  t.bob.send({ type: 'action', action: 'stand' });
  await Promise.all([t.alice.waitFor('game_result'), t.bob.waitFor('game_result')]);
  await sleep(30);
  // seat 1 holds 19. Whoever sits in seat 1 must be the one paid.
  const seat1 = ai === 1 ? 'alice' : 'bob', seat0 = ai === 1 ? 'bob' : 'alice';
  assert.equal(t.db.balance(seat1), START - BET + PAYOUT);
  assert.equal(t.db.balance(seat0), START - BET);
  await t.close();
});

test('blackjack: a tie returns each stake in full and nobody pays rake', async () => {
  const t = await setup(fixedDeck(['10♠', '8♦'], ['10♣', '8♥']));
  await pair(t.alice, t.bob, 'blackjack', BET);
  t.alice.send({ type: 'action', action: 'stand' });
  t.bob.send({ type: 'action', action: 'stand' });
  await Promise.all([t.alice.waitFor('game_result'), t.bob.waitFor('game_result')]);
  await sleep(30);
  assert.equal(t.db.balance('alice'), START);
  assert.equal(t.db.balance('bob'), START);
  assert.equal(last(t.alice), START);
  assert.equal(last(t.bob), START);
  await t.close();
});

test('blackjack: busting loses the hand and pays the opponent', async () => {
  // seat 0: K+9 hits a 5 -> 24 bust. seat 1 stands on 17.
  const t = await setup(fixedDeck(['K♠', '9♦'], ['10♣', '7♥'], ['5♣']));
  await pair(t.alice, t.bob, 'blackjack', BET);
  const ai = t.alice.last('game_start').yourIndex;
  const seat0 = ai === 0 ? t.alice : t.bob, seat1 = ai === 0 ? t.bob : t.alice;
  seat0.send({ type: 'action', action: 'hit' });
  seat1.send({ type: 'action', action: 'stand' });
  await Promise.all([t.alice.waitFor('game_result'), t.bob.waitFor('game_result')]);
  await sleep(30);
  const seat0Uid = ai === 0 ? 'alice' : 'bob', seat1Uid = ai === 0 ? 'bob' : 'alice';
  assert.equal(t.db.balance(seat1Uid), START - BET + PAYOUT, 'the non-bust player is paid');
  assert.equal(t.db.balance(seat0Uid), START - BET, 'the bust player loses their stake');
  await t.close();
});

test('blackjack: leaving mid-hand forfeits the pot to the player who stayed', async () => {
  const t = await setup(fixedDeck(['10♠', '8♦'], ['10♣', '9♥']));
  await pair(t.alice, t.bob, 'blackjack', BET);
  t.alice.send({ type: 'leave_game' });
  await t.bob.waitFor('opponent_disconnected');
  await sleep(30);
  assert.equal(t.db.balance('bob'), START - BET + PAYOUT, 'bob (stayed) is paid');
  assert.equal(t.db.balance('alice'), START - BET, 'alice (left) forfeits');
  await t.close();
});

test('battleship: the winner is paid, the loser is not, and clients are told the right balance', async () => {
  for (const winnerSeat of [0, 1]) {
    const t = await setup();
    await pair(t.alice, t.bob, 'battleship', BET);
    const seat = { alice: t.alice.last('game_start').yourIndex, bob: t.bob.last('game_start').yourIndex };
    const bySeat = [t.alice, t.bob].sort((a, b) => seat[a === t.alice ? 'alice' : 'bob'] - seat[b === t.alice ? 'alice' : 'bob']);
    const uidBySeat = seat.alice === 0 ? ['alice', 'bob'] : ['bob', 'alice'];
    const clients = seat.alice === 0 ? [t.alice, t.bob] : [t.bob, t.alice];
    assert.equal(t.db.balance('alice'), START - BET);
    assert.equal(t.db.balance('bob'), START - BET);
    await playBattleship(clients, [FLEET_A, FLEET_B], winnerSeat);
    await sleep(40);
    const winner = uidBySeat[winnerSeat], loser = uidBySeat[1 - winnerSeat];
    assert.equal(t.db.balance(winner), START - BET + PAYOUT, `seat ${winnerSeat} wins: paid`);
    assert.equal(t.db.balance(loser), START - BET, 'loser keeps nothing back');
    assert.equal(last(clients[winnerSeat]), START - BET + PAYOUT);
    assert.equal(last(clients[1 - winnerSeat]), START - BET);
    const result = clients[0].last('game_result');
    assert.equal(result.results[winnerSeat].result, 'win');
    assert.equal(result.results[winnerSeat].payout, PAYOUT);
    assert.equal(result.results[1 - winnerSeat].payout, 0);
    await t.close();
  }
});

test('FRIENDLY (0 Strubles): no balance moves in either game, and no balance update is sent', async () => {
  for (const game of ['battleship', 'blackjack']) {
    const t = await setup(game === 'blackjack' ? fixedDeck(['K♠', '9♦'], ['10♣', '7♥']) : undefined);
    await pair(t.alice, t.bob, game, 0);
    assert.equal(t.alice.last('game_start').friendly, true);
    assert.equal(t.db.balance('alice'), START, `${game}: nothing deducted at the start`);
    if (game === 'battleship') {
      const clients = t.alice.last('game_start').yourIndex === 0 ? [t.alice, t.bob] : [t.bob, t.alice];
      await playBattleship(clients, [FLEET_A, FLEET_B], 0);
    } else {
      t.alice.send({ type: 'action', action: 'stand' });
      t.bob.send({ type: 'action', action: 'stand' });
      await Promise.all([t.alice.waitFor('game_result'), t.bob.waitFor('game_result')]);
    }
    await sleep(40);
    assert.equal(t.db.balance('alice'), START, `${game}: winner gets nothing extra`);
    assert.equal(t.db.balance('bob'), START, `${game}: loser loses nothing`);
    assert.equal(t.alice.all('balance_update').length + t.bob.all('balance_update').length, 0, `${game}: no balance traffic`);
    assert.equal(t.alice.last('game_result').friendly, true);
    await t.close();
  }
});

test('FRIENDLY: guests can play each other with no account and no Firestore document', async () => {
  for (const game of ['battleship', 'blackjack']) {
    const ctx = await startServer({ makeDeck: () => fixedDeck(['K♠', '9♦'], ['10♣', '7♥']) });
    const g1 = await asGuest(ctx.url, 'Ann');
    const g2 = await asGuest(ctx.url, 'Ben');
    assert.equal(g1.last('auth_ok').guest, true);
    await pair(g1, g2, game, 0);
    assert.equal(g1.last('game_start').opponentName, 'Ben');
    assert.equal(g2.last('game_start').opponentName, 'Ann');
    if (game === 'battleship') {
      const clients = g1.last('game_start').yourIndex === 0 ? [g1, g2] : [g2, g1];
      await playBattleship(clients, [FLEET_A, FLEET_B], 1);
    } else {
      g1.send({ type: 'action', action: 'stand' }); g2.send({ type: 'action', action: 'stand' });
      await Promise.all([g1.waitFor('game_result'), g2.waitFor('game_result')]);
    }
    assert.equal(ctx.db.docs.size, 0, `${game}: a guest game never creates or touches a Firestore document`);
    await ctx.close();
  }
});

test('FRIENDLY: a signed-in player and a guest can play each other', async () => {
  const ctx = await startServer();
  ctx.db.seed('alice', { strubles_balance_v1: '500' });
  const alice = await asUser(ctx.url, 'alice', 'Alice');
  const guest = await asGuest(ctx.url, 'Gus');
  await pair(alice, guest, 'battleship', 0);
  assert.equal(alice.last('game_start').opponentName, 'Gus');
  assert.equal(ctx.db.balance('alice'), 500, 'alice is not charged');
  await ctx.close();
});

test('a guest can NOT stake Strubles, open or take a stake lobby', async () => {
  const ctx = await startServer();
  ctx.db.seed('alice', { strubles_balance_v1: '1000' });
  const alice = await asUser(ctx.url, 'alice', 'Alice');
  const guest = await asGuest(ctx.url, 'Gus');
  guest.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  const e1 = await guest.waitFor('error');
  assert.equal(e1.code, 'guest_stake');
  alice.send({ type: 'join_queue', bet: 100, gameType: 'battleship' });
  const { queueId } = await alice.waitFor('status');
  guest.clear();
  guest.send({ type: 'match_bet', queueId });
  assert.equal((await guest.waitFor('error')).code, 'guest_stake');
  assert.equal(ctx.db.balance('alice'), 1000, 'alice was never charged: no game started');
  assert.equal(ctx.manager.tables.size, 0);
  await ctx.close();
});

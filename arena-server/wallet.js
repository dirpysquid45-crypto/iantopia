/**
 * The Strubles wallet. The server is the only writer of a signed-in player's
 * balance: the browser sends operations, and this applies each one in its own
 * transaction, checking the rules below. The Firestore rules refuse balance
 * writes from the browser, so a player can't edit their number directly.
 *
 * Operations:
 *   stake    a solo-game bet. Spends the amount and opens (or adds to) a round.
 *   settle   a solo-game result for an open round. Pays at most stake x the game's
 *            maximum multiplier. Closes the round. A loss settles at 0.
 *   win      income that isn't a bet (tycoon, horse, solitaire, lootbox), capped
 *            per source per day.
 *   spend    a purchase or a build. Adds to the refund budget.
 *   refund   money back for a purchase. Only up to the refund budget, so a lost
 *            bet can't come back this way.
 *   tetris   solo Tetris pay, capped per game and per day.
 *   starter  the one-time starting grant.
 *   daily    the daily prize, rolled here with the page's weights.
 *
 * What the server can and can't check:
 *   - Caps, rounds, budgets and claims are enforced here, whatever the browser says.
 *   - A round settles once, and never above stake x multiplier. A browser that never
 *     sends the loss settlement leaves its round open for a while, and an open round
 *     can still be claimed up to stake x multiplier. Closing that fully needs the
 *     games run on the server.
 *   - The per-source income caps (SOURCE_DAILY_CAP) are a policy choice, and the
 *     numbers are provisional.
 *
 * Every op carries an id, which is stored, so a retry after a dropped reply isn't
 * applied twice.
 */
const BalanceManager = require('./balance');

const { START_BALANCE, balanceOf } = BalanceManager;
// The starting balance is already START_BALANCE (100) for every account, so the starter
// claim is kept as a one-time marker and adds nothing. It used to add another 100.
const STARTER_AMOUNT = 0;
// Daily prize tiers, as the home page shows them: [amount, weight out of 100].
const DAILY_TIERS = [[500, 50], [1000, 27], [2000, 15], [3500, 6], [5000, 2]];
const TETRIS_PER_GAME = 150;
const TETRIS_PER_DAY = 600;
// The most a stake can pay back, as a multiple of the stake. Blackjack: a blackjack
// pays 2.5x. Minesweeper: Expert pays 6x (Hormuz 4.5x).
const STAKE_MULT = { blackjack: 2.5, minesweeper: 6 };
// Income that isn't a bet, per source, per UTC day. PROVISIONAL.
const SOURCE_DAILY_CAP = { tycoon: 20000, horse: 2000, solitaire: 2000, lootbox: 5000, other: 2000 };
const MAX_OP_AMOUNT = 1000000;
const OPEN_ROUNDS_MAX = 20;
const ROUND_TTL_MS = 2 * 3600 * 1000;
const REFUND_BUDGET_MAX = 1000000;
const SEEN_KEEP = 200;          // how many op ids are remembered per account
const OPS_PER_MINUTE = 240;     // per account, across all its ops
const KINDS = new Set(['stake', 'settle', 'win', 'refund', 'spend', 'tetris', 'starter', 'daily']);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function dayKey(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function rollDaily(rand) {
  let r = rand() * 100;
  for (const [amount, weight] of DAILY_TIERS) {
    if (r < weight) return amount;
    r -= weight;
  }
  return DAILY_TIERS[0][0];
}

// A whole amount no larger than the limit. Zero is allowed only where a loss settles.
function wholeAmount(v, allowZero) {
  return Number.isSafeInteger(v) && v <= MAX_OP_AMOUNT && (allowZero ? v >= 0 : v > 0);
}

class Wallet {
  constructor(db, balance, opts = {}) {
    this.db = db;
    this.balance = balance || new BalanceManager(db);
    this.sessions = opts.sessions || null;   // PlaySessions, for the admin's play report
    this.now = opts.now || (() => Date.now());
    this.rand = opts.rand || Math.random;
    this.rate = new Map();
  }

  allow(uid) {
    const t = this.now();
    const list = (this.rate.get(uid) || []).filter((x) => t - x < 60000);
    if (list.length >= OPS_PER_MINUTE) { this.rate.set(uid, list); return false; }
    list.push(t);
    this.rate.set(uid, list);
    return true;
  }

  // What the browser shows: the balance, the cap, and the claims made today.
  async read(uid) {
    const snap = await this.db.collection('users').doc(uid).get();
    const data = snap.exists ? snap.data() : {};
    const claims = data.wallet_claims || {};
    return {
      balance: balanceOf(data),
      cap: this.balance.capFromData(data),
      starterClaimed: !!claims.starter,
      dailyClaimedToday: claims.daily === dayKey(this.now()),
      // The village name, as set by POST /village/name. Null until it has been set.
      villageName: typeof data.village_name === 'string' ? data.village_name : null,
    };
  }

  // Applies a batch in order. Each op is its own transaction, so a failure in one
  // doesn't roll back the others that already went through.
  async applyBatch(uid, ops) {
    const results = [];
    for (const op of ops) results.push(await this.applyOne(uid, op));
    if (this.sessions) {
      // Recording a session must never fail the player's ops, so its errors are only logged.
      const items = ops.map((op, i) => ({ page: op && typeof op.page === 'string' ? op.page.slice(0, 120) : null, kind: op && op.kind, applied: results[i].applied, ok: results[i].ok && !results[i].duplicate }))
        .filter((it) => it.ok);
      this.sessions.record(uid, items).catch((e) => console.error('[sessions] record failed:', e.message));
    }
    return results;
  }

  async applyOne(uid, op) {
    const id = op && typeof op.id === 'string' && ID_RE.test(op.id) ? op.id : null;
    if (!id) return { id: null, ok: false, error: 'bad_id' };
    if (!op || !KINDS.has(op.kind)) return { id, ok: false, error: 'bad_kind' };
    if (!this.allow(uid)) return { id, ok: false, error: 'rate_limited' };
    if (await BalanceManager.isBanned(this.db, uid, this.now())) return { id, ok: false, error: 'banned' };

    const page = typeof op.page === 'string' ? op.page.slice(0, 120) : null;
    const game = typeof op.game === 'string' && STAKE_MULT[op.game] ? op.game : null;
    const round = typeof op.round === 'string' && ID_RE.test(op.round) ? op.round : null;
    const source = typeof op.source === 'string' && SOURCE_DAILY_CAP[op.source] ? op.source : 'other';
    let amount = 0;
    if (op.kind === 'settle') {
      if (!wholeAmount(op.amount, true)) return { id, ok: false, error: 'bad_amount' };
      amount = op.amount;
    } else if (['stake', 'win', 'refund', 'spend'].includes(op.kind)) {
      if (!wholeAmount(op.amount, false)) return { id, ok: false, error: 'bad_amount' };
      amount = op.amount;
    }
    if (op.kind === 'stake' || op.kind === 'settle') {
      if (!game) return { id, ok: false, error: 'bad_game' };
      if (!round) return { id, ok: false, error: 'bad_round' };
    }
    let points = 0;
    if (op.kind === 'tetris') {
      points = Number(op.points);
      if (!Number.isFinite(points) || points < 0) return { id, ok: false, error: 'bad_points' };
    }

    const ref = this.db.collection('users').doc(uid);
    const now = this.now();
    const today = dayKey(now);
    let refunded = 0;

    const out = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const seen = Array.isArray(data.wallet_seen) ? data.wallet_seen : [];
      let bal = balanceOf(data);
      if (seen.includes(id)) return { id, ok: true, duplicate: true, applied: 0, balance: bal };

      const cap = this.balance.capFromData(data);
      const room = Math.max(0, cap - bal);
      const claims = { ...(data.wallet_claims || {}) };
      let budget = Number(data.wallet_budget) || 0;
      const rounds = (Array.isArray(data.wallet_rounds) ? data.wallet_rounds : [])
        .filter((r) => now - (Number(r.at) || 0) < ROUND_TTL_MS);
      const refuse = (error) => ({ id, ok: false, error, applied: 0, balance: bal });
      let applied = 0;
      let gain = 0;
      let rolled = null;
      let writeRounds = null;

      switch (op.kind) {
        case 'stake': {
          if (amount > bal) return refuse('insufficient');
          applied = amount;
          const open = rounds.find((r) => r.id === round && r.game === game);
          writeRounds = open
            ? rounds.map((r) => (r === open ? { ...r, amount: r.amount + amount } : r))
            : [...rounds, { id: round, game, amount, at: now }].slice(-OPEN_ROUNDS_MAX);
          break;
        }
        case 'settle': {
          const open = rounds.find((r) => r.id === round && r.game === game);
          if (!open) return refuse('no_round');
          if (amount > open.amount * STAKE_MULT[game]) return refuse('over_limit');
          applied = Math.min(amount, room);
          gain = applied;
          writeRounds = rounds.filter((r) => r !== open);
          break;
        }
        case 'win': {
          const paid = (claims.src && claims.src.day === today && claims.src.paid) || {};
          const left = Math.max(0, SOURCE_DAILY_CAP[source] - (paid[source] || 0));
          applied = Math.min(amount, left, room);
          claims.src = { day: today, paid: { ...paid, [source]: (paid[source] || 0) + applied } };
          gain = applied;
          break;
        }
        case 'refund': {
          // Money back for a purchase already paid, never for a bet.
          if (amount > budget) return refuse('over_refund_budget');
          budget -= amount;
          applied = amount;
          refunded = amount;
          break;
        }
        case 'spend':
          if (amount > bal) return refuse('insufficient');
          applied = amount;
          budget = Math.min(REFUND_BUDGET_MAX, budget + amount);
          break;
        case 'starter':
          if (claims.starter) return refuse('already_claimed');
          claims.starter = true;
          applied = Math.min(STARTER_AMOUNT, room);
          gain = applied;
          break;
        case 'daily':
          if (claims.daily === today) return refuse('already_claimed');
          claims.daily = today;
          rolled = rollDaily(this.rand);
          applied = Math.min(rolled, room);
          gain = applied;
          break;
        case 'tetris': {
          const t = claims.tetris && claims.tetris.day === today ? claims.tetris : { day: today, paid: 0 };
          const want = Math.min(Math.floor(points), TETRIS_PER_GAME, TETRIS_PER_DAY - t.paid);
          applied = Math.min(Math.max(0, want), room);
          claims.tetris = { day: today, paid: t.paid + Math.max(0, want) };
          gain = applied;
          break;
        }
        default:
          break;
      }

      bal = bal + (op.kind === 'spend' || op.kind === 'stake' ? -applied : applied);
      const write = {
        strubles_balance_v1: String(bal),
        wallet_claims: claims,
        wallet_budget: budget,
        wallet_seen: [...seen, id].slice(-SEEN_KEEP),
      };
      if (writeRounds !== null) write.wallet_rounds = writeRounds;
      if (gain > 0) {
        // The account watch reads this to log where a gain happened.
        // A grant (the daily prize, the starter) is rolled here, so the watch doesn't
        // count it as a win against the rate limit. A win is judged as before.
        const kind = op.kind === 'daily' || op.kind === 'starter' ? 'grant' : 'earn';
        write.strubles_last_gain_v1 = JSON.stringify({ amount: gain, page, at: now, kind });
      }
      // The last change the wallet made, so the admin feed can say why the balance moved.
      write.wallet_last_op = JSON.stringify({
        kind: op.kind, amount: applied, page, at: now,
        game, source: op.kind === 'win' ? source : null,
      });
      tx.set(ref, write, { merge: true });
      return { id, ok: true, applied, balance: bal, ...(rolled !== null ? { rolled } : {}) };
    });

    if (out.ok && refunded > 0) BalanceManager.credits.emit('refund', { uid, amount: refunded });
    return out;
  }
}

module.exports = {
  Wallet, rollDaily, DAILY_TIERS, TETRIS_PER_GAME, TETRIS_PER_DAY, START_BALANCE, STARTER_AMOUNT,
  STAKE_MULT, SOURCE_DAILY_CAP,
};

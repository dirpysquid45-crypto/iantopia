// Server-authoritative balance management via Firestore.
// Never trusts client-reported balances.
//
// Friendly (zero-stake) games and guest accounts never touch this at all: a
// guest has no Firestore document, and a bet of 0 is a no-op by design, so
// there is no code path where a guest can create or move Strubles.

const fs = require('fs');
const path = require('path');

// tycoon-cap.js is a UMD file shared with the browser (same pattern as the
// blackjack engine below it in this directory). `require()` of it only
// works when no ancestor package.json declares "type": "module" -- true
// inside the Docker image (mounted at /public) but not in the repo
// checkout, where the site's own package.json does. Reading and evaluating
// it directly behaves identically in both places.
function loadCap() {
  const file = path.join(__dirname, '..', 'public', 'tycoon-cap.js');
  const mod = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(file, 'utf8'))(mod, mod.exports);
  return mod.exports;
}
const Cap = loadCap();
const { EventEmitter } = require('events');
// Credits the server makes outside a game's own payout, announced after they
// commit, so the account watch can tell a refund from a win.
const credits = new EventEmitter();
credits.setMaxListeners(0);

const PAYOUT_TRIES = 3;
const PAID_IDS_KEEP = 50;

const isGuestId = (userId) => typeof userId === 'string' && userId.startsWith('guest_');

// The starting balance, for an account whose balance field has never been written.
// The wallet and the browser show this same number, so every read of a balance uses it.
const START_BALANCE = 100;
function balanceOf(data) {
  const raw = data ? data.strubles_balance_v1 : undefined;
  if (raw === undefined || raw === null) return START_BALANCE;
  const n = Number(raw);
  return Number.isFinite(n) ? n : START_BALANCE;
}

// A stake must be a non-negative whole number. Anything else is refused here
// as well as in the manager, because this is the last line before money moves:
// a negative amount used to be accepted as a "bet" and credited the player.
function assertAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Invalid amount');
  }
}

class BalanceManager {
  constructor(db) {
    this.db = db;
  }

  async getBalance(userId) {
    if (isGuestId(userId)) return 0;
    const doc = await this.db.collection('users').doc(userId).get();
    return balanceOf(doc.exists ? doc.data() : {});
  }

  async getWalletCap(userId) {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) return 20000;
    return this.capFromData(doc.data());
  }

  capFromData(data) {
    const bankLevel = Number(data.tycoon_bank_level_v1 || 0);
    const invStr = data.strubles_inventory_v1 || '{}';
    let inv = {};
    try { inv = JSON.parse(invStr); } catch {}
    const taipei = (Array.isArray(inv.buildings) ? inv.buildings : []).filter(k => k === 'taipei_101').length;
    const taipeiBonus = Math.min(taipei, Cap.MAX_TAIPEI_COPIES) * Cap.TAIPEI_BONUS_PER_COPY;
    return Cap.capForLevel(bankLevel) + taipeiBonus;
  }

  // Both writes below are transactions. They used to be a plain read followed
  // by a write, so two games settling for the same user at once could each
  // read the same balance and the second write would silently discard the
  // first one's change.
  async deductBet(userId, amount) {
    assertAmount(amount);
    if (amount === 0) return null;                       // friendly game
    if (isGuestId(userId)) throw new Error('Guests cannot stake Strubles');
    const ref = this.db.collection('users').doc(userId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const balance = balanceOf(snap.exists ? snap.data() : {});
      if (balance < amount) throw new Error('Insufficient balance');
      const next = balance - amount;
      tx.set(ref, { strubles_balance_v1: String(next) }, { merge: true });
      return next;
    });
  }

  // Credits a game's winnings. The wallet cap can clip them, so the result says how
  // much was actually credited. The gain is recorded as 'settled': the server ran the
  // game, so the account watch doesn't judge it as a client win. A payout with an id
  // is applied once, so a retry after a dropped reply can't pay twice.
  async creditPayout(userId, amount, id) {
    assertAmount(amount);
    if (amount === 0 || isGuestId(userId)) return { balance: null, applied: 0 };
    const ref = this.db.collection('users').doc(userId);
    const now = Date.now();
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const seen = Array.isArray(data.paid_ids_v1) ? data.paid_ids_v1 : [];
      const prior = id ? seen.find((x) => x.id === id) : null;
      if (prior) return { balance: balanceOf(data), applied: prior.applied };
      const bal = balanceOf(data);
      // A balance already above the cap keeps what it has; the payout can only fill the room.
      const applied = Math.max(0, Math.min(amount, this.capFromData(data) - bal));
      const write = { strubles_balance_v1: String(bal + applied) };
      if (id) write.paid_ids_v1 = [...seen, { id, applied }].slice(-PAID_IDS_KEEP);
      if (applied > 0) {
        write.strubles_last_gain_v1 = JSON.stringify({ amount: applied, page: null, at: now, kind: 'settled' });
      }
      tx.set(ref, write, { merge: true });
      return { balance: bal + applied, applied };
    });
  }

  // Money back for a stake. Not capped: it is the player's own money coming back.
  // Applied once per id, like creditPayout.
  async refundBet(userId, amount, id) {
    assertAmount(amount);
    if (amount === 0 || isGuestId(userId)) return { balance: null, applied: 0 };
    const ref = this.db.collection('users').doc(userId);
    const out = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const seen = Array.isArray(data.paid_ids_v1) ? data.paid_ids_v1 : [];
      const prior = id ? seen.find((x) => x.id === id) : null;
      if (prior) return { balance: balanceOf(data), applied: prior.applied, duplicate: true };
      const next = balanceOf(data) + amount;
      const write = { strubles_balance_v1: String(next) };
      if (id) write.paid_ids_v1 = [...seen, { id, applied: amount }].slice(-PAID_IDS_KEEP);
      tx.set(ref, write, { merge: true });
      return { balance: next, applied: amount };
    });
    if (!out.duplicate) credits.emit('refund', { uid: userId, amount });
    return out;
  }

  // Runs a credit, retrying a few times. If every try fails, the payout is kept in
  // failed_payouts so an admin can pay it, and the result says it wasn't paid, so
  // nothing is announced as won that isn't in the balance.
  async retried(label, record, attempt) {
    let lastError = null;
    for (let n = 0; n < PAYOUT_TRIES; n++) {
      try {
        return { ...(await attempt()), paid: true };
      } catch (e) {
        lastError = e;
        await new Promise((resolve) => setTimeout(resolve, 150 * (n + 1)));
      }
    }
    console.error(`[${label}] failed after ${PAYOUT_TRIES} tries:`, lastError && lastError.message);
    try {
      await this.db.collection('failed_payouts').add({ ...record, error: String(lastError && lastError.message), at: new Date() });
    } catch (e) {
      console.error(`[${label}] could not record the failed credit:`, e.message);
    }
    return { balance: null, applied: 0, paid: false };
  }

  // Payouts that never landed, newest first. Paid ones are left out.
  async listFailedPayouts(limit = 200) {
    const snap = await this.db.collection('failed_payouts').get();
    const iso = (t) => (t && typeof t.toDate === 'function' ? t.toDate() : t instanceof Date ? t : new Date(t || 0)).toISOString();
    return snap.docs
      .map((d) => ({ docId: d.id, ...d.data() }))
      .filter((r) => !r.resolved)
      .sort((a, b) => iso(b.at).localeCompare(iso(a.at)))
      .slice(0, limit)
      .map((r) => ({
        docId: r.docId, kind: r.kind, userId: r.userId, amount: r.amount, game: r.game || null,
        reason: r.reason || null, error: r.error || null, at: iso(r.at),
      }));
  }

  // Pays a failed payout by hand, once. It uses the id the first try carried, so if that
  // try had actually landed, nothing is paid twice.
  async resolveFailedPayout(docId, by) {
    const ref = this.db.collection('failed_payouts').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('No such payout');
    const rec = snap.data();
    if (rec.resolved) throw new Error('That payout is already paid');
    const r = rec.kind === 'refund'
      ? await this.refundBet(rec.userId, rec.amount, rec.id)
      : await this.creditPayout(rec.userId, rec.amount, rec.id);
    await ref.set({ resolved: true, resolvedAt: new Date(), resolvedBy: by, resolvedApplied: r.applied }, { merge: true });
    return r;
  }

  payOut(userId, amount, meta) {
    return this.retried('payout', { kind: 'payout', userId, amount, ...meta }, () => this.creditPayout(userId, amount, meta.id));
  }

  refundStake(userId, amount, meta) {
    return this.retried('refund', { kind: 'refund', userId, amount, ...meta }, () => this.refundBet(userId, amount, meta.id));
  }
}

// An account under a ban (bans/{uid}, written by the server) can't stake or move
// money until the ban runs out. Used by the arena's stake path and the wallet.
async function isBanned(db, userId, now = Date.now()) {
  if (isGuestId(userId)) return false;
  const snap = await db.collection('bans').doc(userId).get();
  if (!snap.exists) return false;
  const until = snap.data().until;
  const ms = until && typeof until.toDate === 'function' ? until.toDate().getTime() : until ? new Date(until).getTime() : 0;
  return ms > now;
}
BalanceManager.isBanned = isBanned;
BalanceManager.isGuestId = isGuestId;
BalanceManager.balanceOf = balanceOf;
BalanceManager.START_BALANCE = START_BALANCE;
BalanceManager.credits = credits;
module.exports = BalanceManager;

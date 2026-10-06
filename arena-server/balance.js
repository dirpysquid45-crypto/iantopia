// Server-authoritative balance management via Firestore.
// Never trusts client-reported balances.
//
// Friendly (zero-stake) games and guest accounts never touch this at all: a
// guest has no Firestore document, and a bet of 0 is a no-op by design, so
// there is no code path where a guest can create or move Strubles.

const isGuestId = (userId) => typeof userId === 'string' && userId.startsWith('guest_');

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
    if (!doc.exists) return 0;
    const data = doc.data();
    return Number(data.strubles_balance_v1 || 0);
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
    const taipeiBonus = Math.min(taipei, 5) * 10000;
    let cap = 20000;
    for (let i = 1; i <= bankLevel; i++) {
      if (i <= 3) {
        const gains = [0, 15000, 25000, 40000];
        cap += gains[i] || 0;
      } else {
        cap += 40000 * Math.pow(3, i - 3);
      }
    }
    return cap + taipeiBonus;
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
      const balance = snap.exists ? Number(snap.data().strubles_balance_v1 || 0) : 0;
      if (balance < amount) throw new Error('Insufficient balance');
      const next = balance - amount;
      tx.set(ref, { strubles_balance_v1: String(next) }, { merge: true });
      return next;
    });
  }

  async creditPayout(userId, amount) {
    assertAmount(amount);
    if (amount === 0 || isGuestId(userId)) return null;
    const ref = this.db.collection('users').doc(userId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const balance = Number(data.strubles_balance_v1 || 0);
      const next = Math.min(balance + amount, this.capFromData(data));
      tx.set(ref, { strubles_balance_v1: String(next) }, { merge: true });
      return next;
    });
  }

  // Returns a bet that was deducted but whose game never started. Deliberately
  // NOT capped by the wallet cap: it is the player's own money coming back, and
  // capping it could make a failed match cost them Strubles.
  async refundBet(userId, amount) {
    assertAmount(amount);
    if (amount === 0 || isGuestId(userId)) return null;
    const ref = this.db.collection('users').doc(userId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const balance = snap.exists ? Number(snap.data().strubles_balance_v1 || 0) : 0;
      const next = balance + amount;
      tx.set(ref, { strubles_balance_v1: String(next) }, { merge: true });
      return next;
    });
  }
}

BalanceManager.isGuestId = isGuestId;
module.exports = BalanceManager;

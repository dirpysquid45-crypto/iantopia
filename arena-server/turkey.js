// Turkey Escape ties into Iantopia accounts. A pardon grants the turkey cursor, and corn can be
// spent for Strubles. The game counts corn on the player's phone, so the server can't check it:
// the daily cap is what keeps corn from becoming free money.
const BalanceManager = require('./balance');

const CORN_PER_STRUBLE = 10;
const DAILY_STRUBLE_CAP = 50;
const CURSOR_KEY = 'turkey';

const utcDay = () => new Date().toISOString().slice(0, 10);

function readInventory(raw) {
  let inv = {};
  try { inv = JSON.parse(raw || '{}'); } catch {}
  if (!inv || typeof inv !== 'object') inv = {};
  if (!Array.isArray(inv.cursors)) inv.cursors = [];
  return inv;
}

class TurkeyManager {
  constructor(db, balance) {
    this.db = db;
    this.balance = balance;
  }

  // Grants the turkey cursor once. Asking again does nothing new.
  async claimPardon(userId) {
    if (BalanceManager.isGuestId(userId)) throw new Error('Sign in to claim the turkey cursor');
    const ref = this.db.collection('users').doc(userId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const inv = readInventory(data.strubles_inventory_v1);
      const isNew = !inv.cursors.includes(CURSOR_KEY);
      if (isNew) inv.cursors.push(CURSOR_KEY);
      const stats = data.turkey_escape_v1 || {};
      tx.set(ref, {
        strubles_inventory_v1: JSON.stringify(inv),
        turkey_escape_v1: { ...stats, pardoned: true },
      }, { merge: true });
      return { cursor: CURSOR_KEY, isNew };
    });
  }

  // Spends corn for Strubles at CORN_PER_STRUBLE to 1, up to DAILY_STRUBLE_CAP a day (UTC).
  // Returns how many Strubles were credited and how much corn that uses up.
  async convertCorn(userId, corn) {
    if (BalanceManager.isGuestId(userId)) throw new Error('Sign in to convert corn');
    if (!Number.isSafeInteger(corn) || corn < CORN_PER_STRUBLE) throw new Error('Not enough corn to convert');
    const ref = this.db.collection('users').doc(userId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const stats = data.turkey_escape_v1 || {};
      const today = utcDay();
      const usedToday = stats.convertDay === today ? Number(stats.strublesToday || 0) : 0;
      const room = Math.max(0, DAILY_STRUBLE_CAP - usedToday);
      const wanted = Math.min(Math.floor(corn / CORN_PER_STRUBLE), room);
      const balance = Number(data.strubles_balance_v1 || 0);
      const next = Math.min(balance + wanted, this.balance.capFromData(data));
      const credited = Math.max(0, next - balance);
      if (credited > 0) {
        tx.set(ref, {
          strubles_balance_v1: String(next),
          turkey_escape_v1: { ...stats, convertDay: today, strublesToday: usedToday + credited },
        }, { merge: true });
      }
      return { credited, cornUsed: credited * CORN_PER_STRUBLE, balance: next, dailyLeft: room - credited };
    });
  }
}

module.exports = { TurkeyManager, CORN_PER_STRUBLE, DAILY_STRUBLE_CAP, CURSOR_KEY };

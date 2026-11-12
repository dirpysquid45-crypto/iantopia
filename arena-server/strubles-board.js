// The Strubles leaderboard: the players with the most Strubles, public and read-only.
// Balances are stored as text, so the database can't sort them. The board reads the
// accounts, sorts them here, and keeps the result for a few minutes so a busy page
// doesn't rescan every time.
const BalanceManager = require('./balance');
const moderation = require('./moderation');

const { balanceOf } = BalanceManager;
const TTL_MS = 5 * 60 * 1000;
const LIMIT = 50;
const NAME_MAX = 24;

class StrublesBoard {
  // isAdminDoc(uid, data): true for accounts that should not be listed (their balance is
  // not earned play). Optional.
  constructor(db, { now = () => Date.now(), ttlMs = TTL_MS, limit = LIMIT, isAdminDoc = null } = {}) {
    this.db = db;
    this.now = now;
    this.ttlMs = ttlMs;
    this.limit = limit;
    this.isAdminDoc = isAdminDoc;
    this.cache = null;
  }

  static toMs(v) {
    return v && typeof v.toDate === 'function' ? v.toDate().getTime() : v ? new Date(v).getTime() : 0;
  }

  static cleanName(raw) {
    const name = String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, NAME_MAX);
    return !name || moderation.isBlocked(name) ? 'Player' : name;
  }

  async top() {
    const now = this.now();
    if (this.cache && now - this.cache.updated < this.ttlMs) return this.cache;
    const snap = await this.db.collection('users').get();
    const rows = [];
    for (const d of snap.docs) {
      const x = d.data();
      if (StrublesBoard.toMs(x.ban_until) > now) continue;
      if (this.isAdminDoc && this.isAdminDoc(d.id, x)) continue;
      const balance = balanceOf(x);
      if (!(balance > 0)) continue;
      rows.push({ name: StrublesBoard.cleanName(x.displayName), balance });
    }
    rows.sort((a, b) => b.balance - a.balance);
    this.cache = { updated: now, rows: rows.slice(0, this.limit).map((r, i) => ({ rank: i + 1, ...r })) };
    return this.cache;
  }
}

module.exports = { StrublesBoard, TTL_MS, LIMIT };

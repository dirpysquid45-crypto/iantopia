// Server-side account watch: a live feed of every save change, cheat
// detection, and the punishments. Runs with the Admin SDK, so it doesn't
// depend on anything the browser sends.
//
// Cheat rule: a balance that goes UP and lands above the player's wallet
// cap (see balance.js capFromData). The game's own add() clamps at the cap,
// so an honest client never gets there. A balance that was already above
// the cap before this watch started is not judged, because the save comment
// in strubles.js says those can exist from before the cap existed.
//
// Punishment: first offence in 7 days resets the balance to 100 and records
// a warning. A second offence in that window bans for 24 hours, resets
// again, and removes the cheater's leaderboard rows.

const STARTING_BALANCE = '100';
const STRIKE_WINDOW_MS = 7 * 24 * 3600 * 1000;
const BAN_MS = 24 * 3600 * 1000;
const FEED_MAX = 300;
const LEADERBOARDS = ['leaderboard', 'minesweeper_leaderboard', 'horse_leaderboard'];

class AccountWatch {
  constructor({ db, auth, balance, now = () => Date.now(), log = console }) {
    this.db = db;
    this.auth = auth;
    this.balance = balance; // BalanceManager, for capFromData
    this.now = now;
    this.log = log;
    this.lastBalance = new Map(); // uid -> last seen balance
    this.names = new Map();       // uid -> display label
    this.feed = [];               // newest last, capped at FEED_MAX
    this.listeners = new Set();   // functions called with each new event
    this.unsubscribe = null;
    this.seeded = false;
  }

  // Attaches the live listener. The first snapshot only records baselines.
  start() {
    this.unsubscribe = this.db.collection('users').onSnapshot((snap) => {
      if (!this.seeded) {
        this.seeded = true;
        snap.docs.forEach((d) => this.lastBalance.set(d.id, balanceOf(d.data())));
        return;
      }
      snap.docChanges().forEach((ch) => {
        if (ch.type !== 'removed') this.onChange(ch.doc.id, ch.doc.data()).catch((e) => this.log.error('[accounts]', e.message));
      });
    }, (err) => this.log.error('[accounts] listener failed:', err.message));
    return this;
  }

  stop() { if (this.unsubscribe) this.unsubscribe(); }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(event) {
    const ev = Object.assign({ at: new Date(this.now()).toISOString() }, event);
    this.feed.push(ev);
    if (this.feed.length > FEED_MAX) this.feed.shift();
    for (const fn of this.listeners) { try { fn(ev); } catch {} }
    return ev;
  }

  async labelFor(uid) {
    if (this.names.has(uid)) return this.names.get(uid);
    let label = uid;
    try {
      const u = await this.auth.getUser(uid);
      label = u.displayName || u.email || uid;
    } catch {}
    this.names.set(uid, label);
    return label;
  }

  async onChange(uid, data) {
    const balance = balanceOf(data);
    const prev = this.lastBalance.get(uid);
    this.lastBalance.set(uid, balance);
    const cap = this.balance.capFromData(data);
    const name = await this.labelFor(uid);
    this.emit({ kind: 'balance', uid, name, balance, prev: prev === undefined ? null : prev, cap, bankLevel: Number(data.tycoon_bank_level_v1 || 0) });
    if (prev !== undefined && balance > prev && balance > cap) {
      await this.punish(uid, { balance, prev, cap, name });
    }
  }

  // Records a strike in a transaction, so two snapshots can't count twice.
  async punish(uid, info) {
    const now = this.now();
    const ref = this.db.collection('cheat_strikes').doc(uid);
    const count = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.exists ? (snap.data().at || []) : [];
      const recent = old.filter((t) => now - t < STRIKE_WINDOW_MS);
      recent.push(now);
      tx.set(ref, { at: recent });
      return recent.length;
    });
    if (count >= 2) {
      await this.ban(uid, BAN_MS / 3600000, { reason: 'cheat_second_offence', ...info, strikes: count });
      return;
    }
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, cheat_warning_at: new Date(now) }, { merge: true });
    this.emit({ kind: 'punish', action: 'reset', uid, name: info.name, reason: 'cheat_first_offence', from: info.balance, strikes: count });
  }

  // Bans an account and resets its balance. Used for second offences and by
  // the admin panel. Also removes the account's leaderboard rows.
  async ban(uid, hours, info = {}) {
    const until = new Date(this.now() + hours * 3600 * 1000);
    await this.db.collection('bans').doc(uid).set({ until, reason: info.reason || 'admin', at: new Date(this.now()) });
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, ban_until: until }, { merge: true });
    for (const col of LEADERBOARDS) await this.db.collection(col).doc(uid).delete();
    const name = info.name || await this.labelFor(uid);
    this.emit({ kind: 'punish', action: 'ban', uid, name, until: until.toISOString(), reason: info.reason || 'admin', from: info.balance, strikes: info.strikes });
  }

  async reset(uid) {
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE }, { merge: true });
    this.emit({ kind: 'punish', action: 'reset', uid, name: await this.labelFor(uid), reason: 'admin' });
  }

  async unban(uid) {
    await this.db.collection('bans').doc(uid).delete();
    await this.db.collection('users').doc(uid).set({ ban_until: null }, { merge: true });
    this.emit({ kind: 'punish', action: 'unban', uid, name: await this.labelFor(uid), reason: 'admin' });
  }
}

function balanceOf(data) {
  const n = Number((data && data.strubles_balance_v1) || 0);
  return Number.isFinite(n) ? n : 0;
}

module.exports = { AccountWatch, STARTING_BALANCE, STRIKE_WINDOW_MS, BAN_MS };

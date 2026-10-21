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
// Resetting the cap: the wallet cap comes from the bank level and the village's
// buildings (see balance.js capFromData), so a reset clears both.
const CAP_RESET = { tycoon_bank_level_v1: '0', tycoon_village_v2: JSON.stringify({ v: 2, nextId: 1, name: 'My Village', b: [], tiles: {}, paid: {} }) };
const ARCHIVE_LOG = 'account_log';        // every feed event, kept forever
const ARCHIVE_BACKUP = 'account_backups'; // record copies taken before a change
// Plausibility limits. A balance can rise by at most RATE_LIMIT Strubles in any
// RATE_WINDOW_MS (the most the site's games can pay in a minute at the
// largest bets), and STREAK_LIMIT gains in a row with no loss between them is
// flagged as a run of wins nobody has.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 5000;
const STREAK_LIMIT = 20;
const LEADERBOARDS = ['leaderboard', 'minesweeper_leaderboard', 'horse_leaderboard'];

class AccountWatch {
  constructor({ db, auth, balance, admins = { uids: [], emails: [] }, now = () => Date.now(), log = console }) {
    this.db = db;
    this.admins = admins;         // the admin list (ADMIN_UIDS / ADMIN_EMAILS), never banned
    this.auth = auth;
    this.balance = balance; // BalanceManager, for capFromData
    this.now = now;
    this.log = log;
    this.lastBalance = new Map(); // uid -> last seen balance
    this.gains = new Map();       // uid -> recent gains [{t, amount}] for the rate rule
    this.streaks = new Map();     // uid -> gains in a row with no loss between
    this.names = new Map();       // uid -> display label
    this.feed = [];               // newest last, capped at FEED_MAX
    this.listeners = new Set();   // functions called with each new event
    this.unsubscribe = null;
    this.seeded = false;
  }

  // Attaches the live listener. The first snapshot only records baselines.
  // Reloads the most recent events from the archive, so the feed isn't empty
  // after a restart.
  async loadFeed() {
    try {
      const snap = await this.db.collection(ARCHIVE_LOG).orderBy('at', 'desc').limit(FEED_MAX).get();
      const events = snap.docs.map((d) => d.data()).reverse();
      this.feed = events.concat(this.feed);
      if (this.feed.length > FEED_MAX) this.feed = this.feed.slice(-FEED_MAX);
    } catch (e) { this.log.error('[accounts] could not load the archive:', e.message); }
  }

  // Saves a full copy of an account's record before it is changed, so a reset
  // or ban can be undone. Kept in the archive, which only the server can read.
  async backup(uid, reason) {
    const snap = await this.db.collection('users').doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    const at = new Date(this.now());
    await this.db.collection(ARCHIVE_BACKUP).add({ uid, reason, at, data: data ? JSON.stringify(data) : null });
    this.emit({ kind: 'backup', uid, name: await this.labelFor(uid), reason });
  }

  start() {
    this.loadFeed();
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
    // The archive keeps every event, so the feed survives a server rebuild.
    this.db.collection(ARCHIVE_LOG).add(ev).catch((e) => this.log.error('[accounts] archive write failed:', e.message));
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
    const page = lastGainOf(data).page;
    this.emit({ kind: 'balance', uid, name, balance, prev: prev === undefined ? null : prev, cap, bankLevel: Number(data.tycoon_bank_level_v1 || 0), page });
    if (prev === undefined || balance === prev) return;
    if (balance < prev) { this.streaks.set(uid, 0); return; }

    // The balance went up. Check the three rules in order.
    const delta = balance - prev;
    const now = this.now();
    const info = { balance, prev, cap, name, page, delta };
    if (balance > cap) return this.punish(uid, { ...info, reason: 'over_cap' });

    const recent = (this.gains.get(uid) || []).filter((g) => now - g.t < RATE_WINDOW_MS);
    recent.push({ t: now, amount: delta });
    this.gains.set(uid, recent);
    const perMinute = recent.reduce((sum, g) => sum + g.amount, 0);
    if (perMinute > RATE_LIMIT) return this.punish(uid, { ...info, reason: 'rate', perMinute });

    const streak = (this.streaks.get(uid) || 0) + 1;
    this.streaks.set(uid, streak);
    if (streak >= STREAK_LIMIT) {
      this.streaks.set(uid, 0);
      return this.punish(uid, { ...info, reason: 'win_streak', streak });
    }
  }

  // Admin accounts can't be banned or struck, so an admin's own test or
  // mistake can't lock them out.
  async isAdmin(uid) {
    if (this.admins.uids.includes(String(uid).toLowerCase())) return true;
    try {
      const u = await this.auth.getUser(uid);
      return !!u.email && this.admins.emails.includes(u.email.toLowerCase());
    } catch { return false; }
  }

  // Records a strike in a transaction, so two snapshots can't count twice.
  async punish(uid, info) {
    if (await this.isAdmin(uid)) return;
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
    const detail = { page: info.page || null, detected: info.reason || 'over_cap', streak: info.streak, perMinute: info.perMinute };
    if (count >= 2) {
      await this.ban(uid, BAN_MS / 3600000, { reason: 'cheat_second_offence', ...info, strikes: count, ...detail });
      return;
    }
    await this.backup(uid, 'before_cheat_reset');
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, cheat_warning_at: new Date(now) }, { merge: true });
    this.emit({ kind: 'punish', action: 'reset', uid, name: info.name, reason: 'cheat_first_offence', from: info.balance, strikes: count, ...detail });
  }

  // Bans an account and resets its balance. Used for second offences and by
  // the admin panel. Also removes the account's leaderboard rows.
  async ban(uid, hours, info = {}) {
    if (await this.isAdmin(uid)) throw new Error('admin accounts cannot be banned');
    await this.backup(uid, 'before_ban');
    const until = new Date(this.now() + hours * 3600 * 1000);
    await this.db.collection('bans').doc(uid).set({ until, reason: info.reason || 'admin', at: new Date(this.now()) });
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, ban_until: until, ...CAP_RESET }, { merge: true });
    for (const col of LEADERBOARDS) await this.db.collection(col).doc(uid).delete();
    const name = info.name || await this.labelFor(uid);
    this.emit({ kind: 'punish', action: 'ban', uid, name, until: until.toISOString(), reason: info.reason || 'admin', from: info.balance, strikes: info.strikes, page: info.page || null, detected: info.detected || null });
  }

  async reset(uid) {
    await this.backup(uid, 'before_admin_reset');
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, ...CAP_RESET }, { merge: true });
    this.emit({ kind: 'punish', action: 'reset', uid, name: await this.labelFor(uid), reason: 'admin' });
  }

  // Sets the account's sign-in display name, so it shows in Firebase's Users tab.
  async setName(uid, name) {
    await this.auth.updateUser(uid, { displayName: name });
    this.names.delete(uid);
    this.emit({ kind: 'punish', action: 'rename', uid, name, reason: 'admin' });
  }

  // Every account for the admin's player list: name, email, balance, bank
  // level, and status (banned, warned, or ok). Newest-warned and banned first.
  async listPlayers() {
    const snap = await this.db.collection('users').get();
    const now = this.now();
    const toMs = (v) => (v && typeof v.toDate === 'function' ? v.toDate().getTime() : v ? new Date(v).getTime() : 0);
    const rows = [];
    for (const d of snap.docs) {
      const x = d.data();
      const banUntil = toMs(x.ban_until);
      const warnedAt = toMs(x.cheat_warning_at);
      const adminWarned = !!(x.admin_warning && x.admin_warning.id && x.admin_warning.id !== x.admin_warning_dismissed);
      const cheatWarned = !!(warnedAt && now - warnedAt < STRIKE_WINDOW_MS);
      const status = banUntil > now ? 'banned' : (adminWarned || cheatWarned ? 'warned' : 'ok');
      rows.push({
        uid: d.id,
        name: x.displayName || await this.labelFor(d.id),
        email: x.email || null,
        balance: balanceOf(x),
        bankLevel: Number(x.tycoon_bank_level_v1 || 0),
        status,
        banUntil: banUntil > now ? new Date(banUntil).toISOString() : null,
        warnedAt: warnedAt ? new Date(warnedAt).toISOString() : null,
        lastSeen: Number(x.tycoon_last_seen_v1) || null,
      });
    }
    const rank = { banned: 0, warned: 1, ok: 2 };
    return rows.sort((a, b) => rank[a.status] - rank[b.status] || b.balance - a.balance);
  }

  // Sends a warning to the player. They see it as a banner until they dismiss it.
  async warn(uid, text) {
    const id = Math.random().toString(36).slice(2, 10);
    await this.db.collection('users').doc(uid).set({ admin_warning: { id, text, at: new Date(this.now()) } }, { merge: true });
    this.emit({ kind: 'punish', action: 'warn', uid, name: await this.labelFor(uid), reason: 'admin', text });
  }

  async unban(uid) {
    await this.db.collection('bans').doc(uid).delete();
    await this.db.collection('users').doc(uid).set({ ban_until: null }, { merge: true });
    this.emit({ kind: 'punish', action: 'unban', uid, name: await this.labelFor(uid), reason: 'admin' });
  }
}

// The browser's last gain: { amount, page, at }, written next to the balance.
// It is client-reported, so it is used to log where a gain happened, not to
// decide anything on its own.
function lastGainOf(data) {
  try {
    const g = JSON.parse((data && data.strubles_last_gain_v1) || 'null');
    return g && typeof g === 'object' ? { amount: Number(g.amount) || 0, page: typeof g.page === 'string' ? g.page.slice(0, 120) : null } : { amount: 0, page: null };
  } catch { return { amount: 0, page: null }; }
}

function balanceOf(data) {
  const n = Number((data && data.strubles_balance_v1) || 0);
  return Number.isFinite(n) ? n : 0;
}

module.exports = { AccountWatch, STARTING_BALANCE, STRIKE_WINDOW_MS, BAN_MS };

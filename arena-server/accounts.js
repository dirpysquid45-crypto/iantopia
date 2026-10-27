const BalanceManager = require('./balance');
const { balanceOf } = BalanceManager;
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
// Plausibility limits. The NET change in a balance may rise by at most
// RATE_LIMIT Strubles in any RATE_WINDOW_MS (the most the site's games can pay
// in a minute at the largest bets). Losses count against it, so a run of wins
// and losses is judged by where the balance actually went. STREAK_LIMIT gains
// in a row with no loss between them is flagged as a run of wins nobody has.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 5000;
const STREAK_LIMIT = 20;
// A refund can return at most what the player paid in this window (less what has
// already been refunded). Money paid back is not a win, so it is not judged as one.
const REFUND_WINDOW_MS = 24 * 3600 * 1000;
// A refund the server made is matched to its save within this time.
const SERVER_REFUND_WINDOW_MS = 30 * 1000;
// An admin's own balance change is not a cheat, whatever the amount. The watch
// lets through the save that matches it, for this long after it is made.
const ADMIN_SET_GRACE_MS = 2 * 60 * 1000;
const LEADERBOARDS = ['leaderboard', 'minesweeper_leaderboard', 'horse_leaderboard'];

// Limits for admin gifts. One account can get up to GIFT_MAX at a time; one gift to
// everyone can total at most GIFT_ALL_MAX_TOTAL.
const GIFT_MAX = 1000000;
const GIFT_ALL_MAX_TOTAL = 5000000;
// A gift note is plain text, up to 200 characters, with HTML characters removed.
function cleanNote(note) {
  return typeof note === 'string' ? note.replace(/[<>&"]/g, '').trim().slice(0, 200) : '';
}

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
    this.debits = new Map();          // uid -> [{t, amount}] payments out, to match refunds against
    this.refunded = new Map();        // uid -> [{t, amount}] refunds already matched to a payment
    this.serverRefunds = new Map();   // uid -> [{t, amount}] refunds the server just made
    this.onServerRefund = (e) => this.noteServerRefund(e.uid, e.amount);
    BalanceManager.credits.on('refund', this.onServerRefund);
    this.adminSets = new Map();   // uid -> {at, to} for a balance an admin just set
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

  stop() {
    if (this.unsubscribe) this.unsubscribe();
    BalanceManager.credits.off('refund', this.onServerRefund);
  }

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
    // Only a change in the balance goes in the feed. The tycoon page saves other
    // fields about once a second, and each of those saves used to log the same
    // balance again.
    if (prev === undefined || balance !== prev) {
      this.emit({ kind: 'balance', uid, name, balance, prev: prev === undefined ? null : prev, cap, bankLevel: Number(data.tycoon_bank_level_v1 || 0), page, op: lastOpOf(data, this.now()) });
    }
    if (prev === undefined || balance === prev) return;

    // The save that follows an admin's own change is not judged.
    const adminSet = this.adminSets.get(uid);
    if (adminSet && this.now() - adminSet.at < ADMIN_SET_GRACE_MS && balance === adminSet.to) {
      this.adminSets.delete(uid);
      this.streaks.set(uid, 0);
      return;
    }

    // Every change goes into the per-minute net, losses included, except a
    // refund: money paid back is not a win, so it is left out of the net.
    const delta = balance - prev;
    const now = this.now();
    if (delta < 0) this.noteDebit(uid, -delta, now);
    // Refunds, grants the server rolled itself (the daily prize, the starter), and
    // payouts the server settled itself (a game it ran), are not client wins: they stay out
    // of the rate and streak checks. The cap still applies.
    const refund = delta > 0 && (this.takeServerRefund(uid, delta, now)
      || this.takeRefundAllowance(uid, delta, now, lastGainOf(data).kind)
      || lastGainOf(data).kind === 'grant' || lastGainOf(data).kind === 'settled');
    const recent = (this.gains.get(uid) || []).filter((g) => now - g.t < RATE_WINDOW_MS);
    if (!refund) recent.push({ t: now, amount: delta });
    this.gains.set(uid, recent);
    if (balance < prev) { this.streaks.set(uid, 0); return; }

    // The balance went up. Check the rules in order.
    const info = { balance, prev, cap, name, page, delta };
    if (balance > cap) return this.punish(uid, { ...info, reason: 'over_cap' });
    if (refund) return;   // a refund is not a win: no rate or streak check

    const perMinute = recent.reduce((sum, g) => sum + g.amount, 0);
    if (perMinute > RATE_LIMIT) return this.punish(uid, { ...info, reason: 'rate', perMinute });

    const streak = (this.streaks.get(uid) || 0) + 1;
    this.streaks.set(uid, streak);
    if (streak >= STREAK_LIMIT) {
      this.streaks.set(uid, 0);
      return this.punish(uid, { ...info, reason: 'win_streak', streak });
    }
  }

  noteDebit(uid, amount, now) {
    const list = (this.debits.get(uid) || []).filter((d) => now - d.t < REFUND_WINDOW_MS);
    list.push({ t: now, amount });
    this.debits.set(uid, list);
  }

  // A client refund is accepted as a refund only up to what the player paid in
  // the window, less what was already refunded. More than that is judged as a win.
  takeRefundAllowance(uid, amount, now, kind) {
    if (kind !== 'refund') return false;
    const total = (list) => (list || []).filter((x) => now - x.t < REFUND_WINDOW_MS).reduce((s, x) => s + x.amount, 0);
    const allowance = total(this.debits.get(uid)) - total(this.refunded.get(uid));
    if (amount > allowance) return false;
    this.markRefunded(uid, amount, now);
    return true;
  }

  noteServerRefund(uid, amount) {
    const now = this.now();
    const list = (this.serverRefunds.get(uid) || []).filter((r) => now - r.t < SERVER_REFUND_WINDOW_MS);
    list.push({ t: now, amount });
    this.serverRefunds.set(uid, list);
  }

  // The server's own refund, matched by amount to the save that shows it.
  takeServerRefund(uid, amount, now) {
    const list = this.serverRefunds.get(uid) || [];
    const i = list.findIndex((r) => r.amount === amount && now - r.t < SERVER_REFUND_WINDOW_MS);
    if (i === -1) return false;
    list.splice(i, 1);
    this.markRefunded(uid, amount, now);
    return true;
  }

  markRefunded(uid, amount, now) {
    const list = (this.refunded.get(uid) || []).filter((x) => now - x.t < REFUND_WINDOW_MS);
    list.push({ t: now, amount });
    this.refunded.set(uid, list);
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
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, cheat_warning_at: new Date(now), balance_reset_at: new Date(now) }, { merge: true });
    this.emit({ kind: 'punish', action: 'reset', uid, name: info.name, reason: 'cheat_first_offence', from: info.balance, strikes: count, ...detail });
  }

  // Bans an account and resets its balance. Used for second offences and by
  // the admin panel. Also removes the account's leaderboard rows.
  async ban(uid, hours, info = {}) {
    if (await this.isAdmin(uid)) throw new Error('admin accounts cannot be banned');
    await this.backup(uid, 'before_ban');
    const until = new Date(this.now() + hours * 3600 * 1000);
    await this.db.collection('bans').doc(uid).set({ until, reason: info.reason || 'admin', at: new Date(this.now()) });
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, ban_until: until, balance_reset_at: new Date(this.now()), ...CAP_RESET }, { merge: true });
    for (const col of LEADERBOARDS) await this.db.collection(col).doc(uid).delete();
    const name = info.name || await this.labelFor(uid);
    this.emit({ kind: 'punish', action: 'ban', uid, name, until: until.toISOString(), reason: info.reason || 'admin', from: info.balance, strikes: info.strikes, page: info.page || null, detected: info.detected || null });
  }

  async balanceNow(uid) {
    const snap = await this.db.collection('users').doc(uid).get();
    return balanceOf(snap.exists ? snap.data() : {});
  }

  // Sets an account's balance by hand, for an admin. The wallet cap stays where
  // it is, so a balance above the cap is allowed here but not earned.
  async setBalance(uid, amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Balance must be a whole number, 0 or more');
    const from = await this.balanceNow(uid);
    await this.backup(uid, 'before_admin_set');
    this.adminSets.set(uid, { at: this.now(), to: amount });
    // Treat it like a reset: the open tabs see balance_reset_at change and pull the new
    // value, and a stale push of the old balance is put back (see onChange).
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: String(amount), balance_reset_at: new Date(this.now()) }, { merge: true });
    this.emit({ kind: 'punish', action: 'set', uid, name: await this.labelFor(uid), reason: 'admin', from, to: amount });
  }

  // Adds Strubles to an account, for an admin. It goes through the same grace
  // window as setBalance, so the save it makes is not judged as a cheat.
  // A gift is added to one account. `note` is shown in the admin feed, and is kept
  // with the gift in the archive.
  async gift(uid, amount, note = '') {
    const { from, to } = await this.applyGift(uid, amount);
    this.emit({ kind: 'punish', action: 'gift', uid, name: await this.labelFor(uid), reason: 'admin', from, to, amount, note: cleanNote(note) });
  }

  // Adds `amount` to one account in one transaction, and tells the watch the exact value
  // written, so the save isn't judged as a cheat. Doesn't emit, so gift-all can log once.
  async applyGift(uid, amount) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > GIFT_MAX) {
      throw new Error(`A gift must be a whole number from 1 to ${GIFT_MAX}`);
    }
    await this.backup(uid, 'before_admin_gift');
    // The read and the write happen in one transaction, so a win that lands in between
    // is kept rather than overwritten.
    const ref = this.db.collection('users').doc(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const before = balanceOf(snap.exists ? snap.data() : {});
      const after = before + amount;
      this.adminSets.set(uid, { at: this.now(), to: after });
      tx.set(ref, { strubles_balance_v1: String(after), balance_reset_at: new Date(this.now()) }, { merge: true });
      return { from: before, to: after };
    });
  }

  // Gifts `amount` to every account that isn't banned. The total is checked before any
  // account is changed, and it's logged once, with the note, as one feed event.
  async giftAll(amount, note = '') {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > GIFT_MAX) {
      throw new Error(`A gift must be a whole number from 1 to ${GIFT_MAX}`);
    }
    const now = this.now();
    const users = await this.db.collection('users').get();
    const eligible = [];
    for (const doc of users.docs) {
      if (!(await BalanceManager.isBanned(this.db, doc.id, now))) eligible.push(doc.id);
    }
    if (eligible.length === 0) throw new Error('No accounts to gift');
    const total = amount * eligible.length;
    if (total > GIFT_ALL_MAX_TOTAL) {
      throw new Error(`That gift to ${eligible.length} accounts is ${total}, over the ${GIFT_ALL_MAX_TOTAL} limit for one gift to everyone`);
    }
    let count = 0;
    try {
      for (const uid of eligible) {
        await this.applyGift(uid, amount);
        count++;
      }
    } finally {
      // Logged even if a write fails part way, with how many went through.
      this.emit({ kind: 'punish', action: 'gift_all', reason: 'admin', amount, count, planned: eligible.length, total: amount * count, note: cleanNote(note) });
    }
    return { count, total: amount * count };
  }

  async reset(uid) {
    await this.backup(uid, 'before_admin_reset');
    await this.db.collection('users').doc(uid).set({ strubles_balance_v1: STARTING_BALANCE, balance_reset_at: new Date(this.now()), ...CAP_RESET }, { merge: true });
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
        cap: this.balance.capFromData(x),
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

  // Clears a warning without touching the ban or the balance: the cheat-warning
  // timestamp, the strike history, and any admin warning still showing as unread.
  async unwarn(uid) {
    const ref = this.db.collection('users').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    const update = { cheat_warning_at: null };
    if (data.admin_warning && data.admin_warning.id) update.admin_warning_dismissed = data.admin_warning.id;
    await ref.set(update, { merge: true });
    await this.db.collection('cheat_strikes').doc(uid).delete();
    this.streaks.delete(uid);
    this.emit({ kind: 'punish', action: 'unwarn', uid, name: await this.labelFor(uid), reason: 'admin' });
  }

  // Undoes a ban that should not have happened: releases it, and puts back the
  // balance and wallet cap saved in the snapshot taken just before the ban.
  // Leaderboard rows the ban deleted are not in that snapshot, so they stay gone.
  async restore(uid) {
    const snaps = await this.db.collection(ARCHIVE_BACKUP).where('uid', '==', uid).get();
    const copies = snaps.docs
      .map((d) => d.data())
      .filter((c) => c.reason === 'before_ban' && c.data)
      .sort((a, b) => toMsAny(b.at) - toMsAny(a.at));
    if (!copies.length) throw new Error('No snapshot from before the ban to restore from');
    const saved = JSON.parse(copies[0].data);
    const update = { ban_until: null, cheat_warning_at: null };
    for (const key of ['strubles_balance_v1', 'tycoon_bank_level_v1', 'tycoon_village_v2']) {
      if (saved[key] !== undefined) update[key] = saved[key];
    }
    update.balance_reset_at = new Date(this.now());
    await this.db.collection('bans').doc(uid).delete();
    await this.db.collection('cheat_strikes').doc(uid).delete();
    await this.db.collection('users').doc(uid).set(update, { merge: true });
    this.emit({ kind: 'punish', action: 'restore', uid, name: await this.labelFor(uid), reason: 'admin', to: Number(saved.strubles_balance_v1) || 0 });
  }
}

function toMsAny(v) {
  return v && typeof v.toDate === 'function' ? v.toDate().getTime() : v ? new Date(v).getTime() : 0;
}

// The browser's last gain: { amount, page, at }, written next to the balance.
// It is client-reported, so it is used to log where a gain happened, not to
// decide anything on its own.
function lastGainOf(data) {
  try {
    const g = JSON.parse((data && data.strubles_last_gain_v1) || 'null');
    return g && typeof g === 'object' ? { amount: Number(g.amount) || 0, page: typeof g.page === 'string' ? g.page.slice(0, 120) : null, kind: ['refund', 'grant', 'settled'].includes(g.kind) ? g.kind : 'earn' } : { amount: 0, page: null, kind: 'earn' };
  } catch { return { amount: 0, page: null, kind: 'earn' }; }
}

// The last wallet operation (see wallet.js): its kind, amount and page, if it is recent.
function lastOpOf(data, now) {
  try {
    const o = JSON.parse((data && data.wallet_last_op) || 'null');
    if (!o || typeof o !== 'object' || now - (Number(o.at) || 0) > 15000) return null;
    return { kind: String(o.kind || '').slice(0, 20), amount: Number(o.amount) || 0, page: typeof o.page === 'string' ? o.page.slice(0, 120) : null };
  } catch { return null; }
}


module.exports = { AccountWatch, STARTING_BALANCE, STRIKE_WINDOW_MS, BAN_MS };

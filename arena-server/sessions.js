// Play sessions: a signed-in player's run of Strubles activity on one game page. A new
// session starts after GAP_MS with no activity, or when the page changes. Active time is
// the first to the last action, so a session of one action counts as zero minutes.
//
// Only what goes through the wallet is seen: solo games, and the Strubles from them. Arena
// multiplayer games do not touch the wallet, so they are not counted here.
const GAP_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const COLLECTION = 'play_sessions';
const LIST_LIMIT = 5000;
// Ops that pay the player. A stake takes money from the player, so it counts as staked.
const PAID_KINDS = new Set(['win', 'settle', 'tetris', 'daily', 'starter']);

class PlaySessions {
  constructor(db, { now = () => Date.now(), gapMs = GAP_MS } = {}) {
    this.db = db;
    this.now = now;
    this.gapMs = gapMs;
    this.open = new Map();    // "uid|page" -> the session that is running there
  }

  // items: one per op that went through: { page, kind, applied }. Writes each touched
  // session's totals in full, so a restart only starts a new session, never double-counts.
  async record(uid, items) {
    const now = this.now();
    const touched = new Map();
    for (const it of items) {
      if (typeof it.page !== 'string' || !it.page.startsWith('/')) continue;
      const key = uid + '|' + it.page;
      let s = this.open.get(key);
      if (!s || now - s.last > this.gapMs) {
        s = { id: uid + '_' + now + '_' + Math.random().toString(36).slice(2, 8), uid, page: it.page, start: now, last: now, actions: 0, rounds: 0, staked: 0, won: 0 };
        this.open.set(key, s);
      }
      s.last = now;
      s.actions += 1;
      if (it.kind === 'stake') { s.rounds += 1; s.staked += it.applied || 0; }
      if (PAID_KINDS.has(it.kind)) s.won += it.applied || 0;
      touched.set(s.id, s);
    }
    for (const s of touched.values()) {
      await this.db.collection(COLLECTION).doc(s.id).set({
        uid: s.uid, page: s.page, start: new Date(s.start), last: new Date(s.last),
        actions: s.actions, rounds: s.rounds, staked: s.staked, won: s.won,
      }, { merge: true });
    }
  }

  // The last `days` days, grouped by game page: how many sessions, how many players,
  // how many active minutes, and the Strubles staked and won.
  async summary(days = 7) {
    const since = this.now() - days * DAY_MS;
    const snap = await this.db.collection(COLLECTION).orderBy('last', 'desc').limit(LIST_LIMIT).get();
    const games = new Map();
    const everyone = new Set();
    let sessions = 0, minutes = 0, staked = 0, won = 0;
    for (const d of snap.docs) {
      const s = d.data();
      const last = new Date(s.last).getTime();
      if (!(last >= since)) continue;
      const g = games.get(s.page) || { page: s.page, sessions: 0, players: new Set(), minutes: 0, rounds: 0, staked: 0, won: 0, actions: 0 };
      const mins = Math.max(0, (last - new Date(s.start).getTime()) / 60000);
      g.sessions += 1;
      g.players.add(s.uid);
      g.minutes += mins;
      g.rounds += s.rounds || 0;
      g.staked += s.staked || 0;
      g.won += s.won || 0;
      g.actions += s.actions || 0;
      games.set(s.page, g);
      everyone.add(s.uid);
      sessions += 1; minutes += mins; staked += s.staked || 0; won += s.won || 0;
    }
    const rows = [...games.values()]
      .map((g) => ({ ...g, players: g.players.size, minutes: Math.round(g.minutes) }))
      .sort((a, b) => b.minutes - a.minutes || b.actions - a.actions);
    return {
      days,
      games: rows,
      totals: { sessions, players: everyone.size, minutes: Math.round(minutes), staked, won },
      // The query reads at most LIST_LIMIT of the newest sessions, so a full read means
      // older ones may be left out.
      truncated: snap.docs.length >= LIST_LIMIT,
    };
  }
}

module.exports = { PlaySessions, GAP_MS, COLLECTION };

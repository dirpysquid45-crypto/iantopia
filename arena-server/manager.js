const BlackjackGame = require('./blackjack');
const { BattleshipGame } = require('./battleship');
const BalanceManager = require('./balance');

const GAME_TYPES = new Set(['blackjack', 'battleship']);
const MAX_BET = 1000000;
const SUGGESTION_STATUSES = new Set(['new', 'public', 'archived']);

class Manager {
  constructor(db, auth, opts = {}) {
    this.db = db;
    this.auth = auth;
    this.opts = opts;                                // { timing } overrides, used by tests
    this.balance = opts.balance || new BalanceManager(db);
    this.connections = new Map(); // sessionId -> { userId, ws, guest, name }
    this.queue = [];              // open lobbies
    this.tables = new Map();      // tableId -> game
  }

  // ---- lookups -----------------------------------------------------------
  tableBySession(sessionId) {
    for (const game of this.tables.values()) {
      if (!game.tableClosed && game.indexOf(sessionId) !== -1) return game;
    }
    return null;
  }
  tableByUser(userId) {
    for (const game of this.tables.values()) {
      if (!game.tableClosed && game.players.some((p) => p.userId === userId)) return game;
    }
    return null;
  }
  // One commitment per person. Without this a double-click (or a second tab)
  // could open two lobbies, and the two could then be matched to each other.
  isBusy(userId) {
    return this.queue.some((q) => q.userId === userId) || !!this.tableByUser(userId);
  }

  sendTo(ws, msg) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch {} }
  fail(ws, message, code) { this.sendTo(ws, { type: 'error', message, code }); }

  lobbyList() {
    return this.queue.map((p) => ({
      queueId: p.queueId, bet: p.bet, gameType: p.gameType, name: p.name, guest: !!p.guest, friendly: p.bet === 0,
    }));
  }
  broadcastLobbies() {
    const msg = JSON.stringify({ type: 'lobby_update', lobbies: this.lobbyList() });
    for (const { ws } of this.connections.values()) {
      try { if (ws.readyState === 1) ws.send(msg); } catch {}
    }
  }

  // ---- connections -------------------------------------------------------
  registerConnection(userId, sessionId, ws, info = {}) {
    this.connections.set(sessionId, { userId, ws, guest: !!info.guest, name: info.name || 'Player', admin: !!info.admin });

    // Coming back to a game already in progress: this connection takes the seat
    // over, whether or not the server has noticed the old socket die yet. A
    // phone that lost signal reconnects before the old socket times out, and
    // refusing it would strand them in a game they could not rejoin.
    const game = this.tableByUser(userId);
    if (game) {
      const i = game.players.findIndex((p) => p.userId === userId);
      const seat = game.players[i];
      if (seat.sessionId !== sessionId) {
        // Remember the OLD session and socket before reconnect() overwrites
        // them: it mutates this same player object, so reading seat.sessionId
        // afterwards gives the NEW id, and deleting that removed the player we
        // had just registered. Every message they sent after reconnecting was
        // then dropped silently.
        const oldSession = seat.sessionId;
        const oldWs = seat.ws;
        game.reconnect(i, sessionId, ws);
        if (oldWs && oldWs !== ws) { try { oldWs.close(4000, 'replaced'); } catch {} }
        this.connections.delete(oldSession);
      }
    }
    // A fresh client has missed every earlier lobby broadcast.
    this.sendTo(ws, { type: 'lobby_update', lobbies: this.lobbyList() });
  }

  deregisterConnection(userId, sessionId) {
    this.connections.delete(sessionId);
    const wasQueued = this.queue.some((p) => p.sessionId === sessionId);
    this.queue = this.queue.filter((p) => p.sessionId !== sessionId);
    if (wasQueued) this.broadcastLobbies();
    // A game in progress waits out a grace period for them to come back
    // rather than forfeiting at once (see ArenaGame.disconnect).
    const game = this.tableBySession(sessionId);
    if (game) game.disconnect(sessionId);
  }

  // ---- messages ----------------------------------------------------------
  async handleMessage(userId, sessionId, msg) {
    const conn = this.connections.get(sessionId);
    if (!conn || !msg || typeof msg.type !== 'string') return;
    const ws = conn.ws;

    switch (msg.type) {
      case 'join_queue':
        return this.joinQueue(userId, sessionId, msg.bet, msg.gameType || 'blackjack', ws);
      case 'match_bet':
        return this.matchBet(userId, sessionId, msg.queueId, ws);
      case 'leave_queue':
        return this.leaveQueue(sessionId);
      case 'ping':
        return this.sendTo(ws, { type: 'pong' });
      case 'suggest':
        return this.suggest(userId, conn, msg);
      case 'suggestions_list':
        return this.listSuggestions(conn);
      case 'suggestion_set':
        return this.setSuggestion(conn, msg);
      case 'suggestion_delete':
        return this.deleteSuggestion(conn, msg);
      case 'suggestions_public':
        return this.publicSuggestions(conn);
      case 'action': {
        const game = this.tableBySession(sessionId);
        if (game) await game.handleAction(sessionId, msg.action, { x: msg.x, y: msg.y });
        return;
      }
      case 'place_ships': {
        const game = this.tableBySession(sessionId);
        if (game instanceof BattleshipGame) game.submitFleet(game.indexOf(sessionId), msg.ships);
        return;
      }
      case 'rematch_accept': {
        const game = this.tableBySession(sessionId);
        if (game) await game.handleRematchResponse(sessionId);
        return;
      }
      case 'rematch_decline': {
        const game = this.tableBySession(sessionId);
        if (game) game.declineRematch(sessionId);
        return;
      }
      case 'leave_game': {
        const game = this.tableBySession(sessionId);
        if (game) await game.forfeit(sessionId);
        return;
      }
      default:
        return;
    }
  }

  // The site's suggestion box. Written here with the Admin SDK so it works
  // without any Firestore client rules for the `suggestions` collection.
  async suggest(userId, conn, msg) {
    const reply = (ok, message) => this.sendTo(conn.ws, { type: 'suggest_result', ok, message });
    if (conn.guest) return reply(false, 'Sign in first so I know who to credit.');
    const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 1000) : '';
    if (!text) return reply(false, 'Write something first.');
    const now = Date.now();
    this.lastSuggest = this.lastSuggest || new Map();
    if (now - (this.lastSuggest.get(userId) || 0) < 10000) return reply(false, 'Slow down — try again in a few seconds.');
    this.lastSuggest.set(userId, now);
    try {
      await this.db.collection('suggestions').add({
        text, uid: userId, displayName: conn.name,
        page: typeof msg.page === 'string' ? msg.page.slice(0, 100) : '',
        createdAt: new Date(), status: 'new',
      });
      reply(true, 'Sent — thank you!');
    } catch (e) {
      console.error('[suggest] write failed:', e.message);
      this.lastSuggest.delete(userId);
      reply(false, 'Could not send. Please try again.');
    }
  }

  // The dev's inbox: newest first, admins only (checked against the verified
  // token at login, never against anything the client says).
  async listSuggestions(conn) {
    if (!conn.admin) return this.fail(conn.ws, 'Not allowed', 'forbidden');
    try {
      const snap = await this.db.collection('suggestions').orderBy('createdAt', 'desc').limit(5000).get();
      const rows = snap.docs.map((d) => {
        const v = d.data();
        const t = v.createdAt && v.createdAt.toDate ? v.createdAt.toDate() : v.createdAt;
        const posted = v.postedAt && v.postedAt.toDate ? v.postedAt.toDate() : v.postedAt;
        return {
          id: d.id, text: v.text || '', displayName: v.displayName || '', uid: v.uid || '', page: v.page || '',
          createdAt: t ? new Date(t).toISOString() : '',
          status: SUGGESTION_STATUSES.has(v.status) ? v.status : 'new', // older docs have no status
          hideName: !!v.hideName, postedAt: posted ? new Date(posted).toISOString() : '',
        };
      });
      this.sendTo(conn.ws, { type: 'suggestions', rows });
    } catch (e) {
      console.error('[suggest] list failed:', e.message);
      this.fail(conn.ws, 'Could not load suggestions', 'list_failed');
    }
  }

  // Moves a suggestion between the private inbox ('new'), the public forum
  // ('public') and the Excel backlog ('archived'). Admins only.
  async setSuggestion(conn, msg) {
    if (!conn.admin) return this.fail(conn.ws, 'Not allowed', 'forbidden');
    const id = typeof msg.id === 'string' && /^[A-Za-z0-9]{1,40}$/.test(msg.id) ? msg.id : null;
    if (!id || !SUGGESTION_STATUSES.has(msg.status)) return this.fail(conn.ws, 'Bad request', 'bad_request');
    try {
      const ref = this.db.collection('suggestions').doc(id);
      if (!(await ref.get()).exists) return this.fail(conn.ws, 'That suggestion no longer exists', 'missing');
      const update = { status: msg.status };
      if (msg.status === 'public') { update.postedAt = new Date(); update.hideName = !!msg.hideName; }
      await ref.set(update, { merge: true });
      this.sendTo(conn.ws, { type: 'suggestion_updated', id, status: msg.status, hideName: !!update.hideName, postedAt: update.postedAt ? update.postedAt.toISOString() : '' });
    } catch (e) {
      console.error('[suggest] update failed:', e.message);
      this.fail(conn.ws, 'Could not update that suggestion', 'update_failed');
    }
  }

  async deleteSuggestion(conn, msg) {
    if (!conn.admin) return this.fail(conn.ws, 'Not allowed', 'forbidden');
    const id = typeof msg.id === 'string' && /^[A-Za-z0-9]{1,40}$/.test(msg.id) ? msg.id : null;
    if (!id) return this.fail(conn.ws, 'Bad request', 'bad_request');
    try {
      await this.db.collection('suggestions').doc(id).delete();
      this.sendTo(conn.ws, { type: 'suggestion_deleted', id });
    } catch (e) {
      console.error('[suggest] delete failed:', e.message);
      this.fail(conn.ws, 'Could not delete that suggestion', 'delete_failed');
    }
  }

  // What the public forum shows: only posted suggestions, and never the uid.
  async publicSuggestions(conn) {
    try {
      const snap = await this.db.collection('suggestions').where('status', '==', 'public').limit(500).get();
      const rows = snap.docs.map((d) => {
        const v = d.data();
        const at = (x) => (x && x.toDate ? x.toDate() : x);
        const posted = at(v.postedAt) || at(v.createdAt);
        return { id: d.id, text: v.text || '', name: v.hideName ? 'Anonymous' : (v.displayName || 'Anonymous'), postedAt: posted ? new Date(posted).toISOString() : '' };
      }).sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
      this.sendTo(conn.ws, { type: 'suggestions_public', rows });
    } catch (e) {
      console.error('[suggest] public list failed:', e.message);
      this.fail(conn.ws, 'Could not load suggestions', 'list_failed');
    }
  }

  // ---- matchmaking -------------------------------------------------------
  // Shared rules for opening or taking a lobby. Returns an error string, or null.
  stakeError(conn, bet) {
    if (conn.guest && bet > 0) {
      return 'Sign in to play for Strubles. Guests can play friendly (0 Strubles) games.';
    }
    return null;
  }

  async joinQueue(userId, sessionId, bet, gameType, ws) {
    const conn = this.connections.get(sessionId);
    if (!conn) return;
    if (!GAME_TYPES.has(gameType)) return this.fail(ws, 'Unknown game');
    // The bet is validated here and again in BalanceManager. Before this check a
    // negative bet was accepted (it passed `balance < bet`) and then "deducted"
    // as a credit, which matched against itself or an accomplice minted money.
    if (!Number.isSafeInteger(bet) || bet < 0 || bet > MAX_BET) return this.fail(ws, 'Invalid bet');
    const stake = this.stakeError(conn, bet);
    if (stake) return this.fail(ws, stake, 'guest_stake');

    if (bet > 0) {
      let balance;
      try { balance = await this.balance.getBalance(userId); }
      catch (e) { return this.fail(ws, 'Could not check your balance'); }
      if (balance < bet) return this.fail(ws, 'Insufficient balance');
    }

    // Everything below is synchronous on purpose: the busy check and the push
    // must not have an await between them, or two quick messages both pass.
    if (!this.connections.has(sessionId)) return;
    if (this.isBusy(userId)) return this.fail(ws, 'You already have an open lobby or a game in progress', 'busy');

    const entry = {
      queueId: Math.random().toString(36).slice(2, 10), userId, sessionId, bet, gameType, ws,
      name: conn.name, guest: conn.guest,
    };
    // Match against ANY compatible waiting lobby, not just the first two in the
    // queue: a mismatched pair at the front used to block everyone behind it.
    const partner = this.queue.find((q) => q.bet === bet && q.gameType === gameType && q.userId !== userId);
    if (partner) {
      this.queue = this.queue.filter((q) => q !== partner);
      this.sendTo(ws, { type: 'status', status: 'matched' });
      this.broadcastLobbies();
      this.launch(partner, entry);
      return;
    }
    this.queue.push(entry);
    this.sendTo(ws, { type: 'status', status: 'queued', queueId: entry.queueId, bet });
    this.broadcastLobbies();
  }

  leaveQueue(sessionId) {
    const wasQueued = this.queue.some((p) => p.sessionId === sessionId);
    this.queue = this.queue.filter((p) => p.sessionId !== sessionId);
    if (wasQueued) this.broadcastLobbies();
  }

  // Taking someone's open lobby, adopting its exact bet.
  async matchBet(userId, sessionId, queueId, ws) {
    const conn = this.connections.get(sessionId);
    if (!conn) return;
    let target = this.queue.find((p) => p.queueId === queueId);
    if (!target) return this.fail(ws, 'That lobby is no longer available');
    if (target.userId === userId) return this.fail(ws, "You can't match your own lobby");
    const stake = this.stakeError(conn, target.bet);
    if (stake) return this.fail(ws, stake, 'guest_stake');
    if (target.bet > 0) {
      let balance;
      try { balance = await this.balance.getBalance(userId); }
      catch (e) { return this.fail(ws, 'Could not check your balance'); }
      if (balance < target.bet) return this.fail(ws, 'Insufficient balance');
    }
    // The lobby may have been taken while we were awaiting the balance.
    const idx = this.queue.findIndex((p) => p.queueId === queueId);
    if (idx === -1) return this.fail(ws, 'That lobby is no longer available');
    target = this.queue[idx];
    if (!this.connections.has(sessionId)) return;
    if (this.isBusy(userId)) return this.fail(ws, 'You already have an open lobby or a game in progress', 'busy');
    this.queue.splice(idx, 1);
    this.broadcastLobbies();
    this.launch(target, {
      userId, sessionId, bet: target.bet, gameType: target.gameType, ws, name: conn.name, guest: conn.guest,
    });
  }

  // startGame() is async and the callers aren't, so it must be .catch()'d: an
  // unhandled rejection here would take the whole process (and every other
  // match) down.
  launch(a, b) {
    this.startGame(a, b).catch((e) => {
      console.error('[startGame] failed to start match:', e.message);
      const msg = 'Failed to start match: ' + e.message;
      this.fail(a.ws, msg);
      this.fail(b.ws, msg);
    });
  }

  async startGame(a, b) {
    const tableId = Math.random().toString(36).slice(2, 10);
    const opts = { timing: this.opts.timing, db: this.db, makeDeck: this.opts.makeDeck };
    const game = a.gameType === 'battleship'
      ? new BattleshipGame(tableId, a, b, this.balance, opts)
      : new BlackjackGame(tableId, a, b, this.balance, opts);
    game.closeTable = () => this.tables.delete(tableId);
    this.tables.set(tableId, game);
    try {
      await game.start(); // refunds anything already charged if it fails
    } catch (e) {
      game.close();
      throw e;
    }
  }

  shutdown() {
    for (const game of this.tables.values()) game.close();
    this.tables.clear();
    this.queue = [];
  }
}

module.exports = Manager;

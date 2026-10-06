// arena-client.js
// The connection layer shared by Arena Blackjack and Arena Battleship.
//
// Both pages used to carry their own copy of "open a socket, send the Firebase
// token, retry every two seconds forever". The copies could not play as a guest,
// reconnected blindly (so a locked phone just looped), never noticed a dead
// connection, and could not tell "I was replaced by another tab" from "the
// network dropped". This does all of that once.
//
// Who you are:
//   * signed in  -> authenticates with your Firebase ID token and can play for Strubles
//   * not signed in -> authenticates as a GUEST (no account, no Firestore) and can
//     play friendly (0 Strubles) games only; the server enforces that.
//
// Usage:
//   const arena = ArenaClient.create({ game: 'battleship', onMessage, onState });
//   arena.connect(); arena.send({ type: 'join_queue', bet: 0, gameType: 'battleship' });
window.ArenaClient = (function () {
  const GUEST_ID_KEY = 'arena_guest_id_v1';
  const GUEST_NAME_KEY = 'arena_guest_name_v1';

  function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Per TAB, deliberately (sessionStorage, not localStorage). It survives a
  // reload -- which is what lets a guest rejoin a game in progress -- but two
  // tabs get two identities, so one person can open two tabs to try the game
  // against themselves, and the server's "one seat per identity" rule does not
  // make the second tab steal the first one's game.
  function guestId() {
    try {
      let id = sessionStorage.getItem(GUEST_ID_KEY);
      if (!id) { id = randomHex(8); sessionStorage.setItem(GUEST_ID_KEY, id); }
      return id;
    } catch { return randomHex(8); }
  }
  function savedGuestName() {
    try { return localStorage.getItem(GUEST_NAME_KEY) || undefined; } catch { return undefined; }
  }
  function saveGuestName(name) {
    try { localStorage.setItem(GUEST_NAME_KEY, String(name).slice(0, 20)); } catch {}
  }

  // wss through the site's proxy in production. Locally it uses the page's own
  // hostname rather than "localhost", so a phone on the same network can reach a
  // laptop running the dev server.
  function wsUrl(game) {
    if (location.protocol === 'https:') return 'wss://iantopia.com/arena-ws/' + game;
    return 'ws://' + (location.hostname || 'localhost') + ':4001';
  }

  function create(opts) {
    const { game, onMessage, onState, canSwitchIdentity } = opts;
    const url = opts.url || wsUrl(game);
    let ws = null;
    let state = 'idle';          // idle | connecting | open | closed | replaced
    let me = { guest: true, name: null, signedIn: false };
    let retry = 0;
    let replaced = false;
    let lastHeard = 0;
    let retryTimer = null, pingTimer = null, pongTimer = null;

    function setState(next) {
      if (state === next) return;
      state = next;
      if (onState) onState(next, me);
    }

    function stopTimers() {
      clearInterval(pingTimer); clearTimeout(pongTimer); pingTimer = pongTimer = null;
    }
    // A socket that has silently died (phone locked, tunnel dropped) looks open
    // until the OS gives up minutes later. A ping every 15s that must be answered
    // within 8s finds out quickly, so reconnecting (and rejoining the game) starts
    // while there is still time.
    function startKeepalive(sock) {
      stopTimers();
      pingTimer = setInterval(() => {
        if (sock.readyState !== 1) return;
        try { sock.send(JSON.stringify({ type: 'ping' })); } catch { return; }
        clearTimeout(pongTimer);
        pongTimer = setTimeout(() => { try { sock.close(); } catch {} }, 8000);
      }, 15000);
    }

    async function authMessage() {
      const user = window.CloudSync && window.CloudSync.currentUser;
      if (user) {
        try { return { type: 'auth', token: await user.getIdToken() }; } catch {}
      }
      return { type: 'auth_guest', guestId: guestId(), name: savedGuestName() };
    }

    async function connect() {
      if (replaced) return;
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
      clearTimeout(retryTimer);
      setState('connecting');
      const auth = await authMessage();
      const sock = new WebSocket(url);
      ws = sock;
      sock.onopen = () => { try { sock.send(JSON.stringify(auth)); } catch {} };
      sock.onmessage = (ev) => {
        lastHeard = Date.now();
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'pong') { clearTimeout(pongTimer); return; }
        if (msg.type === 'auth_ok') {
          me = { guest: !!msg.guest, name: msg.name, signedIn: !msg.guest };
          retry = 0;
          startKeepalive(sock);
          setState('open');
        }
        if (onMessage) onMessage(msg);
      };
      sock.onclose = (ev) => {
        stopTimers();
        if (ws === sock) ws = null;
        // 4000: the server gave our seat to a newer connection (another tab).
        // Reconnecting would just take it back and the two would fight forever.
        if (ev && ev.code === 4000) { replaced = true; setState('replaced'); return; }
        setState('closed');
        scheduleReconnect();
      };
      sock.onerror = () => { /* onclose follows */ };
    }

    function scheduleReconnect() {
      if (replaced) return;
      clearTimeout(retryTimer);
      const delay = Math.min(8000, 700 * Math.pow(2, retry++));
      retryTimer = setTimeout(connect, delay);
    }

    function send(msg) {
      if (!ws || ws.readyState !== 1) return false;
      try { ws.send(JSON.stringify(msg)); return true; } catch { return false; }
    }

    // Coming back to a tab (unlocking a phone) is the moment a dead connection
    // matters most: reconnect right away instead of waiting out the back-off.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || replaced) return;
      if (!ws || ws.readyState > 1) { retry = 0; connect(); return; }
      if (Date.now() - lastHeard > 20000) send({ type: 'ping' });
    });
    window.addEventListener('online', () => { if (!replaced && (!ws || ws.readyState > 1)) { retry = 0; connect(); } });

    // Signing in while connected as a guest: switch over, but never mid-game.
    window.addEventListener('cloudsync:authchanged', (e) => {
      if (!(e.detail && e.detail.user) || replaced || !me.guest) return;
      if (canSwitchIdentity && !canSwitchIdentity()) return;
      if (ws) { try { ws.close(1000, 'switching identity'); } catch {} }
      retry = 0;
      setTimeout(connect, 50);
    });

    return {
      connect, send,
      // Re-authenticate (e.g. after a guest changes their display name).
      reconnect: () => { if (ws) { try { ws.close(1000, 'reconnect'); } catch {} } else connect(); },
      get state() { return state; },
      get me() { return me; },
      isOpen: () => !!ws && ws.readyState === 1,
      get socket() { return ws; },   // exposed so tests can drop the connection
      close: () => { replaced = true; clearTimeout(retryTimer); stopTimers(); if (ws) { try { ws.close(); } catch {} } },
    };
  }

  return { create, guestId, savedGuestName, saveGuestName, wsUrl };
})();

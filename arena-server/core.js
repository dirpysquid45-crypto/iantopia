const WebSocket = require('ws');
const Manager = require('./manager');
const RateLimit = require('./rate-limit');

// Addresses that can only be our own reverse proxy / docker network.
function isPrivateAddress(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  return a === '::1' || a === '127.0.0.1' || /^10\./.test(a) || /^192\.168\./.test(a)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^f[cd][0-9a-f]{2}:/i.test(a);
}

// The socket's own address is the proxy's for every visitor, so the per-IP
// connection limit used to apply to the entire site at once (5 connections in
// total). Forwarding headers are believed only when the direct peer is private,
// i.e. when the request really did come through our own proxy.
function clientIp(req) {
  const remote = req.socket.remoteAddress || '127.0.0.1';
  if (isPrivateAddress(remote)) {
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return remote;
}

function cleanName(raw, fallback) {
  const s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 20);
  return s || fallback;
}

// Who may read the suggestion inbox: ADMIN_UIDS / ADMIN_EMAILS (comma lists).
function adminsFromEnv(env) {
  const list = (v) => String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { uids: list(env.ADMIN_UIDS), emails: list(env.ADMIN_EMAILS) };
}
function isAdminToken(decoded, admins) {
  if (!decoded || !admins) return false;
  if (admins.uids.includes(String(decoded.uid).toLowerCase())) return true;
  // An email only counts if Google has verified it.
  return !!decoded.email && decoded.email_verified !== false && admins.emails.includes(String(decoded.email).toLowerCase());
}

function createServer(options = {}) {
  const {
    port = 4001, host, db, auth, timing, rate, quiet = false, makeDeck,
    authTimeoutMs = 10000, heartbeatMs = 25000, admins,
  } = options;
  const adminList = admins || adminsFromEnv(process.env);
  const log = quiet ? () => {} : (...a) => console.log(...a);

  const wss = new WebSocket.Server({ port, host, clientTracking: false, maxPayload: 16 * 1024 });
  const manager = new Manager(db, auth, { timing, makeDeck });
  const rateLimit = new RateLimit(rate);
  const sockets = new Set();

  // A connection that stops answering pings is dead even if TCP has not noticed
  // (a locked phone, a dropped tunnel). Terminating it lets the game's
  // reconnect grace start, instead of the table waiting on it indefinitely.
  const heartbeat = setInterval(() => {
    for (const ws of sockets) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }, heartbeatMs);
  heartbeat.unref();

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    if (rateLimit.isLimited(ip)) {
      log(`[connection] rejected ${ip}: too many connections`);
      ws.close(1008, 'Too many connections from this IP');
      return;
    }
    ws.isAlive = true;
    sockets.add(ws);
    ws.on('pong', () => { ws.isAlive = true; });

    let userId = null;
    let sessionId = null;
    // Nobody should hold a slot open without ever saying who they are.
    const authTimer = setTimeout(() => { if (!userId) ws.close(1008, 'Authentication timed out'); }, authTimeoutMs);

    async function authenticate(msg) {
      if (msg.type === 'auth_guest') {
        const gid = typeof msg.guestId === 'string' && /^[a-z0-9]{12,40}$/i.test(msg.guestId)
          ? msg.guestId.toLowerCase()
          : Math.random().toString(36).slice(2, 16).padEnd(12, '0');
        userId = 'guest_' + gid;
        sessionId = Math.random().toString(36).slice(2, 12);
        const name = cleanName(msg.name, 'Guest ' + (1000 + Math.floor(Math.random() * 9000)));
        ws.send(JSON.stringify({ type: 'auth_ok', sessionId, guest: true, name }));
        manager.registerConnection(userId, sessionId, ws, { guest: true, name });
        return;
      }
      if (msg.type !== 'auth' || !msg.token) { ws.close(1008, 'Must authenticate first'); return; }
      try {
        const decoded = await auth.verifyIdToken(msg.token);
        userId = decoded.uid;
        sessionId = Math.random().toString(36).slice(2, 12);
        const name = cleanName(decoded.name || (decoded.email ? decoded.email.split('@')[0] : ''), 'Player');
        ws.send(JSON.stringify({ type: 'auth_ok', sessionId, guest: false, name }));
        manager.registerConnection(userId, sessionId, ws, { guest: false, name, admin: isAdminToken(decoded, adminList) });
      } catch (e) {
        log('[auth] token verification failed:', e.message);
        ws.close(1008, 'Invalid token');
      }
    }

    async function onMessage(raw) {
      let msg;
      try { msg = JSON.parse(raw); } catch { ws.close(1008, 'Bad message'); return; }
      if (!msg || typeof msg !== 'object') { ws.close(1008, 'Bad message'); return; }
      if (!userId) { await authenticate(msg); return; }
      if (!rateLimit.allowMessage(sessionId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limited', code: 'rate_limited' }));
        return;
      }
      await manager.handleMessage(userId, sessionId, msg);
    }

    // Messages from one connection are handled strictly in order. Otherwise the
    // first message after `auth` could be processed while the token was still
    // being verified, and rejected as "not authenticated".
    let chain = Promise.resolve();
    ws.on('message', (raw) => {
      ws.isAlive = true;
      chain = chain.then(() => onMessage(raw)).catch((e) => {
        console.error('[message] error:', e.message);
        try { ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' })); } catch {}
      });
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      sockets.delete(ws);
      rateLimit.removeConnection(ip);
      if (sessionId) rateLimit.removeSession(sessionId);
      try {
        if (userId && sessionId) manager.deregisterConnection(userId, sessionId);
      } catch (e) {
        // One game's disconnect path must never take down every other match.
        console.error('[close] deregister failed:', e.message);
      }
    });
    ws.on('error', (err) => log(`[ws] error userId=${userId}: ${err.message}`));
  });

  return {
    wss, manager,
    address: () => wss.address(),
    close: () => new Promise((resolve) => {
      clearInterval(heartbeat);
      manager.shutdown();
      for (const ws of sockets) { try { ws.terminate(); } catch {} }
      wss.close(() => resolve());
    }),
  };
}

module.exports = { createServer, clientIp, isPrivateAddress, cleanName };

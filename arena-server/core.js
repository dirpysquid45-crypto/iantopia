const http = require('http');
const WebSocket = require('ws');
const Manager = require('./manager');
const RateLimit = require('./rate-limit');
const { Wallet } = require('./wallet');

const WALLET_BODY_MAX = 16 * 1024;
const WALLET_OPS_MAX = 50;

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
// The owner's dev endpoint: only a verified sign-in with the owner's email. OWNER_EMAIL
// is compared lowercased. If it is not set, nobody is the owner.
function isOwnerToken(decoded, ownerEmail) {
  if (!decoded || !ownerEmail || decoded.email_verified !== true) return false;
  return String(decoded.email || '').toLowerCase() === ownerEmail;
}

function createServer(options = {}) {
  const {
    port = 4001, host, db, auth, timing, rate, quiet = false, makeDeck,
    authTimeoutMs = 10000, heartbeatMs = 25000, admins, accounts,
  } = options;
  const adminList = admins || adminsFromEnv(process.env);
  const ownerEmail = String(options.ownerEmail !== undefined ? options.ownerEmail : (process.env.OWNER_EMAIL || '')).trim().toLowerCase();
  const log = quiet ? () => {} : (...a) => console.log(...a);

  const manager = new Manager(db, auth, { timing, makeDeck, accounts });
  const wallet = new Wallet(db, manager.balance);

  // One HTTP server carries both the game socket (ws) and the wallet routes
  // (/wallet and /wallet/ops). nginx sends /arena-ws/ and /arena-api/ here.
  const httpServer = http.createServer((req, res) => {
    handleWallet(req, res).catch(() => { if (!res.headersSent) sendJson(res, 500, { error: 'server' }); });
  });
  const wss = new WebSocket.Server({ server: httpServer, clientTracking: false, maxPayload: 16 * 1024 });
  httpServer.on('listening', () => wss.emit('listening'));
  httpServer.listen(port, host);

  function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  }
  function bearer(req) {
    const h = String(req.headers.authorization || '');
    return h.startsWith('Bearer ') ? h.slice(7) : null;
  }
  // Only a signed-in account has a wallet. Guests keep their own local currency.
  async function signedInUid(req) {
    const token = bearer(req);
    if (!token) return null;
    try { return (await auth.verifyIdToken(token)).uid; } catch { return null; }
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let tooLarge = false;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        // Keep reading and drop the bytes, so the 413 reply can still be sent.
        if (size > WALLET_BODY_MAX) { if (!tooLarge) { tooLarge = true; reject(new Error('too large')); } return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  // Local development only: the page and the arena are on different ports there, so
  // the browser needs CORS. Production is same-origin through nginx, so no origin
  // other than this machine is ever allowed.
  const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  function allowLocalOrigin(req, res) {
    const origin = String(req.headers.origin || '');
    if (!LOCAL_ORIGIN.test(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  // Owner-only: a verified sign-in with the owner's email. Everyone else gets a 403, so
  // the endpoint tells nobody but the owner anything.
  async function handleOwnerCheck(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method' });
    let decoded = null;
    const token = bearer(req);
    if (token) { try { decoded = await auth.verifyIdToken(token); } catch {} }
    if (!isOwnerToken(decoded, ownerEmail)) return sendJson(res, 403, { error: 'not_owner' });
    return sendJson(res, 200, { owner: true });
  }
  async function handleWallet(req, res) {
    allowLocalOrigin(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/owner/check') return handleOwnerCheck(req, res);
    if (path !== '/wallet' && path !== '/wallet/ops') return sendJson(res, 404, { error: 'not_found' });
    const uid = await signedInUid(req);
    if (!uid) return sendJson(res, 401, { error: 'sign_in' });
    if (path === '/wallet' && req.method === 'GET') {
      return sendJson(res, 200, await wallet.read(uid));
    }
    if (path === '/wallet/ops' && req.method === 'POST') {
      let body;
      let raw;
      try { raw = await readBody(req); } catch (e) {
        if (e.message === 'too large') { res.setHeader('Connection', 'close'); return sendJson(res, 413, { error: 'too_large' }); }
        return sendJson(res, 400, { error: 'bad_json' });
      }
      try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'bad_json' }); }
      const ops = body && Array.isArray(body.ops) ? body.ops : null;
      if (!ops || ops.length < 1 || ops.length > WALLET_OPS_MAX) return sendJson(res, 400, { error: 'bad_ops' });
      const results = await wallet.applyBatch(uid, ops);
      const last = results.length ? results[results.length - 1] : null;
      return sendJson(res, 200, { results, balance: last && last.balance !== undefined ? last.balance : null });
    }
    return sendJson(res, 405, { error: 'method' });
  }
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
    address: () => httpServer.address(),
    close: () => new Promise((resolve) => {
      clearInterval(heartbeat);
      manager.shutdown();
      for (const ws of sockets) { try { ws.terminate(); } catch {} }
      wss.close(() => {
        httpServer.closeAllConnections && httpServer.closeAllConnections();
        httpServer.close(() => resolve());
      });
    }),
  };
}

module.exports = { createServer, clientIp, isPrivateAddress, cleanName, isOwnerToken };

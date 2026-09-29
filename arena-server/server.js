const WebSocket = require('ws');
const admin = require('firebase-admin');
const Manager = require('./manager');
const RateLimit = require('./rate-limit');

const PORT = process.env.PORT || 4001;

// Initialize Firebase Admin
const serviceAccountKey = require('./service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  projectId: 'iantopia'
});

const db = admin.firestore();
const auth = admin.auth();

const wss = new WebSocket.Server({ port: PORT, clientTracking: false });
const manager = new Manager(db, auth);
const rateLimit = new RateLimit();

console.log(`[Arena Server] Listening on 0.0.0.0:${PORT}`);

wss.on('connection', async (ws, req) => {
  const clientIp = req.socket.remoteAddress || '127.0.0.1';
  console.log(`[connection] New connection from ${clientIp}`);

  // Rate limit by IP
  if (rateLimit.isLimited(clientIp)) {
    console.log(`[connection] Rejected ${clientIp}: too many connections`);
    ws.close(1008, 'Too many connections from this IP');
    return;
  }

  let userId = null;
  let sessionId = null;

  ws.on('message', async (rawMessage) => {
    try {
      const msg = JSON.parse(rawMessage);

      // Auth phase
      if (!userId) {
        if (msg.type !== 'auth') {
          console.log(`[auth] Closing ${clientIp}: first message was '${msg.type}', not 'auth'`);
          ws.close(1008, 'Must authenticate first');
          return;
        }
        const token = msg.token;
        if (!token) {
          console.log(`[auth] Closing ${clientIp}: no token provided`);
          ws.close(1008, 'No token provided');
          return;
        }
        try {
          const decodedToken = await auth.verifyIdToken(token);
          userId = decodedToken.uid;
          sessionId = Math.random().toString(36).substring(7);
          console.log(`[auth] OK: userId=${userId} sessionId=${sessionId}`);
          ws.send(JSON.stringify({ type: 'auth_ok', sessionId }));
          manager.registerConnection(userId, sessionId, ws);
        } catch (e) {
          console.error('[auth] Token verification failed:', e.message);
          ws.close(1008, 'Invalid token');
        }
        return;
      }

      // Rate limit by connection (messages/sec)
      if (!rateLimit.allowMessage(sessionId)) {
        console.log(`[rate-limit] ${userId} (${sessionId}) hit the message rate limit`);
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limited' }));
        return;
      }

      console.log(`[message] ${userId} (${sessionId}): ${msg.type}${msg.type === 'join_queue' ? ` bet=${msg.bet} gameType=${msg.gameType}` : ''}${msg.type === 'action' ? ` action=${msg.action}` : ''}`);

      // Route messages to manager
      await manager.handleMessage(userId, sessionId, msg);
    } catch (e) {
      console.error('[message] Error:', e.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[close] userId=${userId} sessionId=${sessionId} code=${code} reason=${reason || '(none)'}`);
    try {
      if (userId && sessionId) {
        manager.deregisterConnection(userId, sessionId);
      }
    } catch (e) {
      // A bug in any one game's disconnect/forfeit path must never take
      // down the whole process -- that would drop every other concurrent
      // match, not just this connection's.
      console.error('[close] Error during deregisterConnection:', e.message);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket] Error for userId=${userId} sessionId=${sessionId}:`, err.message);
  });
});

process.on('SIGTERM', () => {
  console.log('[Arena Server] Shutting down...');
  wss.close(() => process.exit(0));
});

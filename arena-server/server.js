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

  // Rate limit by IP
  if (rateLimit.isLimited(clientIp)) {
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
          ws.close(1008, 'Must authenticate first');
          return;
        }
        const token = msg.token;
        if (!token) {
          ws.close(1008, 'No token provided');
          return;
        }
        try {
          const decodedToken = await auth.verifyIdToken(token);
          userId = decodedToken.uid;
          sessionId = Math.random().toString(36).substring(7);
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
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limited' }));
        return;
      }

      // Route messages to manager
      await manager.handleMessage(userId, sessionId, msg);
    } catch (e) {
      console.error('[message] Error:', e.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    if (userId && sessionId) {
      manager.deregisterConnection(userId, sessionId);
    }
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err.message);
  });
});

process.on('SIGTERM', () => {
  console.log('[Arena Server] Shutting down...');
  wss.close(() => process.exit(0));
});

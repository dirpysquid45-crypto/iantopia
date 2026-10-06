// Production entry point. Everything testable lives in core.js; this file only
// wires it to the real Firebase project.
const admin = require('firebase-admin');
const { createServer } = require('./core');

const PORT = process.env.PORT || 4001;

const serviceAccountKey = require('./service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  projectId: 'iantopia',
});

const server = createServer({ port: PORT, db: admin.firestore(), auth: admin.auth() });
console.log(`[Arena Server] Listening on 0.0.0.0:${PORT}`);

// A rejected promise anywhere must be logged, never fatal: by default Node
// exits on one, which drops every concurrent match.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err && err.stack || err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err && err.stack || err));

process.on('SIGTERM', () => {
  console.log('[Arena Server] Shutting down...');
  server.close().then(() => process.exit(0));
});

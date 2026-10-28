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

const db = admin.firestore();
const BalanceManager = require('./balance');
const { AccountWatch } = require('./accounts');
// Live feed, cheat detection, and punishments. Needs ADMIN_EMAILS (or
// ADMIN_UIDS) set in the environment, or nobody can open the admin feed.
const listFromEnv = (v) => String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
// The ban terms for a second offence. Defaults: 24 hours, reset to 100 Strubles.
const accounts = new AccountWatch({
  db, auth: admin.auth(), balance: new BalanceManager(db),
  admins: { uids: listFromEnv(process.env.ADMIN_UIDS), emails: listFromEnv(process.env.ADMIN_EMAILS) },
  banHours: process.env.BAN_HOURS ? Number(process.env.BAN_HOURS) : undefined,
  banReset: process.env.BAN_RESET_BALANCE ? process.env.BAN_RESET_BALANCE : undefined,
}).start();
// The owner's dev endpoint (/owner/check) answers only the verified owner's email.
const server = createServer({ port: PORT, db, auth: admin.auth(), accounts, ownerEmail: process.env.OWNER_EMAIL || '' });
console.log(`[Arena Server] Listening on 0.0.0.0:${PORT}`);

// A rejected promise anywhere must be logged, never fatal: by default Node
// exits on one, which drops every concurrent match.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err && err.stack || err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err && err.stack || err));

process.on('SIGTERM', () => {
  console.log('[Arena Server] Shutting down...');
  server.close().then(() => process.exit(0));
});

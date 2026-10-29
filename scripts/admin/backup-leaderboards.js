// Read-only backup of the three leaderboard collections, written to backups/
// as one JSON file. Run it before an update or a server move:
//
//   node backup-leaderboards.js
//
// The key is read from SERVICE_ACCOUNT if set, otherwise from
// service-account-key.json next to this file (gitignored, never commit it).
// Nothing is written to Firestore.
const fs = require('fs');
const path = require('path');

const COLLECTIONS = ['leaderboard', 'minesweeper_leaderboard', 'horse_leaderboard'];
const BACKUP_DIR = path.join(__dirname, 'backups');
const KEY_PATH = process.env.SERVICE_ACCOUNT || path.join(__dirname, 'service-account-key.json');

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`No service account key at ${KEY_PATH}. Set SERVICE_ACCOUNT or save the key next to this file.`);
    process.exit(1);
  }
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(KEY_PATH))),
    projectId: 'iantopia',
  });
  const db = admin.firestore();

  const out = { takenAt: new Date().toISOString(), collections: {} };
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    out.collections[name] = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    console.log(`${name}: ${snap.size} rows`);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `leaderboards-${out.takenAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Saved ${file}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});

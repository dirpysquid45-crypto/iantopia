#!/usr/bin/env node
// currency-reform.js
//
// One-time migration: converts every account's Strubles balance on a
// progressive curve, to bring balances that grew past intended limits
// (two real exploits this project hit -- a lootbox duplicate-refund bug,
// and a passive-income building that was quietly the best investment in
// the game) back in line, without wiping out a normal player's progress.
//
// Runs with a Firebase service-account key -- real admin access to
// Firestore, bypassing the security rules the client SDK is bound by --
// specifically so this can't be dodged by a player just staying offline
// on whatever day this ships. The client (public/cloud-sync.js) never
// gets anything like this level of access, by design.
//
// Usage:
//   node currency-reform.js              # dry run -- prints what WOULD
//                                         # change, writes nothing
//   node currency-reform.js --apply      # backs up the users collection,
//                                         # then actually writes
//
// Requires service-account-key.json in this same directory (gitignored --
// see README.md for how to generate one). Never commit that file.

const fs = require('fs');
const path = require('path');

const KEY_PATH = path.join(__dirname, 'service-account-key.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const BALANCE_FIELD = 'strubles_balance_v1'; // same field name as the localStorage key it mirrors -- see cloud-sync.js
const APPLIED_FLAG = 'currency_reform_v1_applied';
const BATCH_LIMIT = 500; // Firestore's own hard cap on ops per batch

const APPLY = process.argv.includes('--apply');

// The reform curve itself. Verified against the brief's own worked
// example: reformBalance(500000) = 40500 ("someone at 500,000 should
// land around 40,000").
//   0 - 10,000:  untouched (1:1) -- a normal player should feel nothing
//   10,000 - 50,000: every Struble above 10,000 becomes 1/5th
//   50,000+: every Struble above 50,000 becomes 1/20th
function reformBalance(balance) {
  if (balance <= 10000) return balance;
  if (balance <= 50000) return 10000 + (balance - 10000) / 5;
  return 18000 + (balance - 50000) / 20; // 18000 = 10000 + (50000-10000)/5, the value AT the 50,000 breakpoint
}

function loadServiceAccount() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(
      `\nMissing service-account-key.json in ${__dirname}\n` +
      `Firebase Console -> Project Settings -> Service Accounts -> Generate new private key,\n` +
      `save it as exactly that filename here. It's gitignored -- never commit it.\n`
    );
    process.exit(1);
  }
  return require(KEY_PATH);
}

function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

async function main() {
  const admin = require('firebase-admin');
  const serviceAccount = loadServiceAccount();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'iantopia', // matches public/cloud-sync.js's own firebaseConfig.projectId
  });
  const db = admin.firestore();

  console.log(APPLY ? '=== CURRENCY REFORM -- LIVE RUN ===' : '=== CURRENCY REFORM -- DRY RUN (no writes) ===');
  console.log('Fetching users collection...\n');

  const snapshot = await db.collection('users').get();

  const rows = []; // { uid, before, after, action }
  let skippedNoBalance = 0;
  let skippedAlreadyApplied = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data[APPLIED_FLAG] === true) {
      skippedAlreadyApplied++;
      return;
    }
    const raw = data[BALANCE_FIELD];
    if (raw === undefined) {
      // A doc that synced before ever touching Strubles is real and
      // possible (cloud-sync.js's snapshotLocalState() only writes keys
      // present in localStorage) -- not an error, just nothing to convert.
      skippedNoBalance++;
      return;
    }
    const before = Number(raw);
    if (!Number.isFinite(before)) {
      console.warn(`[skip] ${doc.id}: ${BALANCE_FIELD} is not a finite number (raw value: ${JSON.stringify(raw)})`);
      return;
    }
    const after = Math.round(reformBalance(before));
    rows.push({ uid: doc.id, before, after, changed: after !== before });
  });

  // ---------- Report (always printed, dry run or live) ----------
  const changed = rows.filter((r) => r.changed);
  const unchanged = rows.filter((r) => !r.changed);

  console.log(`Accounts scanned:        ${snapshot.size}`);
  console.log(`Already migrated:        ${skippedAlreadyApplied} (skipped)`);
  console.log(`No balance field yet:    ${skippedNoBalance} (skipped, nothing to convert)`);
  console.log(`At/under 10,000 (no-op): ${unchanged.length}`);
  console.log(`Will be converted:       ${changed.length}\n`);

  if (changed.length) {
    console.log('uid'.padEnd(30), 'before'.padStart(12), 'after'.padStart(12), 'removed'.padStart(12));
    changed
      .sort((a, b) => (b.before - a.before))
      .forEach((r) => {
        console.log(
          r.uid.padEnd(30),
          fmt(r.before).padStart(12),
          fmt(r.after).padStart(12),
          fmt(r.before - r.after).padStart(12)
        );
      });
    const totalRemoved = changed.reduce((s, r) => s + (r.before - r.after), 0);
    console.log(`\nTotal Strubles removed from the economy: ${fmt(totalRemoved)}`);
  }

  if (!APPLY) {
    console.log('\nDry run only -- nothing was written. Re-run with --apply to actually migrate.');
    return;
  }

  if (!changed.length) {
    console.log('\nNothing to apply -- no accounts need converting.');
    return;
  }

  // ---------- Backup, then write ----------
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `users-backup-${stamp}.json`);
  const fullBackup = {};
  snapshot.forEach((doc) => { fullBackup[doc.id] = doc.data(); });
  fs.writeFileSync(backupPath, JSON.stringify(fullBackup, null, 2));
  console.log(`\nBacked up ${snapshot.size} docs to ${backupPath}`);

  console.log(`\nWriting ${changed.length} updated balances in batches of ${BATCH_LIMIT}...`);
  for (let i = 0; i < changed.length; i += BATCH_LIMIT) {
    const chunk = changed.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((r) => {
      batch.update(db.collection('users').doc(r.uid), {
        [BALANCE_FIELD]: String(r.after), // stored as a string, matching every other synced field's localStorage-mirror shape
        [APPLIED_FLAG]: true,
      });
    });
    await batch.commit();
    console.log(`  committed ${Math.min(i + BATCH_LIMIT, changed.length)}/${changed.length}`);
  }

  // Also flag every untouched (at/under 10,000) account as applied, so a
  // later re-run treats the whole collection as done, not just the
  // accounts that actually changed value.
  if (unchanged.length) {
    for (let i = 0; i < unchanged.length; i += BATCH_LIMIT) {
      const chunk = unchanged.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      chunk.forEach((r) => {
        batch.update(db.collection('users').doc(r.uid), { [APPLIED_FLAG]: true });
      });
      await batch.commit();
    }
  }

  console.log('\nDone. Re-running this script now will report everything as already migrated.');
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});

// Firestore rules, run against the local emulator. Each block states one promise
// the rules make to a browser. Run with: npm test (from the emulator, see README).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const ADMIN = 'dirpysquid45@gmail.com';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'iantopia-rules-test',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const signedIn = (uid, extra = {}) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));

describe('own save data', () => {
  it('a player can create and read their own save', async () => {
    const alice = signedIn('alice');
    await assertSucceeds(setDoc(doc(alice, 'users/alice'), { tycoon: { b: [] } }));
    await assertSucceeds(getDoc(doc(alice, 'users/alice')));
  });

  it('nobody can read another player\'s save', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice'), { tycoon: {} }));
    await assertFails(getDoc(doc(signedIn('bob'), 'users/alice')));
  });

  it('a browser cannot write server-owned wallet fields', async () => {
    await assertFails(setDoc(doc(signedIn('alice'), 'users/alice'), { strubles_balance_v1: 999999 }));
  });

  it('a banned player cannot write their save', async () => {
    await seed((db) => setDoc(doc(db, 'bans/alice'), { until: new Date(Date.now() + 3600e3) }));
    await assertFails(setDoc(doc(signedIn('alice'), 'users/alice'), { tycoon: {} }));
  });
});

describe('public leaderboard', () => {
  const row = { gdp: 120, efficiency: 6.5, buildings: 4, population: 12, displayName: 'Alice' };

  it('the owner can post a plausible row', async () => {
    await assertSucceeds(setDoc(doc(signedIn('alice'), 'leaderboard/alice'), row));
  });

  it('a row with negative GDP is refused', async () => {
    await assertFails(setDoc(doc(signedIn('alice'), 'leaderboard/alice'), { ...row, gdp: -1 }));
  });

  it('a row with an absurd building count is refused', async () => {
    await assertFails(setDoc(doc(signedIn('alice'), 'leaderboard/alice'), { ...row, buildings: 5000 }));
  });

  it('nobody can post someone else\'s row', async () => {
    await assertFails(setDoc(doc(signedIn('bob'), 'leaderboard/alice'), row));
  });

  it('anyone, signed out included, can read the board', async () => {
    await seed((db) => setDoc(doc(db, 'leaderboard/alice'), row));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'leaderboard/alice')));
  });
});

describe('village visits', () => {
  it('a village is hidden from visitors until its owner opts in', async () => {
    await seed((db) => setDoc(doc(db, 'village_snapshots/alice'), { visitable: false, b: [] }));
    await assertFails(getDoc(doc(signedIn('bob'), 'village_snapshots/alice')));
  });

  it('a visitable village can be read by a signed-in visitor', async () => {
    await seed((db) => setDoc(doc(db, 'village_snapshots/alice'), { visitable: true, b: [] }));
    await assertSucceeds(getDoc(doc(signedIn('bob'), 'village_snapshots/alice')));
  });

  it('the owner can always read their own village', async () => {
    await seed((db) => setDoc(doc(db, 'village_snapshots/alice'), { visitable: false, b: [] }));
    await assertSucceeds(getDoc(doc(signedIn('alice'), 'village_snapshots/alice')));
  });

  it('only the owner can publish a village', async () => {
    await assertFails(setDoc(doc(signedIn('bob'), 'village_snapshots/alice'), { visitable: true }));
    await assertSucceeds(setDoc(doc(signedIn('alice'), 'village_snapshots/alice'), { visitable: true }));
  });

  it('each player can like a village once, as themselves', async () => {
    await assertSucceeds(setDoc(doc(signedIn('bob'), 'village_snapshots/alice/likes/bob'), { at: 1 }));
    await assertFails(setDoc(doc(signedIn('carol'), 'village_snapshots/alice/likes/bob'), { at: 1 }));
  });

  it('gifts are never written from the browser', async () => {
    await assertFails(setDoc(doc(signedIn('bob'), 'village_snapshots/alice/gifts/g1'), { amount: 1000 }));
  });
});

describe('the economy tracker', () => {

  it('the admin with a verified email can read the daily snapshots', async () => {
    await seed((db) => setDoc(doc(db, 'economy_daily/2026-11-11'), { total: 5 }));
    await assertSucceeds(getDoc(doc(signedIn('admin', { email: ADMIN }), 'economy_daily/2026-11-11')));
  });

  it('the admin address without a verified email is refused', async () => {
    await seed((db) => setDoc(doc(db, 'economy_daily/2026-11-11'), { total: 5 }));
    const unverified = env.authenticatedContext('admin', { email: ADMIN, email_verified: false }).firestore();
    await assertFails(getDoc(doc(unverified, 'economy_daily/2026-11-11')));
  });

  it('any other signed-in player is refused', async () => {
    await seed((db) => setDoc(doc(db, 'economy_daily/2026-11-11'), { total: 5 }));
    await assertFails(getDoc(doc(signedIn('bob'), 'economy_daily/2026-11-11')));
  });

  it('nobody can write the daily snapshots from the browser', async () => {
    await assertFails(setDoc(doc(signedIn('admin', { email: ADMIN }), 'economy_daily/2026-11-12'), { total: 1 }));
  });
});

describe('chat, bans and everything else', () => {
  it('signed-in players can read chat but not write it', async () => {
    await seed((db) => setDoc(doc(db, 'chat_messages/m1'), { text: 'hi' }));
    await assertSucceeds(getDoc(doc(signedIn('bob'), 'chat_messages/m1')));
    await assertFails(setDoc(doc(signedIn('bob'), 'chat_messages/m2'), { text: 'hello' }));
  });

  it('signed-out visitors cannot read chat', async () => {
    await seed((db) => setDoc(doc(db, 'chat_messages/m1'), { text: 'hi' }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'chat_messages/m1')));
  });

  it('bans are never readable from the browser', async () => {
    await seed((db) => setDoc(doc(db, 'bans/alice'), { until: new Date(Date.now() + 3600e3) }));
    await assertFails(getDoc(doc(signedIn('alice'), 'bans/alice')));
  });

  it('an unlisted collection is closed by default', async () => {
    await assertFails(setDoc(doc(signedIn('alice'), 'anything/else'), { x: 1 }));
    await assertFails(getDocs(collection(signedIn('alice'), 'anything')));
  });
});

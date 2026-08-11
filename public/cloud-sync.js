// cloud-sync.js
// Google Sign-In (via Firebase Auth) + cross-device progress sync (via
// Firestore). Everything the site tracks already lives in localStorage —
// this module's only job is mirroring a known set of localStorage keys to
// a per-user Firestore document, keyed by the signed-in Firebase UID.
//
// Firestore security rules restrict a document at /users/{uid} to reads
// and writes from that exact uid only — see the rules published in the
// Firebase console. Client config below is public by design (protected by
// those rules, not by secrecy) — see Firebase's own docs on this.
//
// Exposes window.CloudSync = { signIn, signOut, currentUser, isSignedIn }.
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyDHV58VVMfzLgmV8AUebaiTN76JYau9DMg",
    authDomain: "iantopia.firebaseapp.com",
    projectId: "iantopia",
    storageBucket: "iantopia.firebasestorage.app",
    messagingSenderId: "236083814537",
    appId: "1:236083814537:web:c3933ca3f2808103472658",
  };

  // Every localStorage key that represents real progress — inventory,
  // currency, unlocks, cosmetic picks, desktop layout. Deliberately
  // excludes device-local preferences that shouldn't follow you across
  // machines: music_volume_v1 (speaker/headphone level) and the
  // *_theme_pos_v1 keys (exact mid-track playback position).
  const SYNC_KEYS = [
    'strubles_inventory_v1',
    'strubles_balance_v1',
    'strubles_cases_v1',
    'strubles_case_history_v1',
    'strubles_case_stats_v1',
    'strubles_unlocks_v1',
    'strubles_flags_v1',
    'strubles_last_daily_utc_v1',
    'strubles_starter_claimed_v1',
    'desktop_items_v1',
    'desktop_items_seen_v1',
    'active_cursor_v1',
    'active_bg_v1',
    'home_active_bg_v1',
    'active_track_v1',
    'home_active_track_v1',
    'lootbox_active_track_v1',
  ];

  const SYNC_EVENTS = [
    'strubles:change', 'inventory:changed', 'cases:changed',
    'music:unlocked', 'background:unlocked', 'cursor:unlocked', 'cursor:changed',
  ];

  const PERIODIC_SYNC_MS = 15000;
  const PUSH_DEBOUNCE_MS = 1200;

  if (!window.firebase) {
    console.error('[cloud-sync] Firebase SDK not loaded — check script order.');
    return;
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let currentUser = null;
  let applyingRemote = false; // guards against syncing our own just-applied data straight back up
  let pushTimer = null;

  function snapshotLocalState() {
    const snapshot = {};
    SYNC_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    });
    return snapshot;
  }

  function applyRemoteState(data) {
    applyingRemote = true;
    SYNC_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        localStorage.setItem(key, data[key]);
      }
    });
    // Every page reads its state once at load time into JS variables/
    // closures — there's no live-update path for a bulk external change
    // like this, so a reload is the correct way to apply it, matching how
    // the rest of the app already treats localStorage as load-time truth.
    window.location.reload();
  }

  async function pullFromCloud(uid) {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      applyRemoteState(doc.data());
    } else {
      // First-ever sign-in: don't wipe out progress the user already built
      // up anonymously — that becomes their first cloud save instead.
      await db.collection('users').doc(uid).set(snapshotLocalState());
    }
  }

  function pushToCloud() {
    if (!currentUser || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      db.collection('users').doc(currentUser.uid).set(snapshotLocalState(), { merge: true }).catch((err) => {
        console.error('[cloud-sync] push failed:', err);
      });
    }, PUSH_DEBOUNCE_MS);
  }

  SYNC_EVENTS.forEach((name) => window.addEventListener(name, pushToCloud));
  // Safety net for state changes that don't dispatch a custom event (e.g.
  // dragging a desktop item, picking an active track/background) — a
  // period sync plus flushing on tab-hide/unload catches everything else
  // without needing to touch every individual write site.
  window.addEventListener('storage', pushToCloud);
  setInterval(pushToCloud, PERIODIC_SYNC_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pushToCloud();
  });
  window.addEventListener('beforeunload', pushToCloud);

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    // The reload inside applyRemoteState() re-enters this same handler on
    // the next load; clearing the flag here (post-reload) lets normal
    // pushes resume rather than staying permanently suppressed.
    applyingRemote = false;
    window.dispatchEvent(new CustomEvent('cloudsync:authchanged', { detail: { user } }));
    if (user) pullFromCloud(user.uid);
  });

  window.CloudSync = {
    get currentUser() { return currentUser; },
    isSignedIn: () => !!currentUser,
    signIn: () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()),
    signOut: () => auth.signOut(),
  };
})();

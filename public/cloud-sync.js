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
    // Same-origin with iantopia.com by design — see the /__/auth proxy in
    // youtube-transcript-app/nginx.conf. Mobile browsers (Safari ITP,
    // increasingly others) block the third-party storage access the
    // popup/redirect handshake depends on when authDomain is a different
    // origin (iantopia.firebaseapp.com), which manifested as unexpected
    // reload/navigation behavior after sign-in on mobile. Per Firebase's
    // own docs: https://firebase.google.com/docs/auth/web/redirect-best-practices
    authDomain: "iantopia.com",
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
    'tycoon_grid_v1',
    'tycoon_last_seen_v1',
  ];

  // pickers.js (blackjack/alternate-ending/minesweeper/inventory) derives its
  // background/track keys per-page as `active_bg_v1__<pathname>` and
  // `active_track_v1__<pathname>` — an open-ended set no static list can
  // enumerate. Anything starting with one of these prefixes syncs too, on
  // top of the exact names above.
  const SYNC_KEY_PREFIXES = ['active_bg_v1__', 'active_track_v1__'];
  function allSyncKeys() {
    const dynamic = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && SYNC_KEY_PREFIXES.some((p) => k.startsWith(p))) dynamic.push(k);
    }
    return SYNC_KEYS.concat(dynamic);
  }

  const SYNC_EVENTS = [
    'strubles:change', 'inventory:changed', 'cases:changed',
    'music:unlocked', 'background:unlocked', 'cursor:unlocked', 'cursor:changed',
    // Actually picking a background/track/desktop-item placement never
    // dispatched anything these listeners recognized — cursor picks were
    // the only ones wired up correctly. Those three changes were only ever
    // reaching the cloud via the 15s periodic sync or the beforeunload/
    // visibilitychange handlers, both of which can lose the write entirely
    // on a fast navigation (an async Firestore call started that late has
    // no guarantee of finishing before the page actually tears down). This
    // is the real cause behind "I picked X, left, came back, it reset."
    'active-background:changed', 'active-track:changed', 'desktop-items:changed',
    'tycoon:changed', 'building:unlocked',
  ];

  // Firebase persists the signed-in session, so onAuthStateChanged fires on
  // EVERY page load, not just right after a real sign-in — and since
  // cloud-sync.js now loads on every page (previously home only), that
  // meant every single navigation between pages ran its own async
  // Firestore read, and reloaded the page a SECOND time the instant that
  // read found any byte-level difference from local (including a diff
  // where local was actually the newer, correct copy — e.g. you dragged an
  // item, navigated before the 400ms debounced push finished writing, and
  // the still-stale remote doc clobbered your fresh local change on
  // arrival). That's what read as "laggy" (a full extra load+reload on
  // every navigation) and "reverts when I come back" at once.
  // RECONCILE_KEY caps the reconcile-with-cloud pull to once per tab
  // session (sessionStorage, not localStorage — a fresh tab/device still
  // pulls once to pick up progress made elsewhere) instead of once per
  // page load, so navigating around the site while signed in trusts the
  // already-reconciled local state instead of re-fetching and potentially
  // re-reloading on every single page.
  const RECONCILE_KEY = 'cloudsync_reconciled_v1';
  const PERIODIC_SYNC_MS = 15000;
  // Short enough that a deliberate pick (background/track/cursor/item) is
  // on the wire well before a realistic click-then-navigate sequence
  // completes, long enough to still coalesce genuinely rapid-fire writes
  // (e.g. every mousemove tick while dragging a desktop item).
  const PUSH_DEBOUNCE_MS = 400;

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

  function isSyncKey(key) {
    return SYNC_KEYS.includes(key) || SYNC_KEY_PREFIXES.some((p) => key.startsWith(p));
  }

  function snapshotLocalState() {
    const snapshot = {};
    allSyncKeys().forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    });
    return snapshot;
  }

  function applyRemoteState(data) {
    const local = snapshotLocalState();
    // Walks the REMOTE document's own keys (filtered to sync-eligible ones),
    // not just ones already present locally — a per-page key like
    // active_bg_v1__/inventory synced from another device wouldn't exist in
    // this browser's localStorage yet, so scanning local keys alone would
    // silently never pull it down.
    const remoteKeys = Object.keys(data).filter(isSyncKey);
    const changed = remoteKeys.some((key) => data[key] !== local[key]);
    // onAuthStateChanged re-fires on every page load for a persisted
    // session, not just right after sign-in — without this check we'd
    // reload every single load forever, since the remote doc always
    // "exists" once a first sync has happened.
    if (!changed) return;

    applyingRemote = true;
    remoteKeys.forEach((key) => {
      localStorage.setItem(key, data[key]);
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

  // immediate=true bypasses the debounce entirely. This matters: a
  // debounced write scheduled via setTimeout is destroyed along with the
  // rest of the page's JS context on navigation, so a normal debounced
  // pushToCloud() call from beforeunload/visibilitychange never actually
  // fires — it just reschedules a timer for a page that's about to be
  // gone. The bug this caused: change a background, navigate away inside
  // the debounce window, and the push is silently lost; the next sign-in
  // pull then overwrites the fresh local choice with the stale cloud one.
  function pushToCloud(immediate) {
    if (!currentUser || applyingRemote) return;
    clearTimeout(pushTimer);
    const doPush = () => {
      db.collection('users').doc(currentUser.uid).set(snapshotLocalState(), { merge: true }).catch((err) => {
        console.error('[cloud-sync] push failed:', err);
      });
    };
    if (immediate) { doPush(); return; }
    pushTimer = setTimeout(doPush, PUSH_DEBOUNCE_MS);
  }

  SYNC_EVENTS.forEach((name) => window.addEventListener(name, () => pushToCloud(false)));
  // Safety net for state changes that don't dispatch a custom event (e.g.
  // dragging a desktop item, picking an active track/background) — a
  // periodic sync catches everything else without needing to touch every
  // individual write site. tab-hide/unload push immediately (see above).
  window.addEventListener('storage', () => pushToCloud(false));
  setInterval(() => pushToCloud(false), PERIODIC_SYNC_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pushToCloud(true);
  });
  window.addEventListener('beforeunload', () => pushToCloud(true));

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    // The reload inside applyRemoteState() re-enters this same handler on
    // the next load; clearing the flag here (post-reload) lets normal
    // pushes resume rather than staying permanently suppressed.
    applyingRemote = false;
    window.dispatchEvent(new CustomEvent('cloudsync:authchanged', { detail: { user } }));
    // Set BEFORE the pull, not after — applyRemoteState()'s reload re-enters
    // this same handler on the next load, and the flag has to already be
    // set by then or it'd pull-and-potentially-reload every time forever.
    if (user && !sessionStorage.getItem(RECONCILE_KEY)) {
      try { sessionStorage.setItem(RECONCILE_KEY, '1'); } catch {}
      pullFromCloud(user.uid);
    }
  });

  window.CloudSync = {
    get currentUser() { return currentUser; },
    isSignedIn: () => !!currentUser,
    signIn: () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()),
    signOut: () => auth.signOut(),
  };
})();

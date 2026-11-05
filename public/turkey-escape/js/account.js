// Links Turkey Escape to the Iantopia account: Google sign-in, the turkey cursor for a pardon, and
// corn converted to Strubles. It runs on the Iantopia site, so it uses the same Firebase project and
// arena connection as the homepage. Exposes window.TurkeyAccount.
(function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDHV58VVMfzLgmV8AUebaiTN76JYau9DMg",
    authDomain: "iantopia.com",
    projectId: "iantopia",
    storageBucket: "iantopia.firebasestorage.app",
    messagingSenderId: "236083814537",
    appId: "1:236083814537:web:c3933ca3f2808103472658",
  };
  const ANSWER_MS = 8000;

  let arena = null;
  let ready = false;
  let waiting = null;
  const queue = [];

  function auth() {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.auth();
  }

  function signedIn() {
    return !!auth().currentUser;
  }

  function flush() {
    while (ready && queue.length) arena.send(queue.shift());
  }

  function settle(ok, data) {
    if (!waiting) return;
    waiting(ok, data);
  }

  function connect() {
    if (arena) return arena;
    arena = ArenaClient.create({
      game: "turkey",
      canSwitchIdentity: () => false,
      onMessage: (msg) => {
        if (msg.type === "auth_ok") {
          ready = true;
          flush();
        } else if (msg.type === "turkey_claimed" || msg.type === "turkey_converted") {
          settle(true, msg);
        } else if (msg.type === "error" && msg.code === "turkey") {
          settle(false, msg.message);
        }
      },
    });
    arena.connect();
    return arena;
  }

  // Asks the server, and waits for its answer. Rejects if there is no answer in time.
  function request(message) {
    connect();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting = null;
        reject(new Error("The server didn't answer. Try again."));
      }, ANSWER_MS);
      waiting = (ok, data) => {
        clearTimeout(timer);
        waiting = null;
        ok ? resolve(data) : reject(new Error(data));
      };
      queue.push(message);
      flush();
    });
  }

  async function signIn() {
    await auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
    // Reconnect as the signed-in player, so the server knows whose account to change.
    ready = false;
    if (arena) arena.reconnect();
    else connect();
    return auth().currentUser;
  }

  async function ensureSignedIn() {
    if (!signedIn()) await signIn();
  }

  window.TurkeyAccount = {
    signedIn,
    signIn,
    async claimCursor() {
      await ensureSignedIn();
      return request({ type: "turkey_claim" });
    },
    async convertCorn(corn) {
      await ensureSignedIn();
      return request({ type: "turkey_convert", corn });
    },
  };
})();

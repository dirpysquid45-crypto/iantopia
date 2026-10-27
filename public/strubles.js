// strubles.js: the site-wide Strubles balance.
//
// A signed-in player's balance lives on the server (arena-server/wallet.js). Pages
// keep calling Strubles.add / spend / get as before. Under the hood, each change
// is shown at once and queued, then sent to the server in order. The server's
// answer replaces the displayed number once the queue is empty. The Firestore
// rules refuse balance writes from the browser, so this copy can't be edited into
// the cloud save.
//
// A guest has no account, so their balance stays in this browser only. Guests
// can't stake, and they earn nothing that needs the server (Tetris pay, the daily
// prize).
window.IANTOPIA_IS_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
(function () {
  const KEY = 'strubles_balance_v1';
  const GAIN_KEY = 'strubles_last_gain_v1';
  const START = 100;
  const FLUSH_MS = 250;
  const MAX_BATCH = 50;

  // The wallet API: the same origin in production (nginx sends /arena-api/ to the
  // arena server), the arena's own port in local development.
  const API = location.protocol === 'https:'
    ? '/arena-api'
    : 'http://' + (location.hostname || 'localhost') + ':4001';

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function notify() {
    try { window.dispatchEvent(new CustomEvent('strubles:change', { detail: { balance: _load() } })); } catch {}
  }

  function _load() {
    const raw = safeGet(KEY);
    const num = Number(raw);
    if (raw === null || !Number.isFinite(num)) {
      safeSet(KEY, String(START));
      return START;
    }
    return num;
  }
  function _save(v) {
    const n = Math.max(0, Math.floor(Number(v)));
    safeSet(KEY, String(n));
    notify();
    return n;
  }

  // ---- account state --------------------------------------------------------
  // cloud-sync.js announces the sign-in state on every page load, guests included.
  const auth = { resolved: false };
  const claims = { starter: false, dailyToday: false };
  window.addEventListener('cloudsync:authchanged', () => {
    auth.resolved = true;
    if (signedIn()) { refresh(); schedule(); } else queue.length = 0;
  });
  function signedIn() { return !!(window.CloudSync && window.CloudSync.currentUser); }
  // A guest is known only once sign-in has been resolved and there is no user.
  function guest() { return auth.resolved && !signedIn(); }

  // ---- the server queue -----------------------------------------------------
  const queue = [];          // ops not yet confirmed by the server, in order
  const callbacks = {};      // op id -> function(result)
  let inFlight = false;
  let timer = null;
  let retryMs = 1000;

  function newId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function enqueue(op, cb) {
    if (guest()) return;             // guests have no server wallet
    queue.push(op);
    if (cb) callbacks[op.id] = cb;
    schedule();
  }

  function schedule() {
    if (inFlight || !signedIn() || !queue.length) return;
    clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_MS);
  }

  async function token() {
    return window.CloudSync.currentUser.getIdToken();
  }

  async function flush() {
    if (inFlight || !signedIn() || !queue.length) return;
    inFlight = true;
    const batch = queue.slice(0, MAX_BATCH);
    try {
      const res = await fetch(API + '/wallet/ops', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: batch }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400) {
        // The server refused the batch as malformed. Drop it so the queue can't stall.
        queue.splice(0, batch.length);
        batch.forEach((op) => { const cb = callbacks[op.id]; delete callbacks[op.id]; if (cb) cb({ id: op.id, ok: false, error: 'bad_request' }); });
      } else if (!res.ok) {
        throw new Error('wallet HTTP ' + res.status);
      } else {
        queue.splice(0, batch.length);
        (body.results || []).forEach((r) => {
          const cb = callbacks[r.id];
          delete callbacks[r.id];
          if (cb) cb(r);
          if (r.ok === false && r.error === 'insufficient') {
            window.dispatchEvent(new CustomEvent('strubles:refused', { detail: { id: r.id } }));
          }
        });
        if (!queue.length && typeof body.balance === 'number') _save(body.balance);
      }
      retryMs = 1000;
    } catch (e) {
      // Network or sign-in trouble: keep the queue and try again.
      retryMs = Math.min(retryMs * 2, 15000);
      setTimeout(flush, retryMs);
      inFlight = false;
      return;
    }
    inFlight = false;
    schedule();
  }

  // Reads the server's balance and claims. Runs on sign-in, and after a reset.
  async function refresh() {
    if (!signedIn()) return;
    try {
      const res = await fetch(API + '/wallet', { headers: { Authorization: 'Bearer ' + await token() } });
      if (!res.ok) return;
      const body = await res.json();
      claims.starter = !!body.starterClaimed;
      claims.dailyToday = !!body.dailyClaimedToday;
      if (!queue.length) _save(body.balance);
    } catch {}
  }

  // ---- guests -----------------------------------------------------------------
  // A guest's Strubles stay in this browser, so the caps below are applied here and
  // can be edited away by someone determined. Guests can't stake, and they get
  // a smaller Tetris pay and a local daily prize, with the same tiers as signed-in players.
  // PROVISIONAL numbers.
  const GUEST_TETRIS_RATE = 0.1;       // a tenth of the points
  const GUEST_TETRIS_PER_GAME = 15;
  const GUEST_TETRIS_PER_DAY = 60;
  const DAILY_TIERS = [[500, 50], [1000, 27], [2000, 15], [3500, 6], [5000, 2]];
  const GUEST_TETRIS_KEY = 'strubles_guest_tetris_v1';
  const GUEST_DAILY_KEY = 'strubles_guest_daily_v1';
  const todayUtc = () => new Date().toISOString().slice(0, 10);

  function guestTetris(points, cb) {
    let rec = null;
    try { rec = JSON.parse(safeGet(GUEST_TETRIS_KEY) || 'null'); } catch {}
    const paid = rec && rec.day === todayUtc() ? rec.paid : 0;
    const want = Math.min(Math.floor((Number(points) || 0) * GUEST_TETRIS_RATE), GUEST_TETRIS_PER_GAME, GUEST_TETRIS_PER_DAY - paid);
    const cap = (window.TycoonBank && window.TycoonBank.currentCap()) || Infinity;
    const cur = _load();
    const applied = Math.max(0, Math.min(want, cap - cur));
    if (applied > 0) _save(cur + applied);
    safeSet(GUEST_TETRIS_KEY, JSON.stringify({ day: todayUtc(), paid: paid + Math.max(0, want) }));
    if (cb) cb(applied);
  }

  function guestDailyOpen() { return safeGet(GUEST_DAILY_KEY) !== todayUtc(); }
  function guestDaily(cb) {
    if (!guestDailyOpen()) { if (cb) cb(null); return false; }
    let r = Math.random() * 100;
    let amount = DAILY_TIERS[0][0];
    for (const [amt, weight] of DAILY_TIERS) { if (r < weight) { amount = amt; break; } r -= weight; }
    safeSet(GUEST_DAILY_KEY, todayUtc());
    api.add(amount);
    if (cb) cb(amount);
    return true;
  }

  // Tells the player when a win was only partly credited, because the wallet cap or a
  // daily income limit clipped it. Shown as a short note, and as an event for pages.
  function noteCapped(asked, credited) {
    if (!(asked > credited)) return;
    try { window.dispatchEvent(new CustomEvent('strubles:capped', { detail: { asked, credited } })); } catch {}
    try {
      let el = document.getElementById('strubles-capped-note');
      if (!el) {
        el = document.createElement('div');
        el.id = 'strubles-capped-note';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;background:#000;color:#ffd700;border:2px solid #ffd700;padding:10px 14px;font:12px ui-monospace,monospace;max-width:90vw;text-align:center;pointer-events:none';
        document.body.appendChild(el);
      }
      el.textContent = `Only ${credited} of ${asked} Strubles were credited (a limit was reached).`;
      el.style.display = 'block';
      clearTimeout(noteCapped.timer);
      noteCapped.timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
    } catch {}
  }

  // ---- the public API -------------------------------------------------------
  const api = {
    version: '3.0.0',
    get() { return _load(); },

    // kind: 'refund' when money is paid back for something already paid (a duplicate,
    // a removed building, an undone purchase). The server doesn't cap refunds, and the
    // account watch doesn't count them as wins.
    // source: where income comes from (tycoon, horse, solitaire, lootbox). The server caps
    // each source per day.
    add(n, kind, source) {
      const cur = _load();
      const cap = (window.TycoonBank && window.TycoonBank.currentCap()) || Infinity;
      const amount = Math.max(0, Math.floor(Number(n) || 0));
      if (amount === 0) return cur;
      // A guest's balance is final here. A signed-in player's is corrected when the server answers.
      const credited = cur >= cap ? 0 : Math.min(amount, cap - cur);
      const next = _save(cur + credited);
      if (guest()) noteCapped(amount, credited);
      enqueue({ id: newId(), kind: kind === 'refund' ? 'refund' : 'win', amount, source: source || 'other', page: location.pathname },
        (r) => { if (r.ok && !r.duplicate) noteCapped(amount, r.applied); });
      return next;
    },

    // A solo-game bet. Spends the amount and returns the round id to settle later. Pass
    // the same round to add another stake to it (a double-down, a split). Returns null
    // if the balance can not cover it.
    stake(game, n, round) {
      const need = Math.max(0, Math.floor(Number(n || 0)));
      const bal = _load();
      if (need > bal) return null;
      const rid = round || newId();
      _save(bal - need);
      enqueue({ id: newId(), kind: 'stake', game, round: rid, amount: need, page: location.pathname });
      return rid;
    },

    // The result of a round: what it pays back (0 for a loss). Closes the round.
    settle(game, round, n) {
      if (!round) return;
      const amount = Math.max(0, Math.floor(Number(n) || 0));
      if (guest()) {
        const cur = _load();
        const cap = (window.TycoonBank && window.TycoonBank.currentCap()) || Infinity;
        const credited = cur >= cap ? 0 : Math.min(amount, cap - cur);
        if (amount > 0) _save(cur + credited);
        noteCapped(amount, credited);
        return;
      }
      enqueue({ id: newId(), kind: 'settle', game, round, amount, page: location.pathname },
        (r) => { if (r.ok && !r.duplicate) noteCapped(amount, r.applied); });
    },

    // False if the balance is too small. The server checks again and refuses a spend
    // it can't cover (see the strubles:refused event).
    spend(n) {
      const need = Math.max(0, Math.floor(Number(n || 0)));
      const bal = _load();
      if (need > bal) return false;
      _save(bal - need);
      enqueue({ id: newId(), kind: 'spend', amount: need });
      return true;
    },

    // Shows a balance the arena server has just reported (arena pages get these
    // after a stake or a payout). The server is the authority for it.
    setFromServer(v) { return _save(v); },

    // Tetris pay. The server caps it per game and per day. cb(applied) is called
    // when the server answers (0 for guests).
    tetris(points, cb) {
      if (guest()) { guestTetris(points, cb); return; }
      enqueue({ id: newId(), kind: 'tetris', points: Math.max(0, Number(points) || 0), page: location.pathname }, (r) => {
        if (r.ok && r.applied) _save(r.balance);
        if (cb) cb(r.ok ? r.applied : 0);
      });
    },

    // The daily prize. The server rolls the amount. cb(amount) gets it, or null if refused.
    dailyClaim(cb) {
      if (guest()) return guestDaily(cb);
      if (claims.dailyToday) { if (cb) cb(null); return false; }
      claims.dailyToday = true;
      enqueue({ id: newId(), kind: 'daily' }, (r) => {
        if (r.ok) { if (r.balance !== undefined) _save(r.balance); if (cb) cb(r.rolled); }
        else { claims.dailyToday = r.error === 'already_claimed'; if (cb) cb(null); }
      });
      return true;
    },
    canDailyClaim() { return guest() ? guestDailyOpen() : !claims.dailyToday; },

    // The starter grant, once per account. cb(applied) when the server answers.
    claimStarter(cb) {
      if (guest() || claims.starter) { if (cb) cb(0); return false; }
      claims.starter = true;
      enqueue({ id: newId(), kind: 'starter' }, (r) => {
        if (r.ok && r.balance !== undefined) _save(r.balance);
        if (cb) cb(r.ok ? r.applied : 0);
      });
      return true;
    },

    refresh,
  };

  // Dev-only helpers, for testing on a local machine. In production the balance can
  // only be changed through the wallet above.
  if (window.IANTOPIA_IS_DEV) {
    api.set = (v) => _save(v);
    api.reset = (v = START) => _save(v);
  }

  window.Strubles = Object.assign(window.Strubles || {}, api);
})();

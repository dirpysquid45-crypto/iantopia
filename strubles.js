// strubles.js — site-wide currency helper (persistent via localStorage)
(function () {
  const KEY = "strubles_balance_v1";
  const START = 100; // starting bankroll

  function safeGet(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  function safeSet(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  }
  function notify() {
    try {
      const ev = new CustomEvent("strubles:change", { detail: { balance: _load() } });
      window.dispatchEvent(ev);
    } catch {}
  }

  // Load (and persist START on first run)
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

  // Core API
  const api = {
    version: "2.0.0",
    get()  { return _load(); },
    set(v) { return _save(v); },
    add(n) { return _save(_load() + Number(n || 0)); },
    spend(n) {
      const need = Math.max(0, Math.floor(Number(n || 0)));
      const bal = _load();
      if (need > bal) return false;
      _save(bal - need);
      return true;
    },
    // Dev/utility
    reset(v = START) { return _save(v); },
  };

  // Expose
  window.Strubles = Object.assign(window.Strubles || {}, api);
})();

// ----- Earn helpers (starter + daily) -----
(function () {
  const STARTER_KEY = "strubles_starter_claimed_v1";
  const DAILY_KEY   = "strubles_last_daily_utc_v1";

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k,v){ try { localStorage.setItem(k,v); } catch {} }

  function todayUTC() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  // Starter: one-time grant
  function canClaimStarter() {
    return !safeGet(STARTER_KEY);
  }
  function claimStarter(amount = 100) {
    if (!canClaimStarter()) return false;
    Strubles.add(amount);
    safeSet(STARTER_KEY, '1');
    return true;
  }

  // Daily: once per UTC day
  function canDailyClaim() {
    return safeGet(DAILY_KEY) !== todayUTC();
  }
  function dailyClaim(amount = 500) {
    if (!canDailyClaim()) return false;
    Strubles.add(amount);
    safeSet(DAILY_KEY, todayUTC());
    return true;
  }

  // Optional helpers
  function ensureMin(min = 0) {
    if (Strubles.get() < min) Strubles.set(min);
    return Strubles.get();
  }
  function timeToNextDaily() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    return Math.max(0, next.getTime() - now.getTime());
  }

  // Expose
  Object.assign(Strubles, {
    canClaimStarter,
    claimStarter,
    canDailyClaim,
    dailyClaim,
    ensureMin,
    timeToNextDaily
  });
})();

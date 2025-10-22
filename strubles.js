(function () {
  const KEY = "strubles_balance_v1";
  const START = 100; // starting amount

  function _load() {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) ? v : START;
  }
  function _save(v) {
    localStorage.setItem(KEY, String(Math.max(0, Math.floor(v))));
  }

  window.Strubles = {
    get() { return _load(); },
    set(v) { _save(v); return _load(); },
    add(n) { const v = _load() + n; _save(v); return v; },
    spend(n) { const bal = _load(); if (n > bal) return false; _save(bal - n); return true; }
  };
})();

// ----- Earn helpers (starter + daily) -----
(function () {
  const STARTER_KEY = "strubles_starter_claimed_v1";
  const DAILY_KEY   = "strubles_last_daily_utc_v1";

  function todayUTC() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  // Can claim starter? (never claimed)
  function canClaimStarter() {
    return !localStorage.getItem(STARTER_KEY);
  }
  function claimStarter(amount = 100) {
    if (!canClaimStarter()) return false;
    Strubles.add(amount);
    localStorage.setItem(STARTER_KEY, '1');
    return true;
  }

  // Can claim daily today?
  function canDailyClaim() {
    return localStorage.getItem(DAILY_KEY) !== todayUTC();
  }
  function dailyClaim(amount = 500) {
    if (!canDailyClaim()) return false;
    Strubles.add(amount);
    localStorage.setItem(DAILY_KEY, todayUTC());
    return true;
  }

  // Optional: ensure a minimum bankroll (useful for testing)
  function ensureMin(min = 0) {
    if (Strubles.get() < min) Strubles.set(min);
    return Strubles.get();
  }

  // Expose
  window.Strubles.canClaimStarter = canClaimStarter;
  window.Strubles.claimStarter    = claimStarter;
  window.Strubles.canDailyClaim   = canDailyClaim;
  window.Strubles.dailyClaim      = dailyClaim;
  window.Strubles.ensureMin       = ensureMin;
})();

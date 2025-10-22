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

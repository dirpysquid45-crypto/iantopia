// game-stats.js
// One small stats ledger for the whole site, kept per player in localStorage
// ("iantopia_stats_v1") and synced to their account by cloud-sync.js like the
// rest of their progress. It records:
//   * games:  per game, how many were played / won / lost / tied, Strubles won or lost
//   * visits: how many times each page has been opened (traffic, for this player)
// The credits page (/alternate-ending) reads it back. Loaded on every page; the
// page-visit counter runs the moment it loads.
window.GameStats = (function () {
  const KEY = 'iantopia_stats_v1';

  function empty() { return { v: 1, firstSeen: 0, games: {}, visits: {} }; }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') return Object.assign(empty(), s, { games: s.games || {}, visits: s.visits || {} });
    } catch {}
    return empty();
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { return; }
    try { window.dispatchEvent(new Event('stats:changed')); } catch {}
  }

  // outcome: 'win' | 'loss' | 'push' | 'run'.  extra: { net, score, friendly }.
  // Friendly (0 Strubles) multiplayer games count as games, but move no money.
  function record(game, outcome, extra) {
    extra = extra || {};
    const s = load();
    const g = s.games[game] || (s.games[game] = { played: 0, won: 0, lost: 0, pushed: 0, net: 0, best: 0, total: 0, friendly: 0 });
    g.played++;
    if (outcome === 'win') g.won++;
    else if (outcome === 'loss') g.lost++;
    else if (outcome === 'push') g.pushed++;
    if (extra.friendly) g.friendly++;
    if (Number.isFinite(extra.net)) g.net += Math.round(extra.net);
    if (Number.isFinite(extra.score)) { g.total += extra.score; g.best = Math.max(g.best, extra.score); }
    save(s);
  }

  const SKIP = /^\/(admin-suggestions)/;
  function pagePath() {
    let p = (location.pathname || '/').toLowerCase().replace(/\/index\.html$/, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }
  function visit() {
    const p = pagePath();
    if (SKIP.test(p)) return;
    const s = load();
    if (!s.firstSeen) s.firstSeen = Date.now();
    s.visits[p] = (s.visits[p] || 0) + 1;
    save(s);
  }

  // Combine two copies of the ledger (this device's and the cloud's) without ever
  // losing a count: every counter takes the larger value. Used by cloud-sync.js.
  function mergeJSON(a, b) {
    let A, B;
    try { A = JSON.parse(a); } catch {}
    try { B = JSON.parse(b); } catch {}
    if (!A || !B) return b || a || null;
    const out = empty();
    out.firstSeen = [A.firstSeen, B.firstSeen].filter(Boolean).sort((x, y) => x - y)[0] || 0;
    for (const src of [A, B]) {
      for (const [p, n] of Object.entries(src.visits || {})) out.visits[p] = Math.max(out.visits[p] || 0, n);
      for (const [name, g] of Object.entries(src.games || {})) {
        const o = out.games[name] || (out.games[name] = {});
        for (const [k, v] of Object.entries(g)) o[k] = (k === 'net') ? (Math.abs(v) > Math.abs(o[k] || 0) ? v : (o[k] || 0)) : Math.max(o[k] || 0, v);
      }
    }
    return JSON.stringify(out);
  }

  if (!window.__gameStatsVisited) { window.__gameStatsVisited = true; visit(); }
  return { KEY, load, record, visit, mergeJSON };
})();

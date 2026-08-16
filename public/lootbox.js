// lootbox.js — CS2-style case engine
//
// Two-step economy, like CS2: you BUY a case (it becomes an object you own),
// then you OPEN it. Buying and opening are separate so unopened cases can sit
// in your inventory and the opening animation has something to consume.
//
// Rolling is CS2's model, in this order:
//   1. Pick a rarity tier by its chance.
//   2. Pick uniformly among that case's items in that tier.
// Rarity is decided FIRST, so stuffing more items into a tier doesn't change
// how often that tier hits — only which item you get when it does.
//
// Requires case-data.js. Exposes window.IantopiaCase.
(function () {
  const INV_KEY     = 'strubles_inventory_v1';
  const FLAGS_KEY   = 'strubles_flags_v1';
  const UNLOCKS_KEY = 'strubles_unlocks_v1';
  const CASES_KEY   = 'strubles_cases_v1';
  const HISTORY_KEY = 'strubles_case_history_v1';
  const STATS_KEY   = 'strubles_case_stats_v1';
  // Always writes to the homepage's own keys, regardless of which page the
  // case was actually opened on — each page's music/bg choice is
  // independent, and the homepage is the canonical place to go check what
  // you just won (see the comment on AUTO_EQUIP below).
  const ACTIVE_TRACK_KEY  = 'home_active_track_v1';
  const ACTIVE_BG_KEY     = 'home_active_bg_v1';
  const ACTIVE_CURSOR_KEY = 'active_cursor_v1';

  // Winning a cosmetic equips it immediately. Granting it silently into the
  // inventory means you unbox a background, go to the homepage, still see the
  // old one, and reasonably conclude you were given the wrong item.
  const AUTO_EQUIP = {
    music_unlock: ACTIVE_TRACK_KEY,
    background_unlock: ACTIVE_BG_KEY,
    cursor_unlock: ACTIVE_CURSOR_KEY,
  };

  const HISTORY_MAX = 50;

  // Owned collectibles are filtered out of the roll pool before a case ever
  // opens (see isOwned/itemsInTier/rollItemId below) — a case will not hand
  // back something you already have. DUPLICATE_REFUND is a safety net for
  // the one case that can still reach applyItem's duplicate branch: a case
  // fully cleaned out (every collectible in it already owned), where
  // rollItemId's last-resort fallback has nothing left to fall back to.
  const DUPLICATE_REFUND = {
    mil_spec: 200,
    restricted: 750,
    classified: 2000,
    covert: 5000,
    exceedingly_rare: 25000,
  };

  const INV_BUCKETS = ['items', 'powerups', 'sfx', 'themes', 'badges', 'tracks', 'backgrounds', 'cursors', 'buildings'];

  // Buildings are the one type that isn't a simple own-it-once collectible —
  // a player can hold up to this many of the SAME building, so `buildings`
  // is allowed to contain duplicate keys (count of a key = how many owned),
  // unlike every other bucket where `.includes()` is the ownership check.
  const MAX_BUILDING_COPIES = (window.TYCOON_MAX_PER_TYPE) || 5;

  // Must hand back FRESH arrays every call. Returning a shared template and
  // letting callers push into it mutates the template itself, so every later
  // read starts pre-populated and real wins get misreported as duplicates.
  function emptyInv() {
    const inv = {};
    INV_BUCKETS.forEach((b) => { inv[b] = []; });
    return inv;
  }

  function loadJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  const dispatch = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {} };

  const state = {
    get inv() {
      const raw = loadJSON(INV_KEY, {}) || {};
      const inv = emptyInv();
      // Copy per-bucket rather than spreading, so a corrupted or non-array
      // bucket in saved state can't blow up the .includes()/.push() below.
      INV_BUCKETS.forEach((b) => { if (Array.isArray(raw[b])) inv[b] = raw[b].slice(); });
      return inv;
    },
    set inv(v)     { saveJSON(INV_KEY, v); dispatch('inventory:changed'); },
    get flags()    { return loadJSON(FLAGS_KEY, {}); },
    set flags(v)   { saveJSON(FLAGS_KEY, v); },
    get unlocks()  { const u = loadJSON(UNLOCKS_KEY, {}); return { pages: Array.isArray(u.pages) ? u.pages : [] }; },
    set unlocks(v) { saveJSON(UNLOCKS_KEY, v); },
    get cases()    { const c = loadJSON(CASES_KEY, {}); return (c && typeof c === 'object') ? c : {}; },
    set cases(v)   { saveJSON(CASES_KEY, v); dispatch('cases:changed'); },
  };

  // Which inventory bucket each unlock type collects into. Types not listed
  // here (strubles, action, unlock_page) aren't collections and are handled
  // individually in applyItem().
  const BUCKET = {
    item: 'items',
    badge: 'badges',
    powerup: 'powerups',
    sfx: 'sfx',
    theme: 'themes',
    music_unlock: 'tracks',
    background_unlock: 'backgrounds',
    cursor_unlock: 'cursors',
  };

  const MAILTO = {
    email_void: () => {
      const subject = encodeURIComponent('Iantopia speaks from the void');
      const body = encodeURIComponent('The void has nothing to say. It just wanted you to open your inbox.\n— Sent from iantopia.com');
      return `mailto:ian@example.com?subject=${subject}&body=${body}`;
    },
    email_finish: () => {
      const subject = encodeURIComponent('Finish Iantopia (Mythic Redemption)');
      const body = encodeURIComponent('I pulled the Covert: Email Ian to Finish Iantopia.\nPlease finish it. 🙏\n— Sent from iantopia.com');
      return `mailto:ian@example.com?subject=${subject}&body=${body}`;
    },
  };

  function getCaseDef(caseKey) {
    return (window.CASES && window.CASES[caseKey]) || null;
  }

  // Pagoda's flavor text: "increases chances of everything that is not a
  // common." Every owned Pagoda (up to the per-type ownership cap) shifts
  // 1 point off mil_spec's odds, redistributed across the other tiers
  // proportional to their existing weight — so owning the max moves that
  // same number of points off Common onto Uncommon/Rare/Epic/Legendary.
  // Scoped to whichever case declares
  // `pagodaBuff: true` (currently just Iantopia Lootbox Basic) rather than
  // hardcoding a case key here.
  const PAGODA_BUFF_PER_COPY = 1;
  function applyPagodaBuff(odds) {
    const pagodaCount = state.inv.buildings.filter((k) => k === 'pagoda').length;
    const shift = Math.min(pagodaCount, MAX_BUILDING_COPIES) * PAGODA_BUFF_PER_COPY;
    if (shift <= 0 || !odds.mil_spec || odds.mil_spec <= shift) return odds;
    const nonCommonTotal = 100 - odds.mil_spec;
    if (nonCommonTotal <= 0) return odds;
    const scale = (nonCommonTotal + shift) / nonCommonTotal;
    const out = { mil_spec: odds.mil_spec - shift };
    Object.keys(odds).forEach((tier) => {
      if (tier === 'mil_spec') return;
      out[tier] = odds[tier] * scale;
    });
    return out;
  }

  function oddsFor(def) {
    const base = def.odds || Object.fromEntries(Object.entries(window.CASE_RARITIES || {}).map(([k, v]) => [k, v.chance]));
    return def.pagodaBuff ? applyPagodaBuff(base) : base;
  }

  function pickTier(def) {
    const odds = oddsFor(def);
    const total = Object.values(odds).reduce((s, n) => s + n, 0);
    let r = Math.random() * total;
    for (const [tier, chance] of Object.entries(odds)) {
      if (chance <= 0) continue;
      r -= chance;
      if (r <= 0) return tier;
    }
    // Float drift only; fall back to the most common tier this case can roll.
    return Object.entries(odds).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Strubles and mailto actions aren't collectibles -- you can always win
  // more of either, so they're never "owned" for roll-filtering purposes.
  // Everything else (items, badges, themes, powerups, sfx, and every unlock
  // type) is a one-time collectible: once you have it, it comes out of your
  // own future rolls entirely, so a case can never hand back a duplicate.
  function isOwned(id, item) {
    if (item.type === 'strubles' || item.type === 'action') return false;
    if (item.type === 'unlock_page') {
      const pages = state.unlocks.pages;
      return Array.isArray(pages) && pages.includes(item.path);
    }
    const bucket = BUCKET[item.type];
    if (!bucket) return false;
    const inv = state.inv;
    const key = item.key || id;
    // Buildings aren't own-it-once — only "owned" (excluded from further
    // rolls) once you're holding the max copies of that specific building.
    if (item.type === 'building_unlock') {
      const count = Array.isArray(inv[bucket]) ? inv[bucket].filter((k) => k === key).length : 0;
      return count >= MAX_BUILDING_COPIES;
    }
    return Array.isArray(inv[bucket]) && inv[bucket].includes(key);
  }

  function itemsInTier(def, tier) {
    const I = window.CASE_ITEMS || {};
    return def.items.filter((id) => {
      const item = I[id];
      return item && item.tier === tier && !isOwned(id, item);
    });
  }

  // One roll: tier first, then uniform within the tier -- among whatever in
  // that tier you don't already own. Layered fallbacks so a player who has
  // cleaned out a tier (or an entire case) never gets stuck or gets handed
  // something owned; each step only widens the pool once the narrower one is
  // provably empty.
  function rollItemId(def) {
    const tier = pickTier(def);
    let pool = itemsInTier(def, tier);

    if (pool.length === 0) {
      // Tier maxed out. Borrow from every unowned item this case can give,
      // any tier, rather than ever falling back to something owned.
      pool = def.items.filter((id) => {
        const item = (window.CASE_ITEMS || {})[id];
        return item && !isOwned(id, item);
      });
    }

    if (pool.length === 0) {
      // Every collectible in this case is owned. Strubles/action items are
      // never "owned" (see isOwned), so this is the true completionist
      // fallback -- still gives something, never a duplicate.
      pool = def.items.filter((id) => {
        const item = (window.CASE_ITEMS || {})[id];
        return item && (item.type === 'strubles' || item.type === 'action');
      });
    }

    if (pool.length === 0) {
      // No currency/action items exist in this case's pool at all -- a data
      // problem validateCases() should already be warning about at load.
      // Recover rather than throw at open time.
      pool = def.items.filter((id) => (window.CASE_ITEMS || {})[id]);
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Filler tiles for the scrolling reel. Rolled with the same tier odds as a
  // real drop so the strip *looks* like the case's rarity distribution —
  // mostly blue with the occasional gold. Uniform filler would make every
  // spin look like a jackpot and spoil the tension.
  function buildReel(def, winnerId, length, winnerIndex) {
    const reel = [];
    for (let i = 0; i < length; i++) reel.push(rollItemId(def));
    reel[winnerIndex] = winnerId;
    return reel;
  }

  function applyItem(item, caseCost) {
    const inv = state.inv;
    const result = { duplicate: false, refund: 0, mailto: null, unlocked: false };

    switch (item.type) {
      case 'building_unlock': {
        const key = item.key || item.id;
        const count = inv.buildings.filter((k) => k === key).length;
        if (count >= MAX_BUILDING_COPIES) {
          // Maxed out on this building — refund rule is specific to
          // buildings (10% of what this case cost), not the flat
          // per-tier DUPLICATE_REFUND table every other type uses.
          result.duplicate = true;
          result.refund = Math.round((caseCost || 0) * 0.1);
          if (result.refund) Strubles.add(result.refund);
        } else {
          inv.buildings.push(key);
          state.inv = inv;
          dispatch('building:unlocked');
        }
        result.unlocked = true;
        return result; // refund already applied above — skip the generic tier-based refund below
      }

      case 'strubles': {
        Strubles.add(item.amount || 0);
        result.unlocked = true;
        break;
      }

      case 'unlock_page': {
        const allowed = Array.isArray(window.LOOTBOX_UNLOCKABLE_PAGES) ? window.LOOTBOX_UNLOCKABLE_PAGES : [];
        if (!item.path || !allowed.includes(item.path)) {
          // The page was never built, or was removed. Refuse rather than
          // handing the player a link that 404s, and be loud so whoever
          // added the item finds out immediately.
          console.warn(
            `[cases] item wants to unlock an unregistered page: ${item.path}. ` +
            `Build the page and add its path to LOOTBOX_UNLOCKABLE_PAGES before shipping this item.`
          );
          break;
        }
        const unlocks = state.unlocks;
        if (unlocks.pages.includes(item.path)) {
          result.duplicate = true;
        } else {
          unlocks.pages.push(item.path);
          state.unlocks = unlocks;
        }
        result.unlocked = true;
        break;
      }

      case 'action': {
        // Deliberately does NOT navigate. The old build fired window.location
        // straight to a mailto: on win, which would now yank the player out of
        // the page mid-reveal. The URL is handed to the UI instead, which
        // offers it as a button on the reveal card.
        const build = MAILTO[item.effect];
        result.mailto = build ? build() : null;
        result.unlocked = true;
        break;
      }

      default: {
        const bucket = BUCKET[item.type];
        if (!bucket) {
          console.warn(`[cases] unknown item type "${item.type}"; nothing granted.`);
          break;
        }
        const key = item.key || item.id;
        if (inv[bucket].includes(key)) {
          result.duplicate = true;
        } else {
          inv[bucket].push(key);
          state.inv = inv;

          // Equip whatever was just won. Music always did this; backgrounds and
          // cursors did not, so unboxing a background changed nothing visible
          // and looked like the wrong item had been granted.
          const activeKey = AUTO_EQUIP[item.type];
          if (activeKey) { try { localStorage.setItem(activeKey, key); } catch {} }

          if (item.type === 'music_unlock') dispatch('music:unlocked');
          if (item.type === 'background_unlock') dispatch('background:unlocked');
          if (item.type === 'cursor_unlock') dispatch('cursor:unlocked');
        }
        result.unlocked = true;
        break;
      }
    }

    if (result.duplicate) {
      result.refund = DUPLICATE_REFUND[item.tier] || 0;
      if (result.refund) Strubles.add(result.refund);
    }
    return result;
  }

  function pushHistory(entry) {
    const h = loadJSON(HISTORY_KEY, []);
    const list = Array.isArray(h) ? h : [];
    list.unshift(entry);
    saveJSON(HISTORY_KEY, list.slice(0, HISTORY_MAX));
  }

  // Lifetime totals. History is capped at HISTORY_MAX, so it cannot answer
  // "how many cases have I ever opened" — these counters only ever go up.
  function emptyStats() {
    return { opened: 0, spent: 0, refunded: 0, duplicates: 0, byTier: {}, best: null, firstOpenAt: null };
  }
  function getStats() {
    const s = loadJSON(STATS_KEY, null);
    return (s && typeof s === 'object') ? Object.assign(emptyStats(), s) : emptyStats();
  }
  function bumpStats(fn) {
    const s = getStats();
    fn(s);
    saveJSON(STATS_KEY, s);
  }
  function tierRank(tier) {
    const order = window.CASE_RARITY_ORDER || [];
    return order.indexOf(tier);
  }

  // --- Public API ---

  function buyCase(caseKey, qty = 1) {
    const def = getCaseDef(caseKey);
    if (!def) return { ok: false, message: 'Unknown case.' };
    const n = Math.max(1, Math.floor(qty));
    const total = def.cost * n;
    if (!Strubles.spend(total)) {
      return { ok: false, message: `Not enough Strubles (need ${total.toLocaleString()}).` };
    }
    const cases = state.cases;
    cases[caseKey] = (cases[caseKey] || 0) + n;
    state.cases = cases;
    bumpStats((s) => { s.spent += total; });
    return { ok: true, message: `Bought ${n} × ${def.label}.`, owned: cases[caseKey] };
  }

  function getCases() { return state.cases; }
  function getCaseCount(caseKey) { return state.cases[caseKey] || 0; }

  // Consumes one owned case and resolves the drop. The reel is returned with
  // the winner already placed so the UI only has to animate to winnerIndex.
  function openCase(caseKey, opts = {}) {
    const def = getCaseDef(caseKey);
    if (!def) return { ok: false, message: 'Unknown case.' };

    const cases = state.cases;
    if (!cases[caseKey]) return { ok: false, message: 'You don\'t own that case.' };

    const I = window.CASE_ITEMS || {};
    const winnerId = rollItemId(def);
    const item = I[winnerId];
    if (!item) return { ok: false, message: 'Case is misconfigured.' };

    // Consume only after the roll is known to be valid.
    cases[caseKey] -= 1;
    if (cases[caseKey] <= 0) delete cases[caseKey];
    state.cases = cases;

    const applied = applyItem(Object.assign({ id: winnerId }, item), def.cost);

    const reelLength = opts.reelLength || 60;
    const winnerIndex = opts.winnerIndex != null ? opts.winnerIndex : reelLength - 6;
    const reel = buildReel(def, winnerId, reelLength, winnerIndex);

    const rarity = (window.CASE_RARITIES || {})[item.tier] || { label: item.tier, color: '#fff' };

    const now = Date.now();
    pushHistory({ caseKey, itemId: winnerId, tier: item.tier, at: now });
    bumpStats((s) => {
      s.opened += 1;
      s.byTier[item.tier] = (s.byTier[item.tier] || 0) + 1;
      if (applied.duplicate) s.duplicates += 1;
      s.refunded += applied.refund || 0;
      if (s.firstOpenAt == null) s.firstOpenAt = now;
      // Rarest pull ever. Ties keep the earlier one — first time you hit it.
      if (!s.best || tierRank(item.tier) > tierRank(s.best.tier)) {
        s.best = { itemId: winnerId, tier: item.tier, label: item.label, at: now };
      }
    });

    return {
      ok: true,
      caseKey,
      itemId: winnerId,
      item,
      tier: item.tier,
      rarity,
      reel,
      winnerIndex,
      duplicate: applied.duplicate,
      refund: applied.refund,
      mailto: applied.mailto,
      message: applied.duplicate
        ? `Duplicate — refunded ${applied.refund.toLocaleString()} Strubles`
        : item.label,
    };
  }

  function getHistory() {
    const h = loadJSON(HISTORY_KEY, []);
    return Array.isArray(h) ? h : [];
  }

  window.IantopiaCase = {
    buyCase,
    openCase,
    getCases,
    getCaseCount,
    getHistory,
    getStats,
    getInventory: () => state.inv,
    getFlags: () => state.flags,
    getUnlocks: () => state.unlocks,
    // Exposed for the odds table in the UI and for tests.
    oddsFor: (caseKey) => { const d = getCaseDef(caseKey); return d ? oddsFor(d) : null; },
    itemsInTier: (caseKey, tier) => { const d = getCaseDef(caseKey); return d ? itemsInTier(d, tier) : []; },
  };

  // Back-compat: the old API name, so any page still calling openBox() keeps
  // working against the default case instead of throwing.
  window.IantopiaLoot = {
    openBox: () => {
      const buy = buyCase('starter');
      if (!buy.ok) return { ok: false, message: buy.message };
      return openCase('starter');
    },
    getInventory: () => state.inv,
    getFlags: () => state.flags,
    getUnlocks: () => state.unlocks,
  };
})();

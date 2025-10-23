// lootbox.js
(function () {
  const INV_KEY = "strubles_inventory_v1";
  const FLAGS_KEY = "strubles_flags_v1";
  const UNLOCKS_KEY = "strubles_unlocks_v1";

  function loadJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  const state = {
    get inv()   { return loadJSON(INV_KEY,   { items:[], powerups:[], sfx:[], themes:[], badges:[] }); },
    set inv(v)  { saveJSON(INV_KEY, v); },
    get flags() { return loadJSON(FLAGS_KEY, {}); },
    set flags(v){ saveJSON(FLAGS_KEY, v); },
    get unlocks(){return loadJSON(UNLOCKS_KEY, { pages:[] }); },
    set unlocks(v){ saveJSON(UNLOCKS_KEY, v); },
  };

  function pickWeighted(list) {
    const total = list.reduce((s,p)=>s+(p.weight||0), 0);
    let r = Math.random()*total;
    for (const p of list) { r -= p.weight; if (r <= 0) return p; }
    return list[list.length-1];
  }

  function applyPrize(prize) {
    const inv = state.inv;
    const flags = state.flags;
    const unlocks = state.unlocks;

    switch (prize.type) {
      case "strubles":
        Strubles.add(prize.amount||0);
        break;
      case "rng_strubles": {
        const min = prize.min||0, max = prize.max||0;
        const amt = Math.floor(min + Math.random()*(max-min+1));
        Strubles.add(amt);
        prize._amount = amt; // so UI can show exact
        break;
      }
      case "item":
        inv.items.push(prize.id);
        state.inv = inv;
        break;
      case "badge":
        inv.badges.push(prize.key||prize.id);
        state.inv = inv;
        break;
      case "theme":
        inv.themes.push(prize.key||prize.id);
        state.inv = inv;
        break;
      case "sfx":
        inv.sfx.push(prize.key||prize.id);
        state.inv = inv;
        break;
      case "flag":
        flags[prize.key||prize.id] = true;
        state.flags = flags;
        break;
      case "powerup":
        inv.powerups.push(prize.effect||prize.id);
        state.inv = inv;
        break;
      case "unlock_page":
        if (!unlocks.pages.includes(prize.path)) {
          unlocks.pages.push(prize.path);
          state.unlocks = unlocks;
        }
        break;
      case "action":
        if (prize.effect === "email_haiku") {
          // stub: open mailto with haiku; replace with Worker later
          const subject = encodeURIComponent("Iantopia speaks from the void");
          const body = encodeURIComponent("Haiku:\nIantopia waits\nStrubles whisper in the dark\nShip it, mortal king");
          window.location.href = `mailto:ian@example.com?subject=${subject}&body=${body}`;
        } else if (prize.effect === "email_finish") {
          const subject = encodeURIComponent("Finish Iantopia (Mythic Redemption)");
          const body = encodeURIComponent("I pulled the Mythic: Email Ian to Finish Iantopia.\nPlease finish it. 🙏\n— Sent from iantopia.pages.dev");
          window.location.href = `mailto:ian@example.com?subject=${subject}&body=${body}`;
        }
        break;
    }
  }

  function openBox() {
    const cost = window.LOOTBOX?.cost ?? 1000;
    if (!Strubles.spend(cost)) {
      return { ok:false, message:"Not enough Strubles." };
    }
    const prize = pickWeighted(window.LOOTBOX.prizes);
    applyPrize(prize);
    return { ok:true, prize };
  }

  // expose minimal API
  window.IantopiaLoot = {
    openBox,
    getInventory: () => state.inv,
    getFlags: () => state.flags,
    getUnlocks: () => state.unlocks,
  };
})();

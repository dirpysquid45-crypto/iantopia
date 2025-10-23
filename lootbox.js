// lootbox.js
(function () {
  const INV_KEY    = "strubles_inventory_v1";
  const FLAGS_KEY  = "strubles_flags_v1";
  const UNLOCKS_KEY= "strubles_unlocks_v1";

  // Root-level file paths (no /assets folder)
  const SFX_MAP = { cursed: "/cursed.mp3" };

  function loadJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  // Helpers
  const uniqPush = (arr, val) => { if (!arr.includes(val)) arr.push(val); };
  const dispatch = (name) => { try { window.dispatchEvent(new CustomEvent(name)); } catch {} };

  const state = {
    get inv()   { return loadJSON(INV_KEY,   { items:[], powerups:[], sfx:[], themes:[], badges:[] }); },
    set inv(v)  { saveJSON(INV_KEY, v); dispatch("inventory:changed"); },
    get flags() { return loadJSON(FLAGS_KEY, {}); },
    set flags(v){ saveJSON(FLAGS_KEY, v); },
    get unlocks(){return loadJSON(UNLOCKS_KEY, { pages:[] }); },
    set unlocks(v){ saveJSON(UNLOCKS_KEY, v); },
  };

  function pickWeighted(list) {
    const total = list.reduce((s,p)=>s+(p.weight||0), 0);
    if (total <= 0) return list[0];
    let r = Math.random()*total;
    for (const p of list) { r -= p.weight; if (r <= 0) return p; }
    return list[list.length-1];
  }

  function playSfx(key){
    const src = SFX_MAP[key];
    if (!src) return;
    try { new Audio(src).play().catch(()=>{}); } catch {}
  }

  function describePrize(prize){
    switch (prize.type){
      case "strubles":      return `+${prize.amount} Strubles`;
      case "rng_strubles":  return `+${prize._amount ?? ""} Strubles`;
      case "item":          return prize.id;
      case "badge":         return `Badge: ${prize.key||prize.id}`;
      case "theme":         return `Theme unlocked: ${prize.key||prize.id}`;
      case "sfx":           return `Sound: ${prize.key||prize.id}`;
      case "flag":          return `Flag: ${prize.key||prize.id}`;
      case "powerup":       return `Powerup: ${prize.effect||prize.id}`;
      case "unlock_page":   return `Secret page unlocked`;
      case "action":        return prize.label || "Special action";
      default:              return "Mystery prize";
    }
  }

  function applyPrize(prize) {
    const inv = state.inv;
    const flags = state.flags;
    const unlocks = state.unlocks;

    switch (prize.type) {
      case "strubles": {
        Strubles.add(prize.amount||0);
        break;
      }
      case "rng_strubles": {
        const min = prize.min||0, max = prize.max||0;
        const amt = Math.floor(min + Math.random()*(max-min+1));
        Strubles.add(amt);
        prize._amount = amt; // for UI
        break;
      }
      case "item": {
        uniqPush(inv.items, prize.id);
        state.inv = inv;
        break;
      }
      case "badge": {
        const key = prize.key || prize.id;
        uniqPush(inv.badges, key);
        state.inv = inv;
        break;
      }
      case "theme": {
        const key = prize.key || prize.id;
        uniqPush(inv.themes, key);
        state.inv = inv;
        break;
      }
      case "sfx": {
        const key = prize.key || prize.id;
        uniqPush(inv.sfx, key);
        state.inv = inv;
        // play it on win
        playSfx(key);
        break;
      }
      case "flag": {
        flags[prize.key||prize.id] = true;
        state.flags = flags;
        break;
      }
      case "powerup": {
        const key = prize.effect || prize.id;
        uniqPush(inv.powerups, key);
        state.inv = inv;
        break;
      }
      case "unlock_page": {
        if (prize.path && !state.unlocks.pages.includes(prize.path)) {
          unlocks.pages.push(prize.path);
          state.unlocks = unlocks;
        }
        break;
      }
      case "action": {
        // keep mailto for now; swap to Worker endpoint later
        if (prize.effect === "email_haiku") {
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
  }

  function openBox() {
    // Validate config
    if (!window.LOOTBOX || !Array.isArray(window.LOOTBOX.prizes) || window.LOOTBOX.prizes.length===0) {
      return { ok:false, message:"Lootbox not configured." };
    }

    const cost = Number(window.LOOTBOX.cost ?? 1000);
    if (!Strubles.spend(cost)) {
      return { ok:false, message:"Not enough Strubles." };
    }

    const prize = pickWeighted(window.LOOTBOX.prizes);
    applyPrize(prize);

    const message = describePrize(prize);
    return { ok:true, prize, message };
  }

  // expose minimal API
  window.IantopiaLoot = {
    openBox,
    getInventory: () => state.inv,
    getFlags: () => state.flags,
    getUnlocks: () => state.unlocks,
  };
})();

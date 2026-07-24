// lootbox-data.js
window.LOOTBOX = {
  cost: 1000, // cost to open (adjust anytime)
  prizes: [
    // --- Currency (visible balance, spendable) ---
    // rng_100_300 removed: felt like a consolation-prize loss against the 1000 cost.
    { id:"s_1000", label:"+1,000 Strubles", weight:400, type:"strubles", amount:1000 },
    { id:"s_5000", label:"+5,000 Strubles", weight:150, type:"strubles", amount:5000 },
    { id:"s_10000", label:"+10,000 Strubles", weight:25, type:"strubles", amount:10000 },
    { id:"one_true", label:"The One True Struble (100k)", weight:1, type:"strubles", amount:100000 },

    // --- Music (Now Playing / playlist) ---
    { id:"taipei_instrumental", label:"Yung Lean – Taipei Instrumental", weight:90, type:"music_unlock", key:"taipei_instrumental" },

    // --- Backgrounds (Background switcher) ---
    { id:"bg_vegas", label:"Background: Las Vegas Skyline", weight:90, type:"background_unlock", key:"vegas_skyline" },
    { id:"bg_roulette", label:"Background: Trippy Roulette", weight:90, type:"background_unlock", key:"trippy_roulette" },
    { id:"bg_oldppl", label:"Background: Old People Slot", weight:90, type:"background_unlock", key:"old_ppl_slot" },
    { id:"bg_taipei_night", label:"Background: Taipei Nightlife (Video)", weight:90, type:"background_unlock", key:"taipei_nightlife" },

    // --- Functional actions (actually do something when won), ~1% each ---
    { id:"haiku_email", label:"Email from the Void (AI haiku)", weight:10, type:"action", effect:"email_haiku" },
    { id:"finish_ian", label:"Email Ian to Finish Iantopia", weight:10, type:"action", effect:"email_finish" }
  ]
};

// --- ARCHIVED (2026-07-24) ---
// Removed from rotation: these prizes are text-only inventory entries with
// no visible/audible effect anywhere on the site, or reference systems
// (themes, powerups, win-rate flags, secret pages) that were never actually
// built. Kept here, not deleted, in case any of these get implemented later
// and should be reactivated by moving them back into LOOTBOX.prizes above.
window.LOOTBOX_ARCHIVED_PRIZES = [
  { id:"rng_100_300", label:"+100–300 Strubles", weight:650, type:"rng_strubles", min:100, max:300 }, // felt like a loss against the 1000 cost, not an intangibility issue
  { id:"sock", label:"Stinky Ian Sock", weight:120, type:"item", sell:1 },
  { id:"used_deck", label:"Used Deck of Cards", weight:100, type:"powerup", effect:"bj_refund_bust_by_1" },
  { id:"bug_coupon", label:"Bug Report Coupon", weight:90, type:"badge", key:"bug_coupon" },
  { id:"panda", label:"Ian's Panda Express", weight:90, type:"flavor" }, // never had a handler in applyPrize() at all
  { id:"double_down", label:"Double-Down Pass", weight:90, type:"powerup", effect:"double_down_once" },
  { id:"drain_gang_theme", label:"Theme Unlock: Drain Gang", weight:60, type:"theme", key:"drain_gang" },
  { id:"mini_trophy", label:"Mini Struble Trophy", weight:50, type:"badge", key:"mini_trophy" },
  { id:"fake_cert", label:"Fake Certificate of Completion", weight:40, type:"item" },
  { id:"golden_struble", label:"Golden Struble (+2% wins)", weight:50, type:"flag", key:"golden_struble" },
  { id:"ians_id", label:"Ian's Driver License", weight:30, type:"item" },
  { id:"cursed_audio", label:"Cursed Audio File", weight:20, type:"sfx", key:"cursed" }, // plays once on win, not persistent/selectable like a music track
  { id:"alt_ending", label:"Alternate Ending", weight:10, type:"unlock_page", path:"/iantopia-secret.html" },
  { id:"collector_badge", label:"Collector's Edition Badge", weight:9, type:"badge", key:"collector_glow" },
  { id:"ideas_wall", label:"Lobby for Iantopia", weight:1, type:"unlock_page", path:"/ideas.html" },
  { id:"patronage", label:"Topian Patronage (2× daily)", weight:1, type:"flag", key:"daily_x2" },
  { id:"crown", label:"Crown of Iantopia", weight:1, type:"flag", key:"crown" }
];

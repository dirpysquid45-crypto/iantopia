// lootbox-data.js
window.LOOTBOX = {
  cost: 1000, // cost to open (adjust anytime)
  prizes: [
    // --- Common (~65%)
    { id:"rng_100_300", label:"+100–300 Strubles", weight:650, type:"rng_strubles", min:100, max:300 },
    { id:"sock", label:"Stinky Ian Sock", weight:120, type:"item", sell:1 },
    { id:"used_deck", label:"Used Deck of Cards", weight:100, type:"powerup", effect:"bj_refund_bust_by_1" },
    { id:"bug_coupon", label:"Bug Report Coupon", weight:90, type:"badge", key:"bug_coupon" },
    { id:"panda", label:"Ian's Panda Express", weight:90, type:"flavor" },

    // --- Rare (~22%)
    { id:"s_1000", label:"+1,000 Strubles", weight:220, type:"strubles", amount:1000 },
    { id:"double_down", label:"Double-Down Pass", weight:90, type:"powerup", effect:"double_down_once" },
    { id:"drain_gang_theme", label:"Theme Unlock: Drain Gang", weight:60, type:"theme", key:"drain_gang" },
    { id:"mini_trophy", label:"Mini Struble Trophy", weight:50, type:"badge", key:"mini_trophy" },
    { id:"fake_cert", label:"Fake Certificate of Completion", weight:40, type:"item" },

    // --- Epic (~9%)
    { id:"s_5000", label:"+5,000 Strubles", weight:90, type:"strubles", amount:5000 },
    { id:"golden_struble", label:"Golden Struble (+2% wins)", weight:50, type:"flag", key:"golden_struble" },
    { id:"ians_id", label:"Ian's Driver License", weight:30, type:"item" },
    { id:"cursed_audio", label:"Cursed Audio File", weight:20, type:"sfx", key:"cursed" },

    // --- Legendary (~3.9%)
    { id:"s_10000", label:"+10,000 Strubles", weight:39, type:"strubles", amount:10000 },
    { id:"haiku_email", label:"Email from the Void (AI haiku)", weight:20, type:"action", effect:"email_haiku" },
    { id:"alt_ending", label:"Alternate Ending", weight:10, type:"unlock_page", path:"/iantopia-secret.html" },
    { id:"collector_badge", label:"Collector’s Edition Badge", weight:9, type:"badge", key:"collector_glow" },

    // --- Mythic (0.1%)
    { id:"finish_ian", label:"Email Ian to Finish Iantopia", weight:1, type:"action", effect:"email_finish" },
    { id:"ideas_wall", label:"Lobby for Iantopia", weight:1, type:"unlock_page", path:"/ideas.html" },
    { id:"patronage", label:"Topian Patronage (2× daily)", weight:1, type:"flag", key:"daily_x2" },
    { id:"crown", label:"Crown of Iantopia", weight:1, type:"flag", key:"crown" },
    { id:"one_true", label:"The One True Struble (100k)", weight:1, type:"strubles", amount:100000 }
  ]
};

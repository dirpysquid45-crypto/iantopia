// patch-notes.js
// Dated changelog, shown via index.astro's Patch Notes overlay. Plain
// window.X global (not ES exports) -- matches how every other shared data
// file on this site loads (case-data.js, tycoon-buildings.js,
// music-library.js), all via plain <script src> tags, no bundler.
//
// To add an entry: prepend a new object here (newest first) and bump the
// cache-busting ?v=N on every page's <script src="/patch-notes.js?v=N">.
window.PATCH_NOTES = [
  {
    date: "2026-10-07",
    title: "My Iantopia: Food, Farms & Living Villagers",
    changes: [
      "Zoning is now drag-to-fill: pick a zone, drag a box across the map and see the price before you let go. Roads are still drawn freehand.",
      "Refunds: erasing zoning pays back what you paid for those tiles, and removing a building refunds its permit. Tiles under a building are left alone.",
      "Removing any building rarer than Mil-Spec (Common) now asks \"Are you sure?\" first.",
      "Three new buildings: the Farm (needs the new Farmland zone), the Grocery Store and the 7-Eleven. They drop from the Iantopia Lootbox Basic and are sold in Real Estate.",
      "Food: every resident eats 1 food a minute. Farms grow it, and Grocery Stores and 7-Elevens carry it to your residents (all need a road). A hungry village loses mood; a fed one gains a little.",
      "Villagers now live in residential buildings, which have resident limits, and every building has a capacity. They walk the roads to shops, work and home and step inside while they are there. Tap a building to see who is inside.",
      "New People and Food readouts in the village stats bar.",
    ],
  },
  {
    date: "2026-10-06",
    title: "My Iantopia, Real Estate & Arena Overhaul",
    changes: [
      "Tycoon is now 🏘️ My Iantopia: a top-down village builder. Paint zoning (residential, commercial, industrial), lay roads and water, then build on matching land. Zoning clears once something is built on it.",
      "11 buildings, all unlocked from the Lootbox: the original five plus the Bank, Office Building, Sweatshop, Factory, Coal Plant and Nuclear Plant, each with real artwork. Taipei 101 needs 3×3 commercial land and the Pagoda 2×2 residential.",
      "New Real Estate section in the Shop sells buildings at a steep markup. Village slots are far cheaper, and the Bank is now a physical building with its own cover art. Taipei 101 is much rarer than before and every building's drop odds were rebalanced.",
      "Villagers wander along roads, avoid water, and zoning prices scale with your Strubles. The village also got faster rendering, richer pixel art, autotiled roads and fewer buttons.",
      "Battleship rebuilt: boards are stacked vertically and sized to fit any laptop or phone, ships are drawn crisply, the turn bar and Fire button stay on screen, and placement on mobile is tap, Rotate, Place.",
      "Friendly games! Set the stake to 0 Strubles in Blackjack or Battleship for a friendly match: nothing is won or lost, and guests can play without signing up. Staked games still need an account.",
      "Blackjack: your opponent's cards now stay face down until the hand is settled, then both hands flip and the totals are shown. The server no longer sends their cards at all, so they cannot be peeked at.",
      "Arena reliability: dropped connections resume the game in place for 30 seconds, turns and hands are timed so nobody can stall a match, and rematch and back-to-lobby buttons work again. Winners are paid (minus a 5% rake) and losers charged exactly once, to the right accounts. A negative-bet exploit and self-matching were closed.",
      "Suggestion box on the home page (💡 Suggest), now styled like the other small buttons and working on phones. Suggestions are sent through the server, so they actually arrive.",
      "New Suggestions Forum (/suggestions): ideas that get posted from the suggestion box show up there for everyone to read.",
      "Horse Game scores now have their own leaderboard.",
    ],
  },
  {
    date: "2026-10-01",
    title: "Horse Game Phase 2 & Arena Expansion",
    changes: [
      "Horse Game now features a dramatic 100-hurdle milestone: obstacles shift from wooden fences to rocks, the background swaps from plains to mountains, and a 2.5-second spawn cooldown prevents instant death on the flip.",
      "New Arena card: ⚔️ Cavalry Battle joins Blackjack and Battleship, rendered with an animated cavalry battle GIF and golden-fiery styling.",
      "Obstacle tracking consolidated -- planes dodged and gaps jumped now count toward the main 'Obstacles cleared' stat alongside hurdles, unifying all obstacle types.",
      "Mobile layout fixes: Strubles badge repositioned on phones to prevent overlap with game canvas (now at 120px instead of 15px).",
      "Collectibles system refactored: Rock, Horse, and Happy Horse items moved from in-game pickups to shop/lootcrate rewards (mil-spec, restricted, classified tiers respectively).",
      "Repository reorganized: all game assets moved to /public directory with subdirectories for backgrounds, images, and naval-battle-assets. Asset paths standardized (lowercase with hyphens).",
      "News digest cleaner: removed 'Generated locally on Qasim' attribution from morning digest byline -- now shows only timestamp.",
    ],
  },
  {
    date: "2026-09-25",
    title: "Arena Mode: Battleship 1v1 & Multiplayer Polish",
    changes: [
      "Battleship 1v1 joins the Arena: Place your fleet on the Taiwan Strait, then hunt enemy ships across a grid. Win by sinking all opponent vessels.",
      "Arena Mode now ships with thematic music (Yaddak for the hub, Balatro for Blackjack, Koronba for Battleship), floating music controls, and sprite-rendered naval combat.",
      "All Arena payouts respect your wallet cap and burn a 5% rake from the economy.",
      "Mobile-responsive design brings full Arena functionality to phones and tablets.",
    ],
  },
  {
    date: "2026-09-25",
    title: "Arena Mode: Blackjack 1v1",
    changes: [
      "A new ⚔️ Arena mode opens multiplayer real-time gaming. Start with Blackjack 1v1: enter a public lobby, auto-match with an equal bet, and play head-to-head.",
      "All bets and payouts are server-authoritative and respect your wallet cap -- no sneaking past the balance limits you built up through the Tycoon.",
      "A 5% rake is burned from the economy on each game (no banker house -- just disappeared coins).",
    ],
  },
  {
    date: "2026-09-24",
    title: "Leaderboard",
    changes: [
      "A new Leaderboard page ranks players by net Strubles production per minute -- production minus upkeep, not raw balance.",
      "Raw hoarding or over-building without paying upkeep won't climb the board -- only a well-managed economy will.",
    ],
  },
  {
    date: "2026-09-23",
    title: "Grid Expansion",
    changes: [
      "The skyline is no longer capped at 5 buildings -- a new Expand button on the Tycoon page purchases additional slots.",
      "Each slot costs roughly triple the last, starting at 200,000 Strubles for the 6th -- a long-term sink for players who have outgrown the base economy.",
    ],
  },
  {
    date: "2026-09-23",
    title: "Building Upkeep",
    changes: [
      "Every completed building now owes a daily upkeep cost (a percentage of its own permit price), auto-paid from your balance.",
      "Can't cover it? The building goes neglected -- half production -- until your balance covers the backlog, which then clears automatically. Buildings are never repossessed.",
      "Taipei 101 carries the heaviest upkeep in the roster -- a real cost to weigh against its production and wallet-cap bonus.",
    ],
  },
  {
    date: "2026-09-17",
    title: "Wallet Cap & the Bank",
    changes: [
      "Every account now has a maximum Strubles balance -- earnings past the cap don't accrue until you spend back under it.",
      "The Bank (new 🏦 button on the Tycoon page) raises that cap in purchasable levels.",
      "Taipei 101 now also raises your cap (+10,000 per copy owned, up to +50,000) -- a real reason to own one beyond its production.",
      "This replaces the old 8-hour offline production limit, which only applied while you were away -- the wallet cap applies everywhere, all the time.",
    ],
  },
  {
    date: "2026-09-17",
    title: "Currency Reform",
    changes: [
      "Glorious Iantopia has stabilized its currency. Every balance was converted on a progressive curve: the first 10,000 Strubles are untouched, the next 40,000 convert at 1:5, and anything beyond 50,000 converts at 1:20.",
      "A normal balance is unaffected. This targets the small number of accounts that grew far beyond what the intended economy ever supported.",
    ],
  },
];

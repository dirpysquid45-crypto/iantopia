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
    date: "2026-10-15",
    title: "Village Specialization, Jobs, Commutes, Random Events & Neighbor Visits",
    changes: [
      "Specialize your village: once at least 9 tiles are zoned, a clear majority (50%+) committed to one zone type gives buildings of that type a production bonus, up to +25% fully committed. A balanced village of all three zones gets no bonus — leaning in is what's rewarded.",
      "Your specialty (if any) shows in the stats bar, in a building's own panel, and as a small badge next to your name on the GDP and Efficiency leaderboards.",
      "Villagers get jobs: any villager without one is hired into a nearby office, shop, factory or plant with room. From 9 am to 5 pm they commute to work and clock in instead of wandering; after hours they head home or out like anyone else.",
      "A workday that's actually staffed lifts village mood a little — a new Jobs readout in the stats bar shows how many positions are filled.",
      "Random events: a fire can break out (more likely in industrial buildings, less likely with any water zoned) and halts that building's production until it burns out or you pay to put it out. A trade caravan can bring a one-time windfall. An audit can catch a village that's let its upkeep slide and double what's owed. Nothing here can end your village — it just keeps a thriving one on its toes.",
      "Neighbor visits: signed in, your village is visible to others as a read-only snapshot. Click a name on the GDP or Efficiency leaderboard to drop in and look around — same art, no interaction — and ❤️ like what you see.",
    ],
  },
  {
    date: "2026-10-14",
    title: "GDP & Efficiency Leaderboards, Leaderboard Fix, Shop Image Fix",
    changes: [
      "New leaderboards: GDP ranks villages by total output (the same number shown as GDP in the stats bar), and Efficiency ranks by output per building, so a lean, well-run village can outrank a much bigger sprawling one. Efficiency needs at least 3 buildings to qualify, so a single big building can't top the board alone.",
      "My Iantopia's \"Production\" stat is now labelled GDP, and there's a new Efficiency readout next to it.",
      "Fixed: the Leaderboards page's back button went to My Iantopia no matter where you came from (including from the Horse Game). It goes home now, like every other page.",
      "Fixed: the newer building art (Bank, Office Building, Sweatshop, Factory, Coal Plant, Nuclear Plant, 7-Eleven, Park) had no cache-busting, so a stale cache from an in-progress deploy could keep showing a broken image in the Shop. Versioned now, like every other asset.",
    ],
  },
  {
    date: "2026-10-07",
    title: "The Big Drop: My Iantopia, Arena Overhaul, Collectibles & Credits",
    changes: [
      "MY IANTOPIA: the old skyline is now a top-down village builder. Zone land (residential, commercial, industrial), lay roads and water, and build on matching zoning. Roads are required for a building to earn. Real textures, richer pixel art, autotiled roads and faster rendering.",
      "Zoning is drag-to-fill: pick a zone, drag a box across the map and see the price before you let go. Erasing zoning or removing a building refunds what you paid, and removing anything above Mil-Spec (Common) asks \"Are you sure?\".",
      "New Undo button (or Ctrl/Cmd+Z): reverses your last 30 zoning, road, build, move and remove actions, Strubles included.",
      "13 buildings, none owned at the start: the original five plus the Bank (now a real building with its own art), Office Building, Sweatshop, Factory, Coal Plant, Nuclear Plant, the 7-Eleven and the Park. They drop from the Iantopia Lootbox Basic and are sold at a steep markup in the new Real Estate section of the Shop. Taipei 101 is much rarer than before.",
      "Villagers live in residential buildings (with resident limits), and every building has a capacity. They walk the roads to shops, work and home and step inside. Tap a building to see who is inside. Girls in pink and villagers in green and white shirts join the originals.",
      "Food: every resident eats 1 food a minute, and a 7-Eleven with a road touching it keeps 20 residents fed. A hungry village loses mood.",
      "The village has its own clock (a day is 8 real minutes). Around 12 pm and 6 pm villagers flock to the Park, wander about inside it and get happy: a pink heart over their head and a boost to village mood. New Time, People and Food readouts in the stats bar.",
      "ARENA: Battleship rebuilt. Boards are stacked vertically and sized to fit any laptop or phone, the turn bar and Fire button stay on screen, and placement on mobile is tap, Rotate, Place.",
      "Friendly games! Set the stake to 0 Strubles in Arena Blackjack or Battleship: nothing is won or lost, and guests can play without signing up. Staked games still need an account.",
      "Arena Blackjack: your opponent's cards stay face down until the hand is settled, then both hands flip with their totals.",
      "Arena reliability: dropped connections resume in place for 30 seconds, turns and hands are timed so nobody can stall a match, rematch and back-to-lobby work, and winners are paid (minus a 5% rake) and losers charged exactly once, to the right accounts.",
      "SUGGESTION BOX: fixed. It now sends reliably, and the button resizes and flows like the other small buttons on phones. Posted suggestions appear on the new Suggestions Forum (/suggestions).",
      "COLLECTIBLES: 19 new glowing collectibles. Every building (Taipei 101 included) plus Grass, Cobblestone Road and Water tiles, Smirnoff Ice, Modelo Negra and the Tuff Ahh Bear. Find them in the crates or buy them in the Shop; they glow in their rarity colour, and you can arrange them on your Inventory shelf.",
      "CREDITS: the ending now credits Ian Solano (Main Dev), George Saade (Assistant Development), Chris Dayton (Lead Producer) and Ian Struble (Head of Treasury), and rolls out your full stats: current Strubles, Blackjack, Minesweeper, Horse Game, Arena Blackjack and Battleship (wins, losses, win rate, friendly games) and how many times you have visited every page on the site.",
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

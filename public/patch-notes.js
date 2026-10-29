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
    date: "2026-10-29",
    title: "A New Menu, Chat, Better Games, and Iantopia Is Almost Here",
    changes: [
      "COMING SOON: Iantopia is almost published. It is still a work in progress, so expect more changes and the odd bug while we finish it.",
      "MENU: Inventory, Background, Cursor, Patch Notes, Suggest and Sign In now live behind a hamburger button, right under your Strubles counter. It opens a see-through glass panel that slides in, and it matches whichever theme you are on.",
      "STRUBLES COUNTER: click it to open the Strubles leaderboard.",
      "CHAT: sign in, open the menu and open Chat, under Sign In. Press Enter to send, and use Reply on any message to answer it. It only updates while it is open, and messages go through the same word filter as village names.",
      "LEADERBOARDS: Minesweeper now has one board with a difficulty picker (All, Beginner, Intermediate, Expert, Hormuz) instead of separate ones, and there is a new Strubles board.",
      "TYCOON STATS: the numbers bar at the top is gone. Everything is in the Stats window, which now updates live and has a Rename village button. The Leaderboard, Visit and You buttons are black with gold outlines.",
      "BANK: the teller now waves a fan of bills from under the counter.",
      "GIFTS AND NOTES: send a gift of Strubles (one a day, up to 1,000) or a free note to villages that are open to visitors. Words we can't allow are blocked, and village names are filtered too.",
      "HORSE GAME: platforms now rise out of the ground as solid dirt walls with grass on top. Hurdles are spaced fairly, so none lands on top of your landing spot, and running into a platform's wall ends the run with You Stubbed Your Toe! You hear an oops when you wipe out, and the Tetris tink when you grab a Struble.",
      "HORSE GAME ON PHONES: the whole game now scales to your screen, so the horse, hurdles and Strubles keep their proportions, the box is bigger, and double-tapping no longer zooms the page.",
      "TETRIS ON PHONES: tap the board to rotate, drag a finger sideways to move, swipe down to slam, and tap the Hold box to hold. Double-tap zoom and text highlighting are off while you play. Solo Tetris has a Restart button, and arena Tetris has a New match button once a match is over.",
      "SCARY MAZE: your mouse pointer comes back after you win or get caught, so you can find the way out.",
    ],
  },
  {
    date: "2026-10-28",
    title: "Daily Profit",
    changes: [
      "PROFIT: the You tab in Stats shows today's income, spending, refunds and profit for your Tycoon, plus the last few days. It's kept in this browser and counts Tycoon Strubles only.",
    ],
  },
  {
    date: "2026-10-28",
    title: "Stats Window",
    changes: [
      "STATS: a Stats button in the Tycoon opens one window with three tabs: You (your numbers), Leaderboard (GDP and Efficiency, with a Visit button next to each village), and Visit (let visitors in, and visit a village).",
    ],
  },
  {
    date: "2026-10-28",
    title: "Visit Other Villages",
    changes: [
      "VISIT: the Tycoon has a Visit button. Villages whose owners have let visitors in show up there, and you walk into one in the Tycoon scene to look around. You can't build, spend or earn while you're visiting. Back home takes you to your own village.",
      "PRIVATE BY DEFAULT: your village is hidden from visitors until you turn on 'Let visitors into my village'. Turning it off takes it down again.",
    ],
  },
  {
    date: "2026-10-28",
    title: "Scary Maze Fixed on Phones",
    changes: [
      "SCARY MAZE: on phones the walls between the corridors were too thin, so you could cut from the start straight to the red square. The corridors are now sized to the board, so the walls hold on every screen size.",
    ],
  },
  {
    date: "2026-10-27",
    title: "Tycoon Rebalance: Easy to Start, Pricier as You Grow",
    changes: [
      "REAL ESTATE: cheaper to get started. Military-Grade is 2,500, Restricted 6,000 and Classified 20,000 (was 15,000, 30,000 and 65,000). Covert is 90,000. Each copy you already own raises the next copy's price by 20%.",
      "STARTER KIT: your first visit to the Tycoon gives you 2 Shabby Apartments and 1 Generic Building, once per village.",
      "LOOTBOX: your first 2 opens are guaranteed to hold a Military-Grade or Restricted building.",
      "FASTER FIRST BUILDS: your first 3 buildings finish in a tenth of the usual time, so income starts in your first session. New villages also earn up to double until they have made 25,000 in total; the bonus fades as you earn.",
      "SLOTS: the first slot costs 300. The early slots are cheaper than before, and the price climbs faster from slot 15 on.",
      "PERMITS AND UPKEEP: after your first 3 buildings, each extra building makes the next permit 7% dearer. Past 10 buildings, upkeep rises 3% per building. A small village is barely affected.",
      "BANK: from level 4, each level costs a little more relative to your current cap (60% rising to 70% at level 9), so the top levels take longer to reach.",
      "POWER PLANTS: the Coal Plant now produces 10 (was 16) and the Nuclear Plant 15 (was 30).",
    ],
  },
  {
    date: "2026-10-27",
    title: "Tetris Arrives, Air Hockey Gets a Real Table & Wallets Move to the Server",
    changes: [
      "TETRIS: play solo at /tetris, or 1 versus 1 in the Arena. Each line you clear sends garbage rows to your opponent, one hole per row. Versus is friendly (free) or staked: both stakes go in at the start, and the winner takes the pot less a 5% rake.",
      "TETRIS CONTROLS: keybind presets (Arrows rotate is the default), a panel to rebind any key, and toggles for the ghost piece, onion skin and row flashes. The touch pad shows each action's current key. The theme song and sound effects can be muted, and the mute stays on in that browser.",
      "AIR HOCKEY: the table keeps the proportions of a 7 by 4 foot table, with rounded corners, and always shows upright with your goal at the bottom. The puck, mallets and goals are larger so they read on a phone. Each goal is a band in its owner's colour, labelled YOUR GOAL or THEIR GOAL.",
      "AIR HOCKEY FIXES: a goal only counts once the whole puck has crossed the line. A paddle can no longer sit on top of the puck when a wall pushes the puck into it. The puck is predicted between updates, so it moves more smoothly on a slow connection.",
      "MAHJONG: a new board every day. Beat today's board to unlock the other layouts. On a narrow or tall window the tiles stay upright instead of turning sideways.",
      "ARENA: Tetris is listed above Blackjack in the card stack.",
      "WALLETS: the server now keeps every signed-in balance. Winnings, refunds and spending are checked on the server, and each payout has to match a real bet. Income that isn't a bet is capped each day per source. These caps are a first setting and may change.",
      "FIXED: after an account reset, a real win is no longer pulled back to 100. Refunds, such as a lootbox duplicate, are no longer counted as wins by the account watch.",
    ],
  },
  {
    date: "2026-10-22",
    title: "Air Hockey Goes Vertical, Blackjack Splits, Raining Money Overlay & Jade Han Palace",
    changes: [
      "AIR HOCKEY: the table is vertical now, with your own goal at the bottom of the screen, which suits a phone. While you look for an opponent, the lobby holds you in a waiting room with a Cancel button, the same as the Blackjack lobby.",
      "AIR HOCKEY: fixed the table edges. The puck only passes a goal when its whole edge is inside the opening, so a corner post always bounces it, and it can't end up outside the table after a hit.",
      "BLACKJACK: any two cards worth ten (10, J, Q, K) can be split, not just a matching pair. The action buttons sit in one row.",
      "MAHJONG: the music starts on your first tap or key press in the game, since browsers don't let sound start before that. The music button still mutes it.",
      "RAINING MONEY: the rain is now an overlay you can switch on over any background, so it no longer replaces your background. Turn it on or off in the Background picker.",
      "PICKERS: the background you've chosen and the track that's playing show a green outline.",
      "SPRING MORNING IN THE HAN PALACE: the menu buttons and the timer use a jade texture, with green glows.",
      "PHONES: the horse game's balance sits in the top-right corner. The shop's Home link is back in the top-left, with the balance under it. Back links are easier to tap.",
    ],
  },
  {
    date: "2026-10-21",
    title: "Air Hockey, Mahjong Overhaul, Low Graphics & Haunted Fixes",
    changes: [
      "MULTIPLAYER AIR HOCKEY: Pong is now air hockey, played live against another player in the Arena. Choose a mode: first to 7 goals, best of 5 (first to 3), a 60-second timed match, or endless. Paddles stay on your half, goals pause the puck to serve, and the rink is drawn in the same pixel style as the rest of the Arena.",
      "MAHJONG: a pixel font, a bamboo background, black glowing text and a full set of sound effects. Music now starts with the game, cycles through its playlist, and has its own volume control. Each hint costs 10%, and there's a back link to the Puzzles hub.",
      "NEW MUSIC AND BACKGROUNDS: the Han Palace background and four new tracks are unlockable from the Shop and crates. Four of those tracks are in the Mahjong playlist, and every track can now be unlocked. Avatar's Love is an unlock only, not in Mahjong.",
      "PUZZLES: the Puzzles hub replaces the old Minesweeper button, and Mahjong Solitaire now pays out in Strubles. The puzzle background is unlockable too, and the Puzzles and Arena cards have a gentle float and a grow on hover.",
      "HOMEPAGE: the menu cards are stacked and animated, buttons grow and wobble on hover, and the title holds still with a white glow on hover. The Haunted word still switches you to the spooky theme, and that now holds for every account, whatever background you've saved.",
      "LOW GRAPHICS: the Graphics button in the Background picker switches between Full (the default, and how the game is meant to look) and Low. Low only switches off the most expensive blur and backdrop effects, so it's a small speed-up on slower computers. Animations, hover effects and the mouse cursor keep running in both modes.",
      "FIXED: the custom cursor no longer lags or jumps in Low mode. The site no longer switches itself to Low based on how it performs; you choose.",
      "A NOTE ON CONSOLE COMMANDS: the developer console helpers that change balances and game state only work on local development builds. Please don't try to use console commands, scripts or other tools to change your balance or results on the live site. Accounts that gain too fast or win too unusually are reviewed, and anything that's been tampered with can be reset or banned.",
    ],
  },
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

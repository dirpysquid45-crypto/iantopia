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
    date: ‘2026-09-25’,
    title: ‘Arena Mode: Battleship 1v1 & Multiplayer Polish’,
    changes: [
      ‘Battleship 1v1 joins the Arena: Place your fleet on the Taiwan Strait, then hunt enemy ships across a grid. Win by sinking all opponent vessels.’,
      ‘Arena Mode now ships with thematic music (Yaddak for the hub, Balatro for Blackjack, Koronba for Battleship), floating music controls, and sprite-rendered naval combat.’,
      ‘All Arena payouts respect your wallet cap and burn a 5% rake from the economy.’,
      ‘Mobile-responsive design brings full Arena functionality to phones and tablets.’,
    ],
  },
  {
    date: ‘2026-09-25’,
    title: ‘Arena Mode: Blackjack 1v1’,
    changes: [
      ‘A new ⚔️ Arena mode opens multiplayer real-time gaming. Start with Blackjack 1v1: enter a public lobby, auto-match with an equal bet, and play head-to-head.’,
      ‘All bets and payouts are server-authoritative and respect your wallet cap -- no sneaking past the balance limits you built up through the Tycoon.’,
      ‘A 5% rake is burned from the economy on each game (no banker house -- just disappeared coins).’,
    ],
  },
  {
    date: ‘2026-09-24’,
    title: ‘Leaderboard’,
    changes: [
      ‘A new Leaderboard page ranks players by net Strubles production per minute -- production minus upkeep, not raw balance.’,
      ‘Raw hoarding or over-building without paying upkeep won’t climb the board -- only a well-managed economy will.’,
    ],
  },
  {
    date: ‘2026-09-23’,
    title: ‘Grid Expansion’,
    changes: [
      ‘The skyline is no longer capped at 5 buildings -- a new Expand button on the Tycoon page purchases additional slots.’,
      ‘Each slot costs roughly triple the last, starting at 200,000 Strubles for the 6th -- a long-term sink for players who have outgrown the base economy.’,
    ],
  },
  {
    date: ‘2026-09-23’,
    title: ‘Building Upkeep’,
    changes: [
      ‘Every completed building now owes a daily upkeep cost (a percentage of its own permit price), auto-paid from your balance.’,
      ‘Can’t cover it? The building goes neglected -- half production -- until your balance covers the backlog, which then clears automatically. Buildings are never repossessed.’,
      ‘Taipei 101 carries the heaviest upkeep in the roster -- a real cost to weigh against its production and wallet-cap bonus.’,
    ],
  },
  {
    date: ‘2026-09-17’,
    title: ‘Wallet Cap & the Bank’,
    changes: [
      ‘Every account now has a maximum Strubles balance -- earnings past the cap don’t accrue until you spend back under it.’,
      ‘The Bank (new 🏦 button on the Tycoon page) raises that cap in purchasable levels.’,
      ‘Taipei 101 now also raises your cap (+10,000 per copy owned, up to +50,000) -- a real reason to own one beyond its production.’,
      ‘This replaces the old 8-hour offline production limit, which only applied while you were away -- the wallet cap applies everywhere, all the time.’,
    ],
  },
  {
    date: ‘2026-09-17’,
    title: ‘Currency Reform’,
    changes: [
      ‘Glorious Iantopia has stabilized its currency. Every balance was converted on a progressive curve: the first 10,000 Strubles are untouched, the next 40,000 convert at 1:5, and anything beyond 50,000 converts at 1:20.’,
      ‘A normal balance is unaffected. This targets the small number of accounts that grew far beyond what the intended economy ever supported.’,
    ],
  },
];

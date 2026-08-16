// tycoon-buildings.js
// Gameplay parameters for every building type in Iantopia Tycoon — separate
// from case-data.js's building_unlock items (which only grant ownership) the
// same way background-library.js is separate from background_unlock items.
//
// `tier` matches a window.CASE_RARITIES key so a building's drop odds and
// its in-game rarity color/label are always the same source of truth.
window.TYCOON_BUILDINGS = {
  shabby_apartment: {
    label: 'Shabby Apartment',
    tier: 'mil_spec',
    img: '/tycoon/shabby-apartment.png',
    description: "A run-down walk-up that's seen better decades. Barely pays rent, but it's honest work.",
    production: 1,       // Strubles/min once complete
    buildMinutes: 15,
    cost: 50,             // Strubles spent at placement (the "permit")
  },
  generic_building: {
    label: 'Generic Building',
    tier: 'restricted',
    img: '/tycoon/generic-building.png',
    description: 'A perfectly ordinary mid-rise. Nobody remembers its name, but the tenants pay on time.',
    production: 2,
    buildMinutes: 30,
    cost: 100,
  },
  pagoda: {
    label: 'Pagoda',
    tier: 'classified',
    img: '/tycoon/pagoda.png',
    description: "An ornate tower channeling old-world prosperity. Owning one quietly improves your luck on every Iantopia Lootbox Basic you open afterward.",
    production: 5,
    buildMinutes: 60,
    cost: 1000,
    luckBuff: true, // see lootbox.js's oddsFor() — owning these nudges odds off Common
  },
  generic_skyscraper: {
    label: 'Generic Skyscraper',
    tier: 'covert',
    img: '/tycoon/skyscraper.png',
    description: 'A gleaming corporate tower. Excellent return on investment, brutal commute for everyone inside.',
    skyscraper: true,
    production: 8,
    buildMinutes: 300,
    cost: 500,
  },
  taipei_101: {
    label: 'Taipei 101',
    tier: 'exceedingly_rare',
    img: '/tycoon/taipei-101.png',
    description: 'The crown jewel of the skyline. Owning one is basically bragging rights with a paycheck attached.',
    production: 20,
    buildMinutes: 1440,
    cost: 15000,
    prestige: true,
    skyscraper: true,
  },
};

// Rarity-ascending order — drives grid picker ordering and the case's item list.
window.TYCOON_BUILDING_ORDER = ['shabby_apartment', 'generic_building', 'pagoda', 'generic_skyscraper', 'taipei_101'];

window.TYCOON_MAX_PER_TYPE = 10;
window.TYCOON_MAX_CONCURRENT_BUILDS = 3;
window.TYCOON_OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

// Pedestrians that wander past the skyline — see tycoon.astro's spawner.
// More of the city built (buildings placed) means more people around,
// implemented as a shorter average spawn interval, not more sprites at once.
window.TYCOON_PEDESTRIANS = [
  { img: '/tycoon/chibi-gojo-walking.png', height: 64 },
  { img: '/tycoon/duck-walking.gif', height: 48 },
  { img: '/tycoon/hollowknight-walking.gif', height: 56 },
  { img: '/tycoon/skeleton-walking.gif', height: 72 },
];

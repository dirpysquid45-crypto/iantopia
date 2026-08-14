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
    production: 1,       // Strubles/min once complete
    buildMinutes: 15,
    cost: 50,             // Strubles spent at placement (the "permit")
  },
  generic_building: {
    label: 'Generic Building',
    tier: 'restricted',
    img: '/tycoon/generic-building.png',
    production: 2,
    buildMinutes: 30,
    cost: 100,
  },
  pagoda: {
    label: 'Pagoda',
    tier: 'classified',
    img: '/tycoon/pagoda.png',
    production: 5,
    buildMinutes: 60,
    cost: 1000,
  },
  generic_skyscraper: {
    label: 'Generic Skyscraper',
    tier: 'covert',
    // No dedicated skyscraper asset exists yet — reuses Generic Building's
    // art (rendered taller + tinted, see tycoon.astro) until a real one
    // lands in public/tycoon/.
    img: '/tycoon/generic-building.png',
    skyscraper: true,
    production: 8,
    buildMinutes: 300,
    cost: 500,
  },
  taipei_101: {
    label: 'Taipei 101',
    tier: 'exceedingly_rare',
    img: '/tycoon/taipei-101.png',
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

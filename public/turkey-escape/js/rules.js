// How each day plays: how fast, how far, what's in the way. Tune the game here.
// Distances are in steps. A day of 650 steps at 13 to 15 a second takes about 45 seconds;
// node tools/test-run.mjs has a robot run every day to check it can be got through.
//
// Obstacles come in three sorts: JUMP over it (swipe up), DUCK under it (swipe down), or it
// BLOCKS the lane and you must swipe around it. Clipping a jump or duck one is a stumble: the
// farmer catches up, and a second stumble while he's close gets you caught. Running into a
// blocker gets you caught straight away. Power-ups (POWERS): a pumpkin takes one hit, sneakers smash through
// anything, a magnet pulls in the corn.
export const KINDS = {
  fence: "jump", hay: "jump", puddle: "jump", crate: "jump", pumpkins: "jump", basket: "jump", pigpen: "jump",
  squash: "jump", cone: "jump", drum: "jump", sled: "jump", ice: "jump",
  line: "duck", banner: "duck", ladder: "duck", bunting: "duck", awning: "duck", sign: "duck", streamers: "duck",
  icebranch: "duck",
  tractor: "block", wagon: "block", truck: "block", wheelbarrow: "block", applecart: "block", candy: "block",
  piecart: "block", cart: "block", car: "block", float: "block", snowman: "block",
};

// Eleven days, from the Monday a week before Thanksgiving to the day itself. Each has its own
// scenery (img/sky-<id>.jpg), things in the way, and what the turkey says when it gets through
// (madeIt: its face, and one of the lines in its speech bubble; js/voices.js has them spoken).
// `caught` finishes "caught …" on the results screen; `tip` is the day card's warning.
export const DAYS = [
  {
    id: "farm", name: "MONDAY", short: "MON", place: "The Farm", caught: "on the farm", note: "10 days till Thanksgiving",
    speed: 20, speedUp: 2, length: 650, gap: [10,15], pairs: 0.6,
    obstacles: ["fence", "hay", "line", "puddle", "tractor"], props: ["tree", "tree", "scarecrow"],
    sky: [0x8fd0f0, 0xd8f0ff], hills: 0x8cc152, grass: [0x7aa840, 0x6f9c38], road: [0xb98a52, 0xae7f48],
    madeIt: { face: "turkey-phew", lines: ["WOW, I'M NOT\nGETTING COOKED!", "PHEW!\nNOT COOKED YET!", "THAT WAS\nTOO CLOSE!"] },
  },
  {
    id: "corn", name: "TUESDAY", short: "TUE", place: "The Cornfield", caught: "in the cornfield", note: "9 days till Thanksgiving",
    speed: 22, speedUp: 2, length: 700, gap: [9,14], pairs: 0.7,
    obstacles: ["hay", "crate", "banner", "line", "tractor", "wagon"], props: ["scarecrow", "scarecrow", "tree"],
    sky: [0x9cc8ec, 0xfff0c8], hills: 0xd9b44a, grass: [0xc9a640, 0xbd9a38], road: [0x9c7446, 0x926b3f],
    madeIt: { face: "turkey-yay", lines: ["STILL NOT\nSTUFFING!", "NO GRAVY\nFOR ME!", "GOBBLE GOBBLE,\nSUCKER!"] },
  },
  {
    id: "patch", name: "WEDNESDAY", short: "WED", place: "The Pumpkin Patch", caught: "in the pumpkin patch", note: "8 days till Thanksgiving",
    tip: "Watch out for wheelbarrows!",
    speed: 23, speedUp: 2, length: 700, gap: [9,13], pairs: 0.75,
    obstacles: ["pumpkins", "hay", "banner", "line", "wheelbarrow", "wagon"], props: ["scarecrow", "tree", "tree"],
    sky: [0x8fc8ee, 0xffe8c0], hills: 0x9a8a40, grass: [0x8a9a3c, 0x7f8f36], road: [0xa87a48, 0x9d7042],
    madeIt: { face: "turkey-phew", lines: ["I'M NOT A\nPUMPKIN PIE!", "OUT OF\nTHE PATCH!"] },
  },
  {
    id: "orchard", name: "THURSDAY", short: "THU", place: "The Apple Orchard", caught: "in the apple orchard", note: "7 days till Thanksgiving",
    tip: "Duck under the ladders!",
    speed: 24, speedUp: 2, length: 750, gap: [8,12], pairs: 0.8,
    obstacles: ["basket", "fence", "ladder", "line", "applecart", "tractor"], props: ["appletree", "appletree", "scarecrow"],
    sky: [0x9ad0f2, 0xe8f6ff], hills: 0x7ab048, grass: [0x6fa83c, 0x649c36], road: [0xb08650, 0xa57b49],
    madeIt: { face: "turkey-yay", lines: ["HOW DO YOU LIKE\nTHEM APPLES?", "AN APPLE A DAY\nKEEPS THE COOK\nAWAY!"] },
  },
  {
    id: "fair", name: "FRIDAY", short: "FRI", place: "The County Fair", caught: "at the county fair", note: "6 days till Thanksgiving",
    tip: "Look out for the cotton candy!",
    speed: 25, speedUp: 2, length: 750, gap: [8,12], pairs: 0.8,
    obstacles: ["pigpen", "hay", "bunting", "banner", "candy", "wagon"], props: ["tent", "tent", "tree"],
    sky: [0xf0a0a0, 0xffe0b0], hills: 0x8aa850, grass: [0x7ea644, 0x739a3d], road: [0xb4925c, 0xa98754],
    madeIt: { face: "turkey-yay", lines: ["BLUE RIBBON\nRUNNER!", "FIRST PRIZE\nTURKEY!"] },
  },
  {
    id: "market", name: "SATURDAY", short: "SAT", place: "The Farmers' Market", caught: "at the farmers' market", note: "5 days till Thanksgiving",
    tip: "Don't crash into the pie cart!",
    speed: 26, speedUp: 2, length: 800, gap: [8,11], pairs: 0.85,
    obstacles: ["squash", "crate", "awning", "banner", "piecart", "truck"], props: ["stall", "stall", "lamp"],
    sky: [0x9ccdf0, 0xfff2d0], hills: 0x9a8a70, grass: [0x8f8f86, 0x85857c], road: [0x9a8f84, 0x90857a],
    madeIt: { face: "turkey-phew", lines: ["NOT FOR SALE!", "I'M NOT ON\nTHE MENU!"] },
  },
  {
    id: "town", name: "SUNDAY", short: "SUN", place: "Into Town", caught: "in town", note: "4 days till Thanksgiving",
    speed: 26, speedUp: 2, length: 800, gap: [8,12], pairs: 0.9,
    obstacles: ["crate", "puddle", "banner", "line", "truck", "wagon"], props: ["house", "lamp"],
    sky: [0x86b8e0, 0xf6d8b8], hills: 0x7a8aa0, grass: [0x88aa55, 0x7d9e4d], road: [0x777777, 0x6d6d6d],
    madeIt: { face: "turkey-phew", lines: ["I'M SWEATING\nGRAVY HERE!", "TOO HOT.\nOVEN HOT."] },
  },
  {
    id: "lot", name: "MONDAY", short: "MON", place: "The Grocery Store", caught: "at the grocery store", note: "3 days till Thanksgiving",
    tip: "Runaway shopping carts!",
    speed: 27, speedUp: 2, length: 850, gap: [8,11], pairs: 0.9,
    obstacles: ["cone", "puddle", "sign", "banner", "cart", "car"], props: ["lamp", "lamp", "tree"],
    sky: [0x9ab4cc, 0xe0e8f0], hills: 0x8090a0, grass: [0x7d8f5a, 0x738552], road: [0x6a6a6e, 0x606064],
    madeIt: { face: "turkey-cool", lines: ["CLEAN UP,\nAISLE FIVE!", "NO SALE ON\nTHIS TURKEY!"] },
  },
  {
    id: "parade", name: "TUESDAY", short: "TUE", place: "The Parade", caught: "at the parade", note: "2 days till Thanksgiving",
    tip: "Dodge the floats!",
    speed: 28, speedUp: 2, length: 900, gap: [8,11], pairs: 0.95,
    obstacles: ["drum", "cone", "streamers", "sign", "float", "car"], props: ["lamp", "balloon", "lamp"],
    sky: [0x80c0f0, 0xd8f0ff], hills: 0x8a94a8, grass: [0x8a9a70, 0x808f68], road: [0x707078, 0x66666e],
    madeIt: { face: "turkey-yay", lines: ["THIS PARADE\nIS FOR ME!", "WAVE TO\nTHE FANS!"] },
  },
  {
    id: "snow", name: "WEDNESDAY", short: "WED", place: "The First Snow", caught: "in the snow", note: "Thanksgiving is TOMORROW!",
    tip: "Jump the ice!",
    speed: 29, speedUp: 2, length: 900, gap: [7,11], pairs: 0.95,
    obstacles: ["sled", "ice", "fence", "icebranch", "line", "snowman", "truck"], props: ["pine", "pine", "house"],
    sky: [0x3a4a80, 0x9aa8d0], hills: 0xdde6f0, grass: [0xe8eef4, 0xdce4ec], road: [0xc8ccd4, 0xbec2ca],
    madeIt: { face: "turkey-phew", lines: ["THANKSGIVING\nIS TOMORROW?!", "BRRR! STILL\nNOT COOKED!"] },
  },
  {
    id: "feast", name: "THANKSGIVING", short: "THU", place: "The Big Day", caught: "on Thanksgiving", note: "The farmer's right behind you!",
    speed: 30, speedUp: 3, length: 1000, gap: [7,11], pairs: 1, boss: true,
    obstacles: ["fence", "hay", "crate", "puddle", "line", "banner", "tractor", "truck", "wagon"], props: ["tree", "house"],
    sky: [0xf08a3c, 0xffd28a], hills: 0xa0522d, grass: [0xa9743a, 0x9d6a34], road: [0xcfa772, 0xc39b66],
    madeIt: { face: "turkey-cool", lines: ["NO OVEN FOR ME.\nPIZZA TONIGHT!"] },
  },
];

export const POINTS = {
  step: 1,         // every step run
  corn: 10,        // each ear of corn
  day: 500,        // reaching the end of a day
  pardon: 2500,    // surviving Thanksgiving
};

// Corn kernels spent to come back after a capture: the day starts again, with the score it began with.
export const REVIVE_COST = 100;
// Phones take the same days a little easier: a fingertip is slower than the arrow keys.
export function forTouch(day) {
  return { ...day, speed: day.speed * 0.85, gap: day.gap.map((g) => Math.round(g * 1.3)), pairs: day.pairs * 0.7 };
}

export const STUMBLE_MS = 11000; // the farmer stays close this long after a stumble
export const CORN_CHANCE = 0.45; // a row brings a line of corn
// Power-ups turn up in an empty lane. Each lasts this many seconds, and only on the day it's picked up.
// One at a time: picking up a new one replaces the one going.
export const POWERS = {
  pumpkin: { seconds: 12, chance: { normal: 0.015, boss: 0.07 }, says: "PUMPKIN BLAST!" },   // pops on the next bump: clears the obstacles ahead
  sneakers: { seconds: 6, chance: { normal: 0.012, boss: 0.03 }, says: "TURBO SNEAKERS!" }, // super fast, smash through anything
  magnet: { seconds: 10, chance: { normal: 0.015, boss: 0.03 }, says: "CORN MAGNET!" },      // pulls in the corn from every lane
};
export const TURBO = 1.6; // how much faster the sneakers run

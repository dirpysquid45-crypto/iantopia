// Everything the game remembers, in localStorage on this phone only.
// The browser may clear it (clearing site data, or uninstalling the app); that only costs scores.
import { DAYS } from "./rules.js";

const KEY = "turkey.v1";
const BOARD_SIZE = 10;
export const BOARD = "run"; // one high-score board: every run starts on Monday

const DEFAULTS = {
  player: null,    // { initials }: who plays on this phone
  sound: true,
  board: [],       // this phone's top 10, [{ initials, score, day, at }], best first; day 12 = pardoned
  days: DAYS.length, // how many days a run had when the board was kept
  totals: { corn: 0, runs: 0, pardons: 0 },
  cornBank: 0,     // corn kept from every run, spent on the menu for Strubles
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    cache = { ...DEFAULTS };
  }
  delete cache.outbox; // left over from when scores went online
  // A board from the four-day game can't be compared with eleven-day runs: it starts again.
  if (cache.days !== DEFAULTS.days) {
    cache.board = [];
    cache.days = DEFAULTS.days;
  }
  return cache;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked (private window): keep playing, just without saving.
  }
}

export function get(name) {
  return load()[name];
}

export function set(name, value) {
  load()[name] = value;
  persist();
}

export function setInitials(initials) {
  const data = load();
  data.player = { initials };
  persist();
}

export function board() {
  return load().board;
}

export function topScore() {
  return Math.max(0, ...load().board.map((r) => r.score));
}

// Saves a finished run. day: 1-11 for the day the farmer caught you, 12 for pardoned.
// → { rank (1-10, or 0 if it missed the board), previousTop }
export function recordRun(score, day, corn) {
  const data = load();
  const previousTop = topScore();
  const entry = { initials: data.player.initials, score, day, at: Date.now() };
  if (score > 0) {
    data.board = [...data.board, entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, BOARD_SIZE);
  }
  const t = { ...DEFAULTS.totals, ...data.totals };
  t.corn += corn;
  data.cornBank = (data.cornBank || 0) + corn;
  t.runs++;
  if (day > DEFAULTS.days) t.pardons++;
  data.totals = t;
  persist();
  return { rank: score > 0 ? data.board.indexOf(entry) + 1 : 0, previousTop };
}

export function cornBank() {
  return load().cornBank || 0;
}

export function spendCorn(amount) {
  const data = load();
  data.cornBank = Math.max(0, (data.cornBank || 0) - amount);
  persist();
  return data.cornBank;
}

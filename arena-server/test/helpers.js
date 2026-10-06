const WebSocket = require('ws');
const { createServer } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

// Short timers so timeout paths run in milliseconds, not minutes.
const FAST = { graceMs: 400, rematchMs: 500, setupMs: 700, turnMs: 450, handMs: 600 };

const OPEN = new Set();
async function closeAll() { for (const c of [...OPEN]) { OPEN.delete(c); await c(); } }
require('node:test').afterEach(closeAll);

async function startServer(opts = {}) {
  const db = opts.db || new FakeDb();
  const server = createServer({
    port: 0, host: '127.0.0.1', db, auth: FakeAuth, quiet: true,
    timing: Object.assign({}, FAST, opts.timing), authTimeoutMs: opts.authTimeoutMs || 10000,
    rate: opts.rate || { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 }, heartbeatMs: opts.heartbeatMs || 60000, makeDeck: opts.makeDeck,
  });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  const url = `ws://127.0.0.1:${server.address().port}`;
  const close = () => { OPEN.delete(close); return server.close(); };
  OPEN.add(close);
  return { server, db, url, manager: server.manager, close };
}

// A recording client: every message is kept, and waitFor() can look back
// through them, so a test never races a message that arrived early.
class Client {
  constructor(url, headers, wsOpts = {}) {
    this.log = [];
    this.waiters = [];
    this.closed = null;
    this.ws = new WebSocket(url, Object.assign({ headers }, wsOpts));
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      this.log.push(msg);
      this.waiters = this.waiters.filter((w) => !w.try(msg));
    });
    this.ws.on('close', (code, reason) => { this.closed = { code, reason: String(reason) }; this.waiters.forEach((w) => w.closed()); });
    this.opened = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
  }
  send(msg) { this.ws.send(JSON.stringify(msg)); }
  raw(str) { this.ws.send(str); }
  close() { try { this.ws.close(); } catch {} }
  kill() { try { this.ws.terminate(); } catch {} }
  has(pred) { return this.log.some(pred); }
  last(type) { return [...this.log].reverse().find((m) => m.type === type); }
  all(type) { return this.log.filter((m) => m.type === type); }
  clear() { this.log.length = 0; }

  // Resolves with the first message (past or future) that matches.
  waitFor(match, ms = 2000, from = 0) {
    const pred = typeof match === 'string' ? (m) => m.type === match : match;
    const hit = this.log.slice(from).find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ${typeof match === 'string' ? match : 'predicate'}; got: ${this.log.map((m) => m.type).join(', ')}`)), ms);
      this.waiters.push({
        try: (m) => { if (pred(m)) { clearTimeout(t); resolve(m); return true; } return false; },
        closed: () => { clearTimeout(t); reject(new Error('socket closed while waiting; close=' + JSON.stringify(this.closed))); },
      });
    });
  }
}

async function connect(url, headers, wsOpts) {
  const c = new Client(url, headers, wsOpts);
  await c.opened;
  return c;
}
async function asUser(url, uid, name) {
  const c = await connect(url);
  c.send({ type: 'auth', token: name ? `tok:${uid}:${name}` : `tok:${uid}` });
  await c.waitFor('auth_ok');
  return c;
}
async function asGuest(url, name, guestId) {
  const c = await connect(url);
  c.send({ type: 'auth_guest', name, guestId });
  await c.waitFor('auth_ok');
  return c;
}

// Two clients opening matching lobbies; resolves once both have game_start.
async function pair(a, b, game, bet = 0) {
  a.send({ type: 'join_queue', bet, gameType: game });
  await a.waitFor('status');
  b.send({ type: 'join_queue', bet, gameType: game });
  await Promise.all([a.waitFor('game_start'), b.waitFor('game_start')]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A legal, well-spread fleet, and a second one, for known-position games.
const FLEET_A = [
  { name: 'Carrier', x: 0, y: 0, horizontal: true },
  { name: 'Battleship', x: 0, y: 2, horizontal: true },
  { name: 'Cruiser', x: 0, y: 4, horizontal: true },
  { name: 'Submarine', x: 0, y: 6, horizontal: true },
  { name: 'Destroyer', x: 0, y: 8, horizontal: true },
];
const FLEET_B = [
  { name: 'Carrier', x: 5, y: 0, horizontal: false },
  { name: 'Battleship', x: 6, y: 0, horizontal: false },
  { name: 'Cruiser', x: 7, y: 0, horizontal: false },
  { name: 'Submarine', x: 8, y: 0, horizontal: false },
  { name: 'Destroyer', x: 9, y: 0, horizontal: false },
];
const SIZES = { Carrier: 5, Battleship: 4, Cruiser: 3, Submarine: 3, Destroyer: 2 };
const cellsOf = (fleet) => fleet.flatMap((s) => Array.from({ length: SIZES[s.name] }, (_, i) => [s.horizontal ? s.x + i : s.x, s.horizontal ? s.y : s.y + i]));

// Plays a whole Battleship game to its end with a chosen winner. The winner
// shoots straight at the loser's ships; the loser fires at open water.
async function playBattleship(clients, fleets, winner) {
  const loser = 1 - winner;
  clients.forEach((c, i) => c.send({ type: 'place_ships', ships: fleets[i] }));
  await Promise.all(clients.map((c) => c.waitFor('battle_start')));
  const winnerShots = cellsOf(fleets[loser]);
  const occupied = new Set(cellsOf(fleets[winner]).map(([x, y]) => x + ',' + y));
  const loserShots = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (!occupied.has(x + ',' + y)) loserShots.push([x, y]);
  let turn = clients[0].last('battle_start').currentTurn;
  let seen = 0;
  while (!clients[0].has((m) => m.type === 'game_result')) {
    const [x, y] = (turn === winner ? winnerShots : loserShots).shift();
    clients[turn].send({ type: 'action', action: 'fire', x, y });
    seen++;
    await Promise.all(clients.map((c) => c.waitFor((m) => m.type === 'fire_result', 2000, 0).then(() => {
      return new Promise((res, rej) => { const t = Date.now(); const iv = setInterval(() => { if (c.all('fire_result').length >= seen) { clearInterval(iv); res(); } else if (Date.now() - t > 2000) { clearInterval(iv); rej(new Error('fire_result #' + seen + ' never arrived')); } }, 5); });
    })));
    const lastFire = clients[0].last('fire_result');
    if (lastFire.state === 'result') break;
    turn = lastFire.currentTurn;
  }
  await Promise.all(clients.map((c) => c.waitFor('game_result')));
}

// Cards are dealt off the END of the deck, so list them in dealing order:
// player 0's two cards, then player 1's two, then any further draws.
function fixedDeck(p0, p1, extra = []) {
  const card = (c) => ({ v: c.slice(0, -1), s: c.slice(-1) });
  return [...p0, ...p1, ...extra].map(card).reverse();
}

module.exports = { playBattleship, fixedDeck, startServer, connect, asUser, asGuest, pair, sleep, FLEET_A, FLEET_B, cellsOf, Client, FAST };

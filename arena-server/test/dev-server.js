// Runs the real arena server against the in-memory fakes, for local browser
// testing:   node test/dev-server.js          (PORT=4001, control on PORT+1)
//
// Control endpoints (test-only, never part of the real server):
//   GET /seed?uid=u1&balance=5000      create/overwrite a signed-in test user
//   GET /balance?uid=u1                read what the server thinks they have
const http = require('http');
const { createServer } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

const PORT = Number(process.env.PORT || 4001);
const db = new FakeDb();
const timing = process.env.ARENA_TIMING ? JSON.parse(process.env.ARENA_TIMING) : undefined;
const server = createServer({ port: PORT, db, auth: FakeAuth, timing, quiet: !process.env.VERBOSE, admins: { uids: ['tester'], emails: [] } });

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/seed') {
    db.seed(url.searchParams.get('uid'), { strubles_balance_v1: String(url.searchParams.get('balance') || 0) });
    res.end('{"ok":true}');
  } else if (url.pathname === '/balance') {
    res.end(JSON.stringify({ balance: db.balance(url.searchParams.get('uid')) }));
  } else if (url.pathname === '/stats') {
    res.end(JSON.stringify({ tables: server.manager.tables.size, queue: server.manager.queue.length }));
  } else { res.statusCode = 404; res.end('{}'); }
}).listen(PORT + 1, () => console.log(`[dev] arena on :${PORT}, control on :${PORT + 1}`));

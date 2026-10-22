// Admin connections: the big player list goes only to admins who asked for it,
// so one account action does not push a multi-hundred-KB list to every admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const Manager = require('../manager');
const { FakeDb } = require('./fakes');

function fakeWs() {
  const sent = [];
  return { readyState: 1, sent, send: (d) => sent.push(JSON.parse(d)) };
}

test('a player-list refresh is sent only to admins who opened the players list', async () => {
  const accounts = { subscribe() {}, listPlayers: async () => [{ uid: 'p1' }], feed: [] };
  const m = new Manager(new FakeDb(), null, { accounts });
  const asked = fakeWs(), idle = fakeWs(), player = fakeWs();
  m.connections.set('a1', { userId: 'admin1', ws: asked, admin: true, wantsPlayers: true });
  m.connections.set('a2', { userId: 'admin2', ws: idle, admin: true });
  m.connections.set('p1', { userId: 'u1', ws: player, admin: false });
  await m.broadcastPlayers();
  assert.equal(asked.sent.filter((x) => x.type === 'account_list').length, 1);
  assert.equal(idle.sent.filter((x) => x.type === 'account_list').length, 0, 'not sent to an admin who never asked');
  assert.equal(player.sent.length, 0, 'never sent to a player');
});

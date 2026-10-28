// The owner's dev endpoint (/owner/check): only a verified sign-in with the owner's email.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, isOwnerToken } = require('../core');
const { FakeDb, FakeAuth } = require('./fakes');

const OWNER = 'dirpysquid45@gmail.com';

async function start(options = {}, auth = FakeAuth) {
  const server = createServer({ port: 0, host: '127.0.0.1', db: new FakeDb(), auth, quiet: true, admins: { uids: [], emails: [] }, ownerEmail: OWNER, ...options, rate: { maxMessagesPerSec: 10000, maxConnectionsPerIP: 10000 } });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.on('listening', r)));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const bearer = (token) => (token === null ? {} : { Authorization: 'Bearer ' + token });

test('the owner, signed in with the owner email in any case, gets through', async () => {
  const { server, base } = await start();
  try {
    const r = await fetch(base + '/owner/check', { headers: bearer('tok:Dirpysquid45@GMAIL.com') });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { owner: true });
  } finally { await server.close(); }
});

test('anyone else is refused, with a 403 that says nothing more', async () => {
  const { server, base } = await start();
  try {
    const r = await fetch(base + '/owner/check', { headers: bearer('tok:someone@example.com') });
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { error: 'not_owner' });
  } finally { await server.close(); }
});

test('no sign-in, and a bad token, are refused', async () => {
  const { server, base } = await start();
  try {
    assert.equal((await fetch(base + '/owner/check', { headers: bearer(null) })).status, 403);
    assert.equal((await fetch(base + '/owner/check', { headers: bearer('garbage') })).status, 403);
  } finally { await server.close(); }
});

test('the route is GET only', async () => {
  const { server, base } = await start();
  try {
    const r = await fetch(base + '/owner/check', { method: 'POST', headers: bearer('tok:' + OWNER) });
    assert.equal(r.status, 405);
  } finally { await server.close(); }
});

test('with no owner email configured, nobody is the owner', async () => {
  const { server, base } = await start({ ownerEmail: '' });
  try {
    assert.equal((await fetch(base + '/owner/check', { headers: bearer('tok:' + OWNER) })).status, 403);
  } finally { await server.close(); }
});

test('an email the sign-in has not verified is refused', async () => {
  const unverified = { verifyIdToken: async () => ({ uid: 'x', email: OWNER, email_verified: false }) };
  const { server, base } = await start({}, unverified);
  try {
    assert.equal((await fetch(base + '/owner/check', { headers: bearer('any') })).status, 403);
  } finally { await server.close(); }
});

test('isOwnerToken needs a verified email that matches, lowercased', () => {
  assert.equal(isOwnerToken({ email: 'DirPySquid45@gmail.com', email_verified: true }, OWNER), true);
  assert.equal(isOwnerToken({ email: OWNER }, OWNER), false, 'verification must be stated');
  assert.equal(isOwnerToken({ email: OWNER, email_verified: true }, ''), false, 'no owner configured');
  assert.equal(isOwnerToken({ uid: OWNER, email_verified: true }, OWNER), false, 'a uid is not an email');
  assert.equal(isOwnerToken(null, OWNER), false);
});

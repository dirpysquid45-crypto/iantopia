#!/usr/bin/env node
// Points iantopia.com at either the Oracle VM or the home server (qasim) by
// moving the DNS records to that machine's Cloudflare Tunnel. Only one tunnel
// answers a hostname at a time, so this is the switch.
//
// Usage:
//   CF_API_TOKEN=... CF_ZONE_ID=... node deploy/switch-origin.mjs status
//   CF_API_TOKEN=... CF_ZONE_ID=... node deploy/switch-origin.mjs vm   --yes
//   CF_API_TOKEN=... CF_ZONE_ID=... node deploy/switch-origin.mjs home --yes
//
// The token needs only Zone > DNS > Edit on the iantopia.com zone. Keep it in
// your shell or Keychain, never in this repo. Without --yes, a switch prints
// what it would change and does nothing.

const TUNNELS = {
  vm: 'b29805f0-3a04-4491-a6f4-7f1509a13328',   // iantopia-vm (Oracle, arena-1)
  home: '9aaaa12c-49f4-47f2-a2fe-fd3f2be53843', // qasim tunnel
};

// Hostnames the switch moves together. Add transcripts.iantopia.com here once
// the VM has its nginx block and tunnel route for it.
const HOSTNAMES = ['iantopia.com', 'www.iantopia.com'];

const token = process.env.CF_API_TOKEN;
const zone = process.env.CF_ZONE_ID;
const [command, flag] = process.argv.slice(2);

function die(message) {
  console.error(message);
  process.exit(1);
}

if (!token || !zone) die('Set CF_API_TOKEN and CF_ZONE_ID first (see the header of this file).');
if (!['status', 'vm', 'home'].includes(command)) die('Usage: switch-origin.mjs status | vm | home [--yes]');

const API = `https://api.cloudflare.com/client/v4/zones/${zone}/dns_records`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, headers });
  const body = await res.json();
  if (!body.success) die(`Cloudflare error: ${JSON.stringify(body.errors)}`);
  return body.result;
}

function activeName(content) {
  for (const [name, id] of Object.entries(TUNNELS)) {
    if (content === `${id}.cfargotunnel.com`) return name;
  }
  return content || '(empty)';
}

const records = [];
for (const name of HOSTNAMES) {
  const found = await call(`${API}?type=CNAME&name=${encodeURIComponent(name)}`);
  if (found.length === 0) die(`No CNAME record found for ${name}. Create it in the dashboard first.`);
  records.push(found[0]);
}

if (command === 'status') {
  for (const r of records) console.log(`${r.name}  ->  ${activeName(r.content)}  (proxied: ${r.proxied})`);
  process.exit(0);
}

const target = `${TUNNELS[command]}.cfargotunnel.com`;
const changes = records.filter((r) => r.content !== target);

if (changes.length === 0) {
  console.log(`Already pointing at ${command}. Nothing to change.`);
  process.exit(0);
}

for (const r of changes) {
  console.log(`${r.name}: ${activeName(r.content)} -> ${command}`);
}

if (flag !== '--yes') {
  console.log('\nDry run. Add --yes to make this change.');
  process.exit(0);
}

for (const r of changes) {
  await call(`${API}/${r.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content: target, proxied: true }),
  });
}
console.log(`Done. Traffic moves to ${command} within a minute or two.`);

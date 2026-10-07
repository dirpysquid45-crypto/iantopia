# Arena Server (Iantopia WebSocket multiplayer)

A Node.js WebSocket server for real-time 1v1 Blackjack and Battleship on iantopia.com, plus the suggestion box. Signed-in players can play for Strubles; guests can play friendly (0 Strubles) games.

## Setup

### Local Development

```bash
cd arena-server
npm install
# Generate or copy service-account-key.json
npm start
```

Server listens on `ws://localhost:4001` in dev.

### Production Deployment on Qasim

1. **Generate Firebase service account key** (same as admin-scripts):
   - Firebase Console → iantopia project → Project Settings → Service Accounts
   - Generate new private key
   - Save as `arena-server/service-account-key.json`

2. **Build and run container**:
   ```bash
   docker compose -f arena-server/docker-compose.prod.yml up -d --build
   ```

3. **Configure Cloudflare Tunnel** (on Qasim host):
   Add to cloudflared config:
   ```yaml
   ingress:
     - hostname: arena.iantopia.com
       service: http://127.0.0.1:4001
   ```

4. **DNS**: Create `arena.iantopia.com` CNAME record pointing to your tunnel.

5. **(Optional) Cloudflare Access**:
   - Enable in Zero Trust dashboard
   - Add authentication policy (e.g., Google Workspace) in front of `arena.iantopia.com`

## API

### Auth
```
Client → {type: 'auth', token: <firebase-id-token>}     // signed in: stakes allowed
Client → {type: 'auth_guest', guestId, name}             // guest: friendly games only
Server → {type: 'auth_ok', sessionId, guest, name}
```

### Matchmaking and play (both games)
```
Client → {type: 'join_queue', bet: <0..1,000,000>, gameType: 'blackjack' | 'battleship'}   // bet 0 = friendly
Client → {type: 'match_bet', queueId}                    // take someone's open lobby
Server → {type: 'game_start', ...}   {type: 'game_update' | 'fire_result' | ...}
Server → {type: 'game_result', results, ...}   {type: 'balance_update', balance}
```
Blackjack never sends the opponent's cards before the hand is settled, only how many they hold.

### Suggestions
```
Client → {type: 'suggest', text, page}                   // signed in, 10s cooldown
Admin  → {type: 'suggestions_list'}  {type: 'suggestion_set', id, status, hideName}  {type: 'suggestion_delete', id}
Anyone → {type: 'suggestions_public'}                    // only posted ones, no uid
```
Admins are the accounts in `ADMIN_EMAILS` / `ADMIN_UIDS` (see `docker-compose.prod.yml`).

## Rate Limiting

- Per-IP connection cap and per-connection message rate (see `rate-limit.js`; real client IP comes from `X-Real-IP` behind nginx)
- Exceeding a limit gets a `rate_limited` error or a closed socket

## Modules

- `server.js` — production entry: wires Firebase to `core.js`
- `core.js` — WebSocket listener, auth, heartbeat, per-connection message ordering (testable)
- `manager.js` — queue, tables, reconnection, suggestions
- `game-base.js` — shared stake handling, disconnect grace, rematch window
- `blackjack.js`, `battleship.js` — the games
- `balance.js` — Firestore-authoritative balances: transactional deduct / payout / refund
- `rate-limit.js` — per-IP and per-connection limits

## Testing

```bash
cd arena-server && npm test
```

Runs against an in-memory fake Firestore and fake auth (`test/fakes.js`), so it needs no
network or credentials. `node test/dev-server.js` starts the same fake-backed server on
port 4001 for browser testing.

## Architecture Notes

- **Server-authoritative**: stakes, payouts (5% rake on staked games) and refunds are Firestore transactions; clients only display
- **Shared engine**: `public/blackjack-engine.js` is used by both the browser and the server
- **Isolated container**: runs separately from the main nginx/Astro stack, bound to localhost, non-root user

# Arena Server (Iantopia WebSocket Blackjack 1v1)

A Node.js WebSocket server for real-time multiplayer Blackjack 1v1 on iantopia.com.

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

### Auth Flow
```
Client → {type: 'auth', token: <firebase-id-token>}
Server → {type: 'auth_ok', sessionId: <id>}
```

### Gameplay
```
Client → {type: 'join_queue', bet: <number>}
Server → {type: 'status', status: 'queued'}
Server → {type: 'game_start', hands: [...]}
Client → {type: 'action', action: 'hit' | 'stand'}
Server → {type: 'game_update', hands: [...], done: [...]}
Server → {type: 'game_result', results: [...], hands: [...]}
Server → {type: 'balance_update', balance: <number>}
```

## Rate Limiting

- Max 5 concurrent WebSocket connections per IP
- Max 10 messages/sec per connection
- Exceeding limits drops the message (no response sent)

## Modules

- `server.js` — WebSocket listener, auth, connection/message routing
- `manager.js` — Queue + table lifecycle, matchmaking
- `blackjack.js` — Single-table game logic (uses `public/blackjack-engine.js`)
- `balance.js` — Firestore-authoritative balance/payout (never trusts client)
- `rate-limit.js` — Per-IP and per-connection rate limiting

## Testing

```bash
# From repo root
node arena-server/server.js &
# In another terminal, run a local WebSocket test client
```

## Architecture Notes

- **Server-authoritative**: All balance changes read/write directly to Firestore via `firebase-admin`; client balance updates are broadcast-only
- **Shared engine**: `public/blackjack-engine.js` is required by both browser and server for deck/hand logic
- **Isolated container**: runs separately from main nginx/Astro stack, bound to localhost-only, non-root user
- **No external deps beyond ws + firebase-admin**: minimal surface area for security

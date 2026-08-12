# Iantopia

A casino-themed personal website with games, collectibles, and interactive elements. Built with Astro (static site generation) for fast performance and low bandwidth.

## Features

### 🎰 Lootbox System

CS2-style rarity tiers (Mil-Spec → Exceedingly Rare). Open cases to collect:

- **Music unlocks** — swap the homepage/game background tracks
- **Background videos** — swap homepage/game visuals
- **Cursor skins** — customize the pointer with image or emoji cursors
- **Collectible items** — draggable toys on the homepage (Stinky Sock, Panda Express, the Display Shelf, the Smiski Blind Box, etc.) — every draggable is real loot now, nothing is free/always-on
- **Badges & power-ups** — cosmetic collectibles

All systems prevent duplicate unlocks — once owned, an item leaves the available loot pool.

### 🃏 Blackjack Game

Classic blackjack against the house, with:

- Bet sizing (1–100,000 Strubles)
- Hit/Stand/Double Down mechanics
- Real card shuffling per hand

### 📱 Homepage

- **Draggable desktop items** — rearrange won collectibles with click-and-drag or multi-select (shift-click)
- **Explicit remove buttons** — stash items back into inventory with a close (×) button
- **Music player** — pick a background track from unlocked music
- **Background switcher** — choose among unlocked visual themes
- **Cursor picker** — equip unlocked cursor skins
- **Google Sign-In** — save progress across devices (see [Cloud Sync](#cloud-sync-publiccloud-syncjs) below)
- **"Never Getting Done" joke page** — a commitment device in emoji

### 🎬 YouTube Transcript Downloader

A standalone app for downloading YouTube transcripts, videos, and audio. See `youtube-transcript-app/README.md`.

## Quick Start

### Dev

```bash
npm install
npm run dev
```

Starts Astro dev server on `http://localhost:5500` with hot reload.

### Build

```bash
npm run build
```

Generates static HTML/CSS/JS in `dist/`.

### Serve Built Site

```bash
npx astro preview
```

Serves `dist/` locally on `http://localhost:4321`.

## Project Structure

```text
iantopia/
├── src/
│   ├── pages/
│   │   ├── index.astro           # Homepage (draggable items, music/bg/cursor pickers)
│   │   ├── blackjack.astro       # Blackjack game
│   │   ├── lootbox.astro         # Case opening UI + reveal animation
│   │   ├── never.astro           # "Is Iantopia Done Yet?" joke page
│   │   └── alternate-ending.astro # Unlockable secret page
│   ├── components/               # Astro components (minimal use; mostly inline scripts)
│   └── layouts/                  # Global layout wrapper
├── public/
│   ├── case-data.js              # Loot pool + case definitions + rarity tiers
│   ├── lootbox.js                # Rolling engine (tier → rarity → item)
│   ├── desktop-items.js          # Drag-and-drop + multi-select logic
│   ├── cursor.js                 # Canvas custom cursor renderer
│   ├── cursor-library.js         # Cursor definitions (image + emoji)
│   ├── music-library.js          # Unlockable music tracks
│   ├── music-position.js         # Resumes a track's playback position across page loads
│   ├── background-library.js     # Unlockable video/image backgrounds
│   ├── strubles.js               # Currency getter/setter (localStorage)
│   ├── pickers.js                # Shared music/background/cursor picker UI (blackjack, alternate-ending)
│   ├── cloud-sync.js             # Google Sign-In + Firestore progress sync
│   ├── assets/
│   │   ├── items/                # Collectible item PNGs (sock, panda, license, shelf, blind box, etc.)
│   │   ├── badges/               # Badge PNGs (trophy, etc.)
│   │   ├── decorations/          # Decoration art (display shelf, blind box — now real loot, not static)
│   │   ├── icons/                # UI icons (Google logo, etc.)
│   │   └── casino/               # Card, chip, table graphics
│   ├── audio/
│   │   └── sfx/                  # Click sound effects (hamood, etc.)
│   ├── video/                    # Background video GIFs + MP4s
│   └── cursors/                  # Cursor PNG files
└── youtube-transcript-app/       # Separate webapp (Astro + FastAPI)
```

## Key Systems

### Loot Pool (`public/case-data.js`)

Master item registry. Each item has:

- `label` — display name
- `tier` — rarity level (mil_spec / restricted / classified / covert / exceedingly_rare)
- `type` — grant type (item / badge / music_unlock / background_unlock / cursor_unlock / action)
- `draggable` (optional) — if true, the item becomes a toy on the homepage after unlock
- `pixelated` (optional) — if true, rendered with `image-rendering: pixelated` for pixel art
- `img` or `emoji` — visual (real asset path or Unicode emoji)

**Rarity odds** (default across all cases):

- **Mil-Spec (blue):** 65% — common flavour collectibles
- **Restricted (purple):** 22% — cosmetics & badges
- **Classified (pink):** 9% — mid-tier unlocks
- **Covert (red):** 3.2% — rare cosmetics
- **Exceedingly Rare (gold):** 0.8% — legendaries (secret pages, crown jewel music, etc.)

Cases can override odds; `starter`, `signal`, and `vault` cases each have progressively rarer curves.

### Rolling Engine (`public/lootbox.js`)

CS2-style two-stage roll:

1. **Tier roll** — pick a rarity tier by chance
2. **Item roll** — pick uniformly at random from items in that tier

**No duplicate items** — ownership-aware rolling ensures you can't get an item you already own (with fallback logic that guarantees a drop every time).

### Desktop Items (`public/desktop-items.js`)

Draggable toys that appear on the homepage.

- **Single-select:** Click an item to select it (hover-visible remove button)
- **Multi-select:** Shift-click to add/remove items from the selection
- **Drag one:** Moves only that item
- **Drag multiple:** All selected items move together, maintaining their relative positions
- **Drop on chest:** Stash all dragged items back into inventory
- **Escape key:** Clears selection
- **Click outside:** Clears selection

**Position persistence** — all positions stored in `localStorage` (`desktop_items_v1`).

### Cloud Sync (`public/cloud-sync.js`)

Google Sign-In (via Firebase Auth) + cross-device progress sync (via Firestore).

- Sign-in only requests identity (name/email/photo) — no other Google API access is ever requested
- Firestore rules restrict each user's document (`/users/{uid}`) to that user only
- A fixed set of localStorage keys are mirrored to Firestore on sign-in — see the `SYNC_KEYS` list in the file for exactly what syncs (inventory, currency, unlocks, cosmetic picks, desktop layout). Device-local preferences (volume, exact playback position) are deliberately excluded
- Sync triggers off the app's existing custom events (`inventory:changed`, `strubles:change`, etc.), plus a periodic safety-net interval and a `beforeunload` flush for state changes that don't dispatch an event
- Pulling remote state does a full page reload rather than live-patching already-initialized page state, since every page already treats localStorage as load-time truth

**Firebase config is public by design** — the `apiKey`/`projectId`/etc. in `cloud-sync.js` aren't secrets; access control is entirely enforced server-side by the Firestore security rules, not by hiding this config.

## Deployment

This site is **static** — no server required. Build to `dist/` and serve via:

- **Local:** `npx astro preview`
- **Netlify / Vercel / GitHub Pages** — one-click deploy from `dist/`
- **Qasim (home server):** `dist/` is served by the nginx container defined in `youtube-transcript-app/docker-compose.prod.yml`, reached via a Cloudflare Tunnel configured directly on the host

## Development Tips

### Hot Reload

Astro dev server watches `src/` and `public/` for changes. No manual rebuild needed.

### Script Organization

Most logic lives in `public/*.js` files:

- These are **not bundled** — they load as-is in the browser
- Astro pages load them with `<script is:inline src="/path.js"></script>`
- **Important:** inline scripts execute synchronously in DOM order — if a script needs an element, that element must be in the DOM before the script tag

### Styling

- **Scoped CSS** in Astro components (default)
- **Global CSS** tagged with `is:global` in page `<style>` blocks
- **Key pattern:** CSS rules injected into the DOM (e.g., `.desktop-item` added via `createElement`) need `is:global` to apply, since scoped styles only match elements in the source HTML

### Cache Busting

Script tags use `?v=N` query strings to break browser cache on updates:

```astro
<script is:inline src="/case-data.js?v=2"></script>
```

Increment the version number whenever the script changes.

## Troubleshooting

**Items not appearing on homepage?**

1. Check browser console for errors
2. Verify `case-data.js` and `desktop-items.js` are loading (Network tab)
3. Confirm localStorage has `desktop_items_v1` key with item IDs

**Music/backgrounds not showing in picker?**

1. Verify unlock exists in inventory (open a case, check Inventory modal)
2. Check `music-library.js` / `background-library.js` for the key
3. Confirm the asset file exists (e.g., `/video/tokyo.gif`)

**Lootbox reveals look broken?**

1. Image upscaling is handled by CSS (`width: fixed; height: auto; object-fit: contain`)
2. If pixelated items look soft, add `image-rendering: pixelated` to `case-data.js` entry
3. Non-square source images are centered with transparent padding (use sharp for this; see build scripts)

**Draggable items not moving?**

1. Check `desktop-items-v1` localStorage key is not corrupted
2. Verify item has `draggable: true` in `case-data.js`
3. Confirm `.desktop-item-wrap` CSS is loaded (inspect element)

## License

Personal project. Use at your own risk.

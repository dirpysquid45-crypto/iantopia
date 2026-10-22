# Mahjong Solitaire (mah)

Upstream: https://github.com/ffalt/mah (MIT, copyright 2016 ffalt)
Upstream commit: 51154f2ecb21ced1c56a0a142f8885b633e31d5e

`public/mah/` is the production build of that commit, built with
`ng build --configuration production --aot --base-href "/mah/"`
(Angular 22, Node 26). The license is in `public/mah/LICENSE.txt`.

Iantopia's changes are in `patch-mah.diff` (text files only; the binary assets
are listed below):

- A won board posts `{ type: 'mah-solved' }` to its parent page (same origin),
  which `src/pages/solitaire.astro` uses to pay Strubles.
- Pixel font (Press Start 2P) for the game's text.
- Bamboo panel as the background (`src/assets/bg/bamboo.jpg`, from
  Bamboo-panel.jpg), with black text that has a white glow.
- Background music that cycles through three tracks while a game runs
  (`src/assets/music/`: avatars-love.mp3, fei-yu-yi-jian-mei.mp3,
  ninjago-overture.mp3, all 128 kbps), with a music button and a volume slider
  in the bottom menu, saved in localStorage as `mah_music_volume`. Music is on
  by default.
- Sound effects added for an Oops on a wrong pick and a card sound on a match
  (`src/assets/sfx/`). The game's own synthesized sounds are still there.

To rebuild: clone upstream at the commit above, apply the patch with
`git apply patch-mah-solved.diff`, run `npm ci`, then the build command above,
and copy `dist/` into `public/mah/`.

Later changes (also in patch-mah.diff): the music starts with each game; the Oops sound
is removed; each hint is counted and reported with the solve (the page pays 10% less per
hint); a back link to Puzzles sits in the bottom-left; the welcome panel uses the wooden
sign (src/assets/bg/wood-sign.jpg); fullscreen keeps the bamboo backdrop; the top and
bottom bars are a lighter gradient.

Daily and board changes (Oct 22, 2026): the daily challenge is on in this build (`daily: true` in the
build config). The other layouts stay locked until today's daily is won, and the daily tab is the only
option until then. The board no longer rotates to portrait, so tiles stay upright on narrow or tall
windows. The rotate-board and show-daily settings are removed. The build config for this is a local
`custom-build-config.json` with `"daily": true` (the `.dist` file is the template).

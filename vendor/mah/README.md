# Mahjong Solitaire (mah)

Upstream: https://github.com/ffalt/mah (MIT, copyright 2016 ffalt)
Upstream commit: 51154f2ecb21ced1c56a0a142f8885b633e31d5e

`public/mah/` is the production build of that commit, built with
`ng build --configuration production --aot --base-href "/mah/"`
(Angular 22, Node 26). The license is in `public/mah/LICENSE.txt`.

Iantopia's only change is in `patch-mah-solved.diff`: when a board is won, the
game posts `{ type: 'mah-solved' }` to its parent page (same origin), which
`src/pages/solitaire.astro` uses to pay Strubles.

To rebuild: clone upstream at the commit above, apply the patch with
`git apply patch-mah-solved.diff`, run `npm ci`, then the build command above,
and copy `dist/` into `public/mah/`.

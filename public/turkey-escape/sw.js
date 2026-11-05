// The service worker: on the first visit it stores every file of the game on the phone, and from
// then on it answers from that copy, so the game starts with no internet at all.
// VERSION must change whenever any file changes; the next online visit then fetches the new copy.
// Amplify does that on every release (amplify.yml stamps in the commit); "dev" is for local runs.
// Every file the game needs must be in FILES, new pictures in img/ too, or it won't work offline.
const VERSION = "turkey-dev";
const FILES = [
  "img/revenge-turkey.gif",
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "vendor/phaser.min.js",
  "js/audio.js",
  "js/gestures.js",
  "js/install.js",
  "js/main.js",
  "js/rules.js",
  "js/storage.js",
  "js/textures.js",
  "js/ui.js",
  "js/update.js",
  "js/version.js",
  "js/voices.js",
  "js/scenes/BoardScene.js",
  "js/scenes/BootScene.js",
  "js/scenes/DayScene.js",
  "js/scenes/NameScene.js",
  "js/scenes/PauseScene.js",
  "js/scenes/PlayScene.js",
  "js/scenes/ResultsScene.js",
  "js/scenes/TitleScene.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "voices/farmer-caught.mp3",
  "voices/farmer-close-0.mp3",
  "voices/farmer-close-1.mp3",
  "voices/farmer-close-2.mp3",
  "voices/farmer-day-corn.mp3",
  "voices/farmer-day-fair.mp3",
  "voices/farmer-day-farm.mp3",
  "voices/farmer-day-feast.mp3",
  "voices/farmer-day-lot.mp3",
  "voices/farmer-day-market.mp3",
  "voices/farmer-day-orchard.mp3",
  "voices/farmer-day-parade.mp3",
  "voices/farmer-day-patch.mp3",
  "voices/farmer-day-snow.mp3",
  "voices/farmer-day-town.mp3",
  "voices/turkey-made-corn-0.mp3",
  "voices/turkey-made-corn-1.mp3",
  "voices/turkey-made-corn-2.mp3",
  "voices/turkey-made-fair-0.mp3",
  "voices/turkey-made-fair-1.mp3",
  "voices/turkey-made-farm-0.mp3",
  "voices/turkey-made-farm-1.mp3",
  "voices/turkey-made-farm-2.mp3",
  "voices/turkey-made-feast-0.mp3",
  "voices/turkey-made-lot-0.mp3",
  "voices/turkey-made-lot-1.mp3",
  "voices/turkey-made-market-0.mp3",
  "voices/turkey-made-market-1.mp3",
  "voices/turkey-made-orchard-0.mp3",
  "voices/turkey-made-orchard-1.mp3",
  "voices/turkey-made-parade-0.mp3",
  "voices/turkey-made-parade-1.mp3",
  "voices/turkey-made-patch-0.mp3",
  "voices/turkey-made-patch-1.mp3",
  "voices/turkey-made-snow-0.mp3",
  "voices/turkey-made-snow-1.mp3",
  "voices/turkey-made-town-0.mp3",
  "voices/turkey-made-town-1.mp3",
  "voices/turkey-magnet.mp3",
  "voices/turkey-pumpkin.mp3",
  "voices/turkey-sneakers.mp3",
  // the cartoon art (img/): add each new picture here
  "img/banner.png", "img/corn.png", "img/crate.png", "img/farmer-empty.png", "img/farmer-front.png", "img/farmer.png",
  "img/fence.png", "img/hay.png", "img/house.png", "img/lamp.png", "img/lid.png", "img/magnet.png", "img/sneaker.png", "img/sneakers.png", "img/line.png",
  "img/puddle.png", "img/pumpkin.png", "img/scarecrow.png", "img/sky-corn.jpg", "img/sky-farm.jpg",
  "img/sky-feast.jpg", "img/sky-town.jpg", "img/tractor.png", "img/tree.png", "img/truck.png",
  "img/turkey.png", "img/turkey-scared.png", "img/turkey-phew.png", "img/turkey-yay.png", "img/turkey-cool.png", "img/wagon.png",
  // the later days
  "img/pumpkins.png", "img/wheelbarrow.png", "img/basket.png", "img/ladder.png", "img/applecart.png", "img/appletree.png",
  "img/pigpen.png", "img/bunting.png", "img/candy.png", "img/tent.png", "img/squash.png", "img/awning.png",
  "img/piecart.png", "img/stall.png", "img/cone.png", "img/cart.png", "img/car.png", "img/sign.png",
  "img/drum.png", "img/float.png", "img/streamers.png", "img/balloon.png", "img/snowman.png", "img/sled.png",
  "img/ice.png", "img/icebranch.png", "img/pine.png", "img/sky-patch.jpg", "img/sky-orchard.jpg", "img/sky-fair.jpg",
  "img/sky-market.jpg", "img/sky-lot.jpg", "img/sky-parade.jpg", "img/sky-snow.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(FILES);
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first: the stored copy answers at once, online or not.
self.addEventListener("fetch", (event) => {
  // Only the game's own files; the family score service must always be asked fresh.
  // version.json, which says whether a newer release is out, is never answered from the stored copy.
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/version.json")) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});

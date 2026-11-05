// Starts the game: Phaser (loaded as vendor/phaser.min.js), the scenes, the back gesture and offline.
import * as audio from "./audio.js";
import * as store from "./storage.js";
import { BootScene } from "./scenes/BootScene.js";
import { DayScene } from "./scenes/DayScene.js";
import { PauseScene } from "./scenes/PauseScene.js";
import { PlayScene } from "./scenes/PlayScene.js";
import { ResultsScene } from "./scenes/ResultsScene.js";
import { TitleScene } from "./scenes/TitleScene.js";
import { H, W, ZOOM } from "./ui.js";

audio.setEnabled(store.get("sound"));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#2b1d14",
  banner: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W * ZOOM, height: H * ZOOM },
  scene: [BootScene, TitleScene, DayScene, PlayScene, PauseScene, ResultsScene],
});

// Android's back gesture pauses a run, and on other screens returns to the title, instead of
// closing the app.
history.pushState({ game: true }, "");
window.addEventListener("popstate", () => {
  const active = game.scene.getScenes(true)[0];
  if (active?.scene.key === "Play") active.pause();
  else if (active && !["Boot", "Title", "Pause"].includes(active.scene.key)) active.scene.start("Title");
  history.pushState({ game: true }, "");
});

// Not on this computer (localhost) or the home network, where a stored copy would hide every edit.
const developing = ["localhost", "127.0.0.1"].includes(location.hostname) || location.protocol === "http:";
if (developing) window.game = game; // for poking at the game from the browser console
if ("serviceWorker" in navigator && !developing) {
  navigator.serviceWorker.register("sw.js").catch(() => {
    // Offline play needs HTTPS; the game still works online without it.
  });
}

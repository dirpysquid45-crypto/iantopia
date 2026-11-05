// Fun Shed kit v1.4
// The title: the turkey with the farmer coming up behind. Tap PLAY (or swipe up) to play. Only the
// buttons start things, so a stray tap does nothing. SOUND mutes.
// At the bottom: an install hint, or an update button when a newer release is out (js/update.js).
import * as audio from "../audio.js";
import * as store from "../storage.js";
import { install, installHint, onHintChange } from "../install.js";
import { listenForGestures } from "../gestures.js";
import { DAYS } from "../rules.js";
import { sized } from "../textures.js";
import { checkForUpdate, update } from "../update.js";
import { W, backdrop, button, inside, setupCamera, text, woodSign } from "../ui.js";

const PLAY = { x: W / 2 - 150, y: 410, w: 300, h: 90 };
const CONVERT = { x: W / 2 - 170, y: 596, w: 340, h: 60 }; // corn bank to Strubles, on the Iantopia account
const INSTALL = { x: 40, y: 906, w: W - 80, h: 34 }; // the install hint, or the update button
// ?day=3 starts on day 3 (the pumpkin patch), for trying out the later days.
const START_DAY = Phaser.Math.Clamp((parseInt(new URLSearchParams(location.search).get("day"), 10) || 1) - 1, 0, DAYS.length - 1);

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("Title");
  }

  create() {
    setupCamera(this);
    backdrop(this);

    woodSign(this, W / 2, 210, 470, 180);
    text(this, W / 2, 168, "TURKEY", 56, { pixel: true, color: "#ffe066", strokeThickness: 8 });
    text(this, W / 2, 244, "ESCAPE", 56, { pixel: true, color: "#ff9a3c", strokeThickness: 8 });
    text(this, W / 2, 334, "THANKSGIVING IS COMING. RUN!", 14, { pixel: true, color: "#ffd700", strokeThickness: 4 });

    // The turkey legging it to the right, the farmer coming up behind with his roasting pan.
    const turkey = sized(this.add.image(W / 2 + 110, 760, "turkey-scared"), 1.4).setOrigin(0.5, 1);
    this.tweens.add({ targets: turkey, y: 750, angle: 6, duration: 180, yoyo: true, repeat: -1 });
    const farmer = sized(this.add.image(W / 2 - 130, 870, "farmer-front"), 0.95).setOrigin(0.5, 1);
    this.tweens.add({ targets: farmer, y: 858, angle: -4, duration: 220, yoyo: true, repeat: -1 });

    // Sound on or off (tap to change).
    this.soundText = text(this, 22, 40, "", 18, { originX: 0, color: "#ffffff" });
    this.soundArea = { x: 0, y: 0, w: 150, h: 90 };
    this.showSound();

    const best = store.topScore();
    if (best) {
      text(this, W / 2, 380, `YOUR BEST  ${best.toLocaleString()}`, 20, { color: "#ffffff", strokeThickness: 4 });
    }

    const go = button(this, PLAY, 0x2a9d3a, "▶ PLAY", 46);
    this.tweens.add({ targets: go.label, scale: 1.1, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.bankText = text(this, W / 2, 566, "", 16, { color: "#ffe066", strokeThickness: 4 });
    this.convertBtn = button(this, CONVERT, 0x2a9d3a, "", 18);
    this.refreshBank();
    this.installBox = this.add.graphics();
    this.installText = text(this, W / 2, INSTALL.y + INSTALL.h / 2, "", 17, { color: "#ffffff", strokeThickness: 3 });
    this.showInstall();
    onHintChange(() => this.scene.isActive() && this.showInstall());
    this.lookForUpdate();
    // Coming back to the game from another app checks again: a phone often keeps the game open for days.
    const back = () => !document.hidden && this.lookForUpdate();
    document.addEventListener("visibilitychange", back);
    this.events.once("shutdown", () => document.removeEventListener("visibilitychange", back));

    listenForGestures(this, {
      lockMs: 800, // a tap left over from the last screen can't press anything here
      onSwipe: (dir) => {
        if (dir === "up") this.play();
      },
      onTap: (x, y) => {
        if (inside(x, y, CONVERT) && store.cornBank() >= 10) this.convertCorn();
        else if (this.hint?.update && inside(x, y, INSTALL)) this.runUpdate();
        else if (this.hint?.tap && inside(x, y, INSTALL)) install();
        else if (this.hint?.link && inside(x, y, INSTALL)) window.open(this.hint.link, "_blank");
        else if (inside(x, y, this.soundArea)) this.toggleSound();
        else if (inside(x, y, PLAY)) this.play();
      },
    });
  }

  play() {
    audio.unlock();
    audio.play("gobble");
    this.scene.start("Day", { day: START_DAY, score: 0, corn: 0 });
  }

  // Asks the site whether a newer release is out.
  async lookForUpdate() {
    const newer = await checkForUpdate();
    if (!this.scene.isActive()) return;
    this.updateReady = newer === true;
    this.showInstall();
  }

  refreshBank() {
    const corn = store.cornBank();
    const strubles = Math.floor(corn / 10);
    this.bankText.setText(`CORN BANK  ${corn}`);
    this.convertBtn.label.setText(strubles > 0 ? `CONVERT TO ${strubles} STRUBLE${strubles > 1 ? "S" : ""}` : "10 CORN = 1 STRUBLE");
    this.convertBtn.g.setAlpha(strubles > 0 ? 1 : 0.4);
    this.convertBtn.label.setAlpha(strubles > 0 ? 1 : 0.4);
  }

  // Sends the whole corn bank to the Iantopia account. The server caps how much converts each day.
  async convertCorn() {
    this.convertBtn.label.setText("CONVERTING…");
    try {
      const r = await window.TurkeyAccount.convertCorn(store.cornBank());
      store.spendCorn(r.cornUsed);
      this.convertBtn.label.setText(r.credited > 0 ? `+${r.credited} STRUBLES ADDED` : "DAILY LIMIT REACHED");
      this.time.delayedCall(2000, () => this.refreshBank());
    } catch (e) {
      this.convertBtn.label.setText(e.message.slice(0, 26));
      this.time.delayedCall(2500, () => this.refreshBank());
    }
  }

  runUpdate() {
    this.installText.setText("⏳ UPDATING…");
    this.hint = null;
    update();
  }

  // "Install me", while the game is playing in a browser tab on a phone (js/install.js), or the
  // update button when a newer release is out.
  showInstall() {
    this.hint = this.updateReady ? { words: "⬆ NEW VERSION! TAP TO UPDATE", tap: true, update: true } : installHint();
    this.installBox.clear();
    this.installText.setText(this.hint?.words ?? "");
    if (!this.hint || this.hint.link) return; // the install link is plain small words, no box
    this.installBox.fillStyle(this.hint.update ? 0xe07a1f : this.hint.tap ? 0x2a9d8f : 0x000000, this.hint.tap ? 1 : 0.3);
    this.installBox.fillRoundedRect(INSTALL.x, INSTALL.y, INSTALL.w, INSTALL.h, 17);
  }

  toggleSound() {
    const on = !store.get("sound");
    store.set("sound", on);
    audio.setEnabled(on);
    this.showSound();
    audio.play("gobble");
  }

  showSound() {
    this.soundText.setText(store.get("sound") ? "SOUND ON" : "SOUND OFF");
  }
}

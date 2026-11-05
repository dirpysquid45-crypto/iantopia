// Fun Shed kit v1.4
// The card before each day: which day it is, where the turkey's running, and how close
// Thanksgiving is. Tap or swipe to run (it starts by itself after a few seconds).
import * as audio from "../audio.js";
import { listenForGestures } from "../gestures.js";
import { DAYS } from "../rules.js";
import { H, W, backdrop, setupCamera, text, woodSign } from "../ui.js";

export class DayScene extends Phaser.Scene {
  constructor() {
    super("Day");
  }

  // run: { day (0 to DAYS.length - 1), score, corn }
  create(run) {
    setupCamera(this);
    this.run = run;
    const r = DAYS[run.day];
    backdrop(this);
    this.add.rectangle(0, 0, W, H, r.boss ? 0x7a2a0a : 0x000000, 0.35).setOrigin(0);

    woodSign(this, W / 2, 260, 460, 230);
    text(this, W / 2, 196, r.name, r.boss ? 50 : 60, { color: "#ffe066", strokeThickness: 10 });
    text(this, W / 2, 268, r.place, 34, { color: "#fff3c4" });
    text(this, W / 2, 324, r.note, 24, { color: "#ffffff", strokeThickness: 5 });
    if (run.score > 0) text(this, W / 2, 420, `SCORE  ${Math.round(run.score).toLocaleString()}`, 26, { color: "#ffffff", strokeThickness: 5 });

    if (run.day === 0) {
      text(this, W / 2, 560, "swipe ↑ to jump\nswipe ↓ to duck\nswipe ← → to change lanes", 28, { color: "#ffffff", strokeThickness: 6 });
      text(this, W / 2, 690, "Grab the corn. Don't get caught!", 24, { color: "#ffe066", strokeThickness: 5 });
    } else if (r.boss) {
      text(this, W / 2, 580, "One slip and he's got you.\nPumpkins will save you!", 28, { color: "#ffffff", strokeThickness: 6 });
    } else if (r.tip) {
      text(this, W / 2, 580, r.tip, 30, { color: "#ffe066", strokeThickness: 6 });
    }

    const go = text(this, W / 2, 840, "TAP TO RUN!", 44, { color: "#ffe066", strokeThickness: 8 });
    this.tweens.add({ targets: go, scale: 1.08, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    audio.play(r.boss ? "pan" : "gobble");
    this.time.delayedCall(r.boss ? 450 : 600, () => audio.say("farmer-day-" + r.id));

    this.started = false;
    listenForGestures(this, { lockMs: 600, onTap: () => this.start(), onSwipe: () => this.start() });
    this.time.delayedCall(run.day === 0 ? 6000 : 3500, () => this.start());
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.scene.start("Play", this.run);
  }
}

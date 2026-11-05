// Fun Shed kit v1.4
// After a run: the score, how far the turkey got, and where it landed on the board. Scores stay on
// this phone. Big buttons: PLAY AGAIN, MENU.
import * as audio from "../audio.js";
import * as store from "../storage.js";
import { listenForGestures } from "../gestures.js";
import { sized } from "../textures.js";
import { DAYS } from "../rules.js";
import { W, backdrop, button, inside, setupCamera, text, woodSign } from "../ui.js";

const CLAIM = { x: W / 2 - 170, y: 696, w: 340, h: 70 }; // the turkey cursor, on the Iantopia account

const AGAIN = { x: W / 2 - 170, y: 590, w: 340, h: 84 };
const MENU = { x: W / 2 - 170, y: 790, w: 340, h: 60 };

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super("Results");
  }

  create({ score, day, corn, pardoned, rank, previousTop }) {
    setupCamera(this);
    backdrop(this);
    this.run = { score, corn, pardoned };
    const me = store.get("player");

    woodSign(this, W / 2, 200, 470, 300);
    text(this, W / 2, 90, pardoned ? "PARDONED!" : "CAUGHT!", 50, { color: pardoned ? "#7CFC9A" : "#ffe066" });
    const how = pardoned ? "free as a bird · pizza for dinner" : `${me.initials} · caught ${DAYS[day - 1].caught}`;
    text(this, W / 2, 136, how, 22, { color: "#fff3c4", strokeThickness: 4 });
    const scoreText = text(this, W / 2, 212, "0", 90, { color: "#ffffff", strokeThickness: 10 });
    const countUp = Math.min(1200, 200 + score / 4);
    this.tweens.addCounter({
      from: 0, to: score, duration: countUp, ease: "Cubic.easeOut",
      onUpdate: (t) => scoreText.setText(Math.round(t.getValue()).toLocaleString()),
    });

    // The headline: a new high score first, then the board.
    let headline;
    let colour = "#ffe066";
    let cheer = score > 0;
    if (score > previousTop && score > 0) {
      headline = "NEW HIGH SCORE!";
      colour = "#7CFC9A";
    } else if (rank) {
      headline = `#${rank} ON THIS PHONE`;
    } else {
      headline = `YOUR BEST ${previousTop.toLocaleString()}`;
      cheer = false;
    }
    const head = text(this, W / 2, 296, headline, 30, { color: colour, strokeThickness: 6 });
    if (colour === "#7CFC9A") this.tweens.add({ targets: head, scale: 1.1, duration: 450, yoyo: true, repeat: -1 });
    audio.play(pardoned ? "fanfare" : cheer ? "cheer" : "groan");

    const box = this.add.graphics();
    box.fillStyle(0x000000, 0.35).fillRoundedRect(70, 380, W - 140, 160, 20);
    sized(this.add.image(120, 422, "corn"), 0.8);
    text(this, 150, 422, "Corn grabbed", 16, { originX: 0, strokeThickness: 4 });
    text(this, W - 100, 422, String(corn), 24, { originX: 1, color: "#ffe066", strokeThickness: 4 });
    sized(this.add.image(120, 494, "turkey-scared"), 0.32);
    text(this, 150, 494, "Days escaped", 16, { originX: 0, strokeThickness: 4 });
    text(this, W - 100, 494, `${Math.min(day - 1, DAYS.length)}/${DAYS.length}`, 22, { originX: 1, color: "#ffe066", strokeThickness: 4 });

    const buttons = [
      [AGAIN, 0x2a9d3a, "▶ PLAY AGAIN", 38],
      [MENU, 0x7d5a3c, "MENU", 24],
    ];
    if (pardoned) this.claimBtn = button(this, CLAIM, 0xd9a441, "CLAIM TURKEY CURSOR", 20);
    this.buttonsShown = buttons.map(([r, c, words, size]) => button(this, r, c, words, size));


    listenForGestures(this, {
      lockMs: 900,
      onTap: (x, y) => {
        if (inside(x, y, AGAIN)) this.again();
        else if (this.claimBtn && inside(x, y, CLAIM)) this.claim();
        else if (inside(x, y, MENU)) this.scene.start("Title");
      },
      onSwipe: (dir) => dir === "up" && this.again(),
    });
  }

  async claim() {
    if (this.claimed) return;
    this.claimBtn.label.setText("CLAIMING…");
    try {
      const r = await window.TurkeyAccount.claimCursor();
      this.claimed = true;
      this.claimBtn.label.setText(r.isNew ? "TURKEY CURSOR CLAIMED!" : "ALREADY CLAIMED");
    } catch (e) {
      this.claimBtn.label.setText(e.message.slice(0, 26));
    }
  }

  again() {
    audio.play("gobble");
    this.scene.start("Day", { day: 0, score: 0, corn: 0 });
  }
}

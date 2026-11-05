// Fun Shed kit v1.4
// The pause screen, over a frozen run: KEEP PLAYING, QUIT (the score is saved and the results
// come up, as if the farmer had caught you), and SOUND on or off (the same setting as on the title).
import * as audio from "../audio.js";
import * as store from "../storage.js";
import { listenForGestures } from "../gestures.js";
import { H, W, button, inside, setupCamera, text, woodSign } from "../ui.js";

const RESUME = { x: W / 2 - 150, y: 410, w: 300, h: 84 };
const QUIT = { x: W / 2 - 150, y: 520, w: 300, h: 84 };
const SOUND = { x: W / 2 - 150, y: 630, w: 300, h: 70 };

export class PauseScene extends Phaser.Scene {
  constructor() {
    super("Pause");
  }

  create() {
    setupCamera(this);
    this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0);
    woodSign(this, W / 2, 300, 360, 110);
    text(this, W / 2, 300, "PAUSED", 56, { color: "#ffe066" });
    button(this, RESUME, 0x2a9d3a, "KEEP PLAYING", 34);
    button(this, QUIT, 0xe63946, "QUIT", 34);
    this.soundText = button(this, SOUND, 0x2a6f9d, "", 28).label;
    this.showSound();
    text(this, W / 2, 760, "Quitting ends the game.\nYour score is still saved.", 20, { color: "#ffffff", strokeThickness: 4 });

    listenForGestures(this, {
      lockMs: 250,
      onTap: (x, y) => {
        if (inside(x, y, RESUME)) this.resume();
        else if (inside(x, y, QUIT)) this.quit();
        else if (inside(x, y, SOUND)) this.toggleSound();
      },
    });
  }

  toggleSound() {
    const on = !store.get("sound");
    store.set("sound", on);
    audio.setEnabled(on);
    this.showSound();
    audio.play("pop");
  }

  showSound() {
    this.soundText.setText(store.get("sound") ? "🔊 SOUND ON" : "🔇 SOUND OFF");
  }

  resume() {
    audio.play("pop");
    this.scene.stop();
    this.scene.resume("Play");
  }

  quit() {
    audio.play("groan");
    const play = this.scene.get("Play");
    this.scene.stop();
    play.quit();
  }
}

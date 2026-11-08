// One day of running. The turkey runs away from us down a three-lane track; swipe up to jump,
// down to duck, left and right to change lanes. Things in the way come at you out of the
// distance, with lines of corn to grab. Clip something and you stumble: the farmer catches up
// (he's at the bottom of the screen), and a second stumble while he's close, or running into a
// tractor, and he's got you. Reach the end of the day and it's on to the next.
import * as audio from "../audio.js";
import * as store from "../storage.js";
import { CORN_CHANCE, DAYS, KINDS, POINTS, POWERS, REVIVE_COST, STUMBLE_MS, TURBO, forTouch } from "../rules.js";
import { sized } from "../textures.js";
import { H, W, button, fingerAt, floatText, inside, setupCamera, text } from "../ui.js";

// The view: a road running off to the horizon. z is how far ahead of the turkey something is,
// in steps; perspective(z) is how big it looks there (1 right beside the turkey).
const HORIZON = 300;
const GROUND_Y = 820;     // where the turkey's feet are
const NEAR = 7;           // smaller = stronger perspective
const FAR = 90;           // things appear this many steps ahead
const LANE_W = 150;       // a lane's width beside the turkey, in screen pixels
const ROAD = 1.65;        // half the road's width, in lanes
const BAND = 3;           // the ground's light and dark stripes, in steps
const JUMP_STEPS = 8.5;   // a jump covers this many steps: quicker on the faster days
const JUMP_UP = 150;      // and goes this high, in pixels
const DUCK_MIN = 0.2;     // a quick flick still ducks for this long
const SWIPE = 22;         // a finger moving this far is a swipe
const PAUSE = { x: W / 2 - 40, y: 0, w: 80, h: 76 };
const PUMPKIN_REACH = 45; // how far ahead, in steps, the pumpkin blast clears
const PUMPKIN_GRACE = 2;  // seconds after a blast when bumps don't count
const REVIVE_BUTTON = { x: W / 2 - 170, y: 640, w: 340, h: 84 };
const GIVE_UP = { x: W / 2 - 170, y: 750, w: 340, h: 70 };

const perspective = (z) => NEAR / (NEAR + Math.max(z, -NEAR + 0.5));
const groundY = (s) => HORIZON + (GROUND_Y - HORIZON) * s;

export class PlayScene extends Phaser.Scene {
  constructor() {
    super("Play");
  }

  // run: { day (0-3), score, corn }
  create(run) {
    setupCamera(this);
    // Phaser keeps a scene's paused clock and tweens through a restart; a new day starts fresh.
    this.time.paused = false;
    this.tweens.resumeAll();

    this.run = { day: 0, score: 0, corn: 0, ...run };
    this.dayStart = this.run.score;
    this.powerT = { pumpkin: 0, sneakers: 0, magnet: 0 }; // seconds left of each power-up
    this.touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    this.rules = this.touch ? forTouch(DAYS[this.run.day]) : DAYS[this.run.day];
    this.phase = "run"; // run | caught | made-it
    this.clock = 0;          // seconds of running today
    this.distance = 0;       // steps run today
    this.speed = this.rules.speed;
    this.lane = 0;
    this.laneX = 0;
    this.jumpT = 0;          // seconds into a jump (0 = on the ground)
    this.ducking = false;    // the finger (or down arrow) is holding the duck
    this.duckPointer = null; // which finger is holding it
    this.pumpkinArmed = false; // a pumpkin is waiting to pop on the next bump
    this.duckFrom = -Infinity;
    this.lastStumble = -Infinity;
    this.close = 1;          // how close the farmer is, 0 (gone) to 1 (right behind)
    this.things = [];
    this.nextRow = 2 * this.rules.speed; // the first obstacle is two seconds away, time to get your bearings
    this.nextProp = 0;
    this.cornUntil = [0, 0, 0];
    this.tutorial = this.run.day === 0 && (store.get("totals").runs ?? 0) < 2 ? this.tutorialRows() : [];
    if (this.tutorial.length) this.nextRow = this.tutorial.at(-1).at + 30;

    this.drawSky();
    this.ground = this.add.graphics().setDepth(1);
    this.turkeyShadow = this.add.image(W / 2, GROUND_Y, "shadow").setDepth(1999);
    this.turkey = sized(this.add.image(W / 2, GROUND_Y, "turkey").setOrigin(0.5, 0.9)).setDepth(2000);
    // The pumpkin shield: a warm glow, and little pumpkins whizzing round the turkey.
    this.shieldGlow = this.add.ellipse(W / 2, GROUND_Y - 60, 190, 190, 0xffa53a, 0.3).setDepth(1998).setVisible(false);
    this.shieldBits = Array.from({ length: 6 }, () => sized(this.add.image(0, 0, "pumpkin"), 0.42).setVisible(false));
    // The sneakers: a pair on the turkey's feet, and speed lines rushing past.
    this.feet = [-1, 1].map(() => sized(this.add.image(0, 0, "sneaker"), 1.2).setDepth(2002).setVisible(false));
    this.speedLines = this.add.graphics().setDepth(1500);
    // The magnet, held up over the turkey's head.
    this.magnetIcon = sized(this.add.image(0, 0, "magnet"), 0.6).setDepth(2002).setVisible(false);
    this.zaps = this.add.graphics().setDepth(2003);
    this.farmer = sized(this.add.image(W / 2, H + 400, "farmer").setOrigin(0.5, 1), 1.15).setDepth(3000);
    this.makeHud();
    this.hint = text(this, W / 2, 560, "", 40, { color: "#ffe066", strokeThickness: 8 }).setDepth(5000);

    this.listen();
    const away = () => document.hidden && this.pause();
    document.addEventListener("visibilitychange", away);
    this.events.once("shutdown", () => document.removeEventListener("visibilitychange", away));
    audio.play("gobble");
    audio.startMusic();
    this.events.on("resume", () => audio.startMusic());
    this.events.once("shutdown", () => audio.stopMusic());
  }

  // ---- input ----

  listen() {
    let touch = null;
    this.input.on("pointerdown", (p) => {
      audio.unlock();
      const at = fingerAt(this, p);
      if (this.reviveUI) {
        if (inside(at.x, at.y, REVIVE_BUTTON)) this.revive();
        else if (inside(at.x, at.y, GIVE_UP)) this.finish(false);
        return;
      }
      if (inside(at.x, at.y, PAUSE)) return this.pause();
      touch = { id: p.id, start: at, used: false };
    });
    // A swipe counts as soon as the finger has moved far enough, without waiting for it to lift.
    this.input.on("pointermove", (p) => {
      if (!touch || touch.used || p.id !== touch.id) return;
      const at = fingerAt(this, p);
      const dx = at.x - touch.start.x;
      const dy = at.y - touch.start.y;
      if (Math.hypot(dx, dy) < SWIPE) return;
      touch.used = true;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (dir === "down") this.duckPointer = p.id;
      this.act(dir);
    });
    const up = (p) => {
      audio.unlock(); // phones only allow sound once a touch has ended
      if (touch?.id === p.id) touch = null;
      if (p.id === this.duckPointer) {
        this.ducking = false;
        this.duckPointer = null;
      }
    };
    this.input.on("pointerup", up);
    this.input.on("pointerupoutside", up);
    // Arrow keys, for playing on a computer.
    this.input.keyboard?.on("keydown", (e) => {
      const keys = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Space: "up", Escape: "pause" };
      if (keys[e.code] === "pause") this.pause();
      else if (keys[e.code]) this.act(keys[e.code]);
    });
    this.input.keyboard?.on("keyup", (e) => {
      if (e.code === "ArrowDown") this.ducking = false;
    });
  }

  act(dir) {
    if (this.phase !== "run") return;
    if (dir === "left" || dir === "right") {
      const lane = Phaser.Math.Clamp(this.lane + (dir === "left" ? -1 : 1), -1, 1);
      if (lane !== this.lane) audio.play("lane");
      this.lane = lane;
    } else if (dir === "up") {
      // Swiping up in the air jumps again as soon as the turkey lands.
      if (this.jumpT > 0) this.jumpAgain = true;
      else this.jump();
    } else if (dir === "down") {
      this.jumpAgain = false;
      // Down in the air drops straight back to the ground, ducking for as long as the finger stays down.
      this.jumpT = 0;
      this.ducking = true;
      this.duckFrom = this.clock;
      audio.play("slide");
    }
  }

  jump() {
    this.ducking = false;
    this.jumpT = 0.0001;
    this.jumpS = Phaser.Math.Clamp(JUMP_STEPS / this.speed, 0.42, 0.65);
    audio.play("jump");
  }

  pause() {
    if (this.phase !== "run" || !this.scene.isActive()) return;
    audio.stopMusic();
    this.scene.pause();
    this.scene.launch("Pause");
  }

  // From the pause screen: the run ends here, with the score saved.
  quit() {
    this.scene.resume();
    this.finish(false);
  }

  // ---- the world ----

  tutorialRows() {
    return [
      { at: 40, row: [["hay", -1], ["hay", 0], ["hay", 1]], hint: "SWIPE UP TO JUMP" },
      { at: 80, row: [["line", -1], ["line", 0], ["line", 1]], hint: "SWIPE DOWN TO DUCK" },
      { at: 120, row: [["tractor", 0]], hint: "SWIPE LEFT OR RIGHT", follow: true },
      { at: 160, row: [["corn", -1]], hint: "" },
    ];
  }

  spawnRow(at) {
    const r = this.rules;
    const open = Phaser.Utils.Array.Shuffle([-1, 0, 1]).filter((l) => this.cornUntil[l + 1] < at - 2);
    // Never more than two things in a row, so there's always a way through.
    const count = Math.min(open.length, Math.random() < r.pairs ? 2 : 1);
    const taken = open.slice(0, count);
    for (const lane of taken) this.addThing(Phaser.Utils.Array.GetRandom(r.obstacles), lane, at);
    const free = open.slice(count);
    if (!free.length) return;
    // at most one power-up, and not one that's already going
    const power = Phaser.Utils.Array.Shuffle(Object.keys(POWERS))
      .find((name) => this.powerT[name] <= 0 && Math.random() < POWERS[name].chance[r.boss ? "boss" : "normal"]);
    if (power) {
      this.addThing(power, free[0], at);
    } else if (Math.random() < CORN_CHANCE) {
      const lane = free[0];
      const n = Phaser.Math.Between(4, 7);
      for (let i = 0; i < n; i++) this.addThing("corn", lane, at + i * 2.5);
      this.cornUntil[lane + 1] = at + n * 2.5;
    }
  }

  addThing(look, lane, at) {
    const kind = KINDS[look] ?? look; // jump | duck | block | corn | a power-up | prop
    const img = this.add.image(0, 0, look).setOrigin(0.5, 1);
    const thing = { look, kind, lane, at, img, done: false };
    this.things.push(thing);
    return thing;
  }

  addProps(at) {
    for (const side of [-1, 1]) {
      const look = Phaser.Utils.Array.GetRandom(this.rules.props);
      const t = this.addThing(look, side * Phaser.Math.FloatBetween(2.3, 2.9), at + Phaser.Math.FloatBetween(0, 3));
      t.kind = "prop";
      t.img.setFlipX(Math.random() < 0.5);
    }
  }

  drawSky() {
    const r = this.rules;
    // The day's picture (img/sky-<day>.jpg) ends at the horizon; without one, a drawn sky.
    if (this.textures.exists("sky-" + r.id)) {
      // the far field, between the picture's edge and where the scrolling ground begins
      this.add.rectangle(0, HORIZON, W, 80, r.grass[0]).setOrigin(0).setDepth(0);
      const img = this.add.image(W / 2, HORIZON + 4, "sky-" + r.id).setOrigin(0.5, 1).setDepth(0);
      return img.setScale((HORIZON + 4) / img.height);
    }
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(r.sky[0], r.sky[0], r.sky[1], r.sky[1], 1);
    g.fillRect(0, 0, W, HORIZON + 4);
    g.fillStyle(r.hills);
    g.fillEllipse(90, HORIZON + 10, 360, 90);
    g.fillEllipse(420, HORIZON + 6, 400, 70);
    if (r.id === "farm" || r.id === "feast") {
      // a red barn on the hill
      g.fillStyle(0x8e2a20).fillRect(360, HORIZON - 50, 60, 46);
      g.fillStyle(0x6b1f18).fillTriangle(354, HORIZON - 50, 426, HORIZON - 50, 390, HORIZON - 78);
    } else if (r.id === "town") {
      g.fillStyle(0x6a7890);
      for (const [x, w, h] of [[60, 40, 70], [110, 30, 100], [150, 44, 60], [380, 36, 90], [430, 50, 64]]) g.fillRect(x, HORIZON - h, w, h);
      g.fillStyle(0xd8d0b0).fillRect(250, HORIZON - 120, 12, 120).fillTriangle(240, HORIZON - 120, 272, HORIZON - 120, 256, HORIZON - 150);
    }
    g.fillStyle(0xffffff, 0.85);
    for (const [x, y, s] of [[100, 90, 1], [420, 140, 0.8], [270, 50, 0.6]]) {
      g.fillEllipse(x, y, 110 * s, 40 * s);
      g.fillEllipse(x + 30 * s, y - 16 * s, 70 * s, 40 * s);
    }
  }

  drawGround() {
    const g = this.ground.clear();
    const r = this.rules;
    const first = Math.floor((this.distance - 6) / BAND) * BAND;
    for (let wz = first; wz < this.distance + FAR; wz += BAND) {
      const z0 = wz - this.distance;
      const s0 = perspective(z0);
      const s1 = perspective(z0 + BAND);
      const y0 = Math.min(H, groundY(s0));
      const y1 = groundY(s1);
      if (y1 > H) continue;
      const odd = Math.round(wz / BAND) % 2;
      g.fillStyle(r.grass[odd]).fillRect(0, y1, W, y0 - y1 + 1);
      const e0 = ROAD * LANE_W * s0;
      const e1 = ROAD * LANE_W * s1;
      g.fillStyle(r.road[odd]).fillPoints([{ x: W / 2 - e0, y: y0 }, { x: W / 2 + e0, y: y0 }, { x: W / 2 + e1, y: y1 }, { x: W / 2 - e1, y: y1 }], true);
    }
    // the lines between the lanes
    g.lineStyle(3, 0x000000, 0.15);
    const sNear = perspective(-5);
    const yNear = groundY(sNear);
    for (const l of [-0.5, 0.5]) g.lineBetween(W / 2 + l * LANE_W * sNear, yNear, W / 2, HORIZON);
  }

  // ---- every frame ----

  update(_, deltaMs) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt;
    if (this.phase === "caught") return;
    const r = this.rules;
    if (this.phase === "run") {
      this.speed = (r.speed + r.speedUp * Math.min(1, this.distance / r.length)) * (this.powerT.sneakers > 0 ? TURBO : 1);
      this.distance += this.speed * dt;
      this.run.score += this.speed * dt * POINTS.step;
      if (this.distance >= r.length) this.madeIt();
    } else {
      this.distance += this.speed * dt; // made it: still running, off into the distance
    }

    while (this.tutorial.length && this.tutorial[0].at < this.distance + FAR) this.spawnTutorial(this.tutorial.shift());
    while (this.nextRow < this.distance + FAR && this.nextRow < r.length - 10) {
      this.spawnRow(this.nextRow);
      this.nextRow += Phaser.Math.FloatBetween(r.gap[0], r.gap[1]);
    }
    while (this.nextProp < this.distance + FAR) {
      this.addProps(this.nextProp);
      this.nextProp += 9;
    }

    // the turkey
    this.laneX += (this.lane - this.laneX) * Math.min(1, dt * 16);
    if (this.jumpT > 0) {
      this.jumpT += dt;
      if (this.jumpT >= this.jumpS) {
        this.jumpT = 0;
        if (this.jumpAgain) this.jump();
        this.jumpAgain = false;
      }
    }
    const ducked = this.ducking || this.clock < this.duckFrom + DUCK_MIN;
    this.ducked = ducked;
    const lift = this.jumpT > 0 ? Math.sin((Math.PI * this.jumpT) / this.jumpS) * JUMP_UP : 0;
    const step = this.clock * this.speed * 0.9;
    const x = W / 2 + this.laneX * LANE_W;
    // Ducking squashes the turkey flat; jumping stretches it a little.
    const pose = ducked || lift || this.clock - this.lastStumble > 1.2 ? "turkey" : "turkey-scared";
    sized(this.turkey.setTexture(pose));
    if (ducked) this.turkey.setScale(this.turkey.scaleX * 1.15, this.turkey.scaleY * 0.55);
    else if (lift) this.turkey.setScale(this.turkey.scaleX * 0.92, this.turkey.scaleY * 1.08);
    this.turkey.setPosition(x, GROUND_Y - lift - (lift ? 0 : Math.abs(Math.sin(step)) * 7));
    this.turkey.setRotation(lift ? 0 : Math.sin(step) * 0.07);
    this.turkeyShadow.setPosition(x, GROUND_Y).setScale(1 - lift / 400);
    this.lift = lift;
    this.movePowers(dt, x);

    this.moveThings(dt);
    this.drawGround();
    this.moveFarmer(dt, x);
    this.updateHud();
  }

  moveThings(dt) {
    const keep = [];
    for (const t of this.things) {
      const z = t.at - this.distance;
      if (z < -5) {
        t.img.destroy();
        continue;
      }
      keep.push(t);
      const s = perspective(z);
      const pickup = t.kind === "corn" || POWERS[t.kind];
      // the corn magnet pulls nearby corn straight to the turkey, from wherever it is
      if (t.kind === "corn" && this.powerT.magnet > 0 && z < 60 && !t.done) {
        const k = Math.min(1, dt * 5);
        t.lane += (this.laneX - t.lane) * k;
        t.at += (this.distance - t.at) * k;
      }
      const float = pickup ? (24 + Math.sin(this.clock * 6 + t.at) * 6) * s : 0;
      if (!t.knocked) {
        t.img.setPosition(W / 2 + t.lane * LANE_W * s, groundY(s) - float);
        sized(t.img, s);
        t.img.setAlpha(Phaser.Math.Clamp((FAR - z) / 12, 0, 1));
      }
      t.img.setDepth(2000 - z * 10);
      if (!t.done && this.phase === "run" && t.kind !== "prop") this.check(t, z);
    }
    this.things = keep;
    if (this.hintFor && this.hintFor.at - this.distance < -1) {
      this.hint.setText("");
      this.hintFor = null;
    }
    if (this.hintFor?.follow && this.hintFor.at - this.distance > 22) this.hintFor.things.forEach((t) => (t.lane = this.lane));
  }

  // Is the turkey running into this thing right now?
  check(t, z) {
    const lined = Math.abs(t.lane - this.laneX) < 0.55;
    if (t.kind === "corn" || POWERS[t.kind]) {
      if (z > 0.6) return;
      t.done = true;
      if (!lined) return;
      t.img.setVisible(false);
      if (t.kind === "corn") {
        this.run.corn++;
        this.run.score += POINTS.corn;
        audio.play("corn");
        this.tweens.add({ targets: this.cornText, scale: 1.25, duration: 80, yoyo: true });
      } else {
        // one at a time: a new power-up replaces the one going
        for (const name in this.powerT) this.powerT[name] = 0;
        this.powerT[t.kind] = POWERS[t.kind].seconds;
        audio.play(t.kind === "pumpkin" ? "pumpkin" : t.kind);
        this.pumpkinArmed = t.kind === "pumpkin";
        this.time.delayedCall(250, () => audio.say("turkey-" + t.kind));
        floatText(this, this.turkey.x, this.turkey.y - 150, POWERS[t.kind].says, "#ffb347", 30);
      }
      return;
    }
    // Blockers are long: you can run into the side of one by changing lanes too late.
    const back = t.kind === "block" ? -2.5 : -0.5;
    if (z > 0.6) return;
    if (z < back) {
      t.done = true;
      return;
    }
    if (!lined) return;
    const clear = (t.kind === "jump" && this.lift > 45) || (t.kind === "duck" && this.ducked);
    if (clear) return;
    t.done = true;
    if (this.powerT.sneakers > 0) {
      // in turbo sneakers, the turkey smashes straight through
      this.pop(t);
      floatText(this, this.turkey.x, this.turkey.y - 150, "BOOF!", "#ffffff", 30);
      return;
    }
    this.hit(t);
  }

  // Turbo sneakers: the obstacle pops and is gone the moment the turkey runs through it.
  pop(t) {
    t.done = true;
    audio.playClip("audio/pop.mp3");
    this.tweens.add({
      targets: t.img,
      scaleX: t.img.scaleX * 1.6,
      scaleY: t.img.scaleY * 1.6,
      alpha: 0,
      duration: 140,
      onComplete: () => t.img.setVisible(false),
    });
  }

  // The pumpkin blast: every obstacle in reach goes flying, all lanes at once.
  blast() {
    for (const t of this.things) {
      const z = t.at - this.distance;
      if (t.done || !["jump", "duck", "block"].includes(t.kind) || z < -2 || z > PUMPKIN_REACH) continue;
      t.done = true;
      if (t.kind === "block") t.img.setVisible(false);
      else this.knock(t);
    }
    audio.play("smash");
    this.cameras.main.shake(200, 0.01);
  }

  hit(t) {
    if (this.pumpkinArmed) {
      this.pumpkinArmed = false;
      this.pop(t);
      this.blast();
      this.powerT.pumpkin = PUMPKIN_GRACE;
      floatText(this, this.turkey.x, this.turkey.y - 150, "POP!", "#ffb347", 30);
      this.cameras.main.shake(150, 0.006);
      return;
    }
    if (this.powerT.pumpkin > 0) {
      this.pop(t);
      audio.play("shield");
      floatText(this, this.turkey.x, this.turkey.y - 150, "PHEW!", "#ffb347", 28);
      return;
    }
    this.knock(t);
    const again = this.clock - this.lastStumble < STUMBLE_MS / 1000;
    if (t.kind === "block" || again || this.rules.boss) return this.caught();
    this.lastStumble = this.clock;
    audio.play("bonk");
    this.time.delayedCall(250, () => audio.play("pan"));
    this.time.delayedCall(500, () => audio.say("farmer-close-" + Phaser.Math.Between(0, 2)));
    this.cameras.main.shake(200, 0.01);
    this.tweens.add({ targets: this.turkey, angle: { from: -25, to: 0 }, duration: 500, ease: "Back.easeOut" });
    floatText(this, this.turkey.x, this.turkey.y - 150, "WHOOPS!", "#ff9e9e", 32);
  }

  // A thing the turkey runs into goes flying (unless it's a tractor: then it's the turkey that stops).
  knock(t) {
    if (t.kind === "block" && this.powerT.sneakers <= 0) return;
    t.knocked = true;
    this.tweens.add({
      targets: t.img, x: t.img.x + (t.lane <= 0 ? -260 : 260), y: t.img.y - 160, angle: 200, alpha: 0,
      duration: 600, ease: "Cubic.easeOut",
    });
  }

  spawnTutorial(step) {
    const things = step.row.map(([look, lane]) => this.addThing(look, lane, step.at));
    if (!step.hint) return;
    const show = () => {
      this.hintFor = { at: step.at, things, follow: step.follow };
      this.hint.setText(step.hint).setScale(0.6);
      this.tweens.add({ targets: this.hint, scale: 1, duration: 250, ease: "Back.easeOut" });
    };
    // Show the words when the thing is close enough to see.
    const wait = () => (step.at - this.distance < 45 ? show() : this.time.delayedCall(100, wait));
    wait();
  }

  moveFarmer(dt, turkeyX) {
    let want = this.clock < 2.5 ? 1 : 0;                                // he starts right behind you
    if (this.clock - this.lastStumble < STUMBLE_MS / 1000) want = 1;     // and comes back when you stumble
    if (this.rules.boss) want = Math.max(want, 0.8);                    // on Thanksgiving he never lets up
    if (this.phase === "made-it" || this.powerT.sneakers > 0) want = 0;  // and he can't keep up with sneakers
    this.close += (want - this.close) * Math.min(1, dt * (want > this.close ? 4 : 0.8));
    const bob = Math.abs(Math.sin(this.clock * 9)) * 10;
    this.farmer.x += (turkeyX - this.farmer.x) * Math.min(1, dt * 3);
    this.farmer.y = H + 300 - 150 * this.close - bob;
    this.farmer.setRotation(Math.sin(this.clock * 9) * 0.05);
  }

  // ---- the end of a day ----

  madeIt() {
    this.phase = "made-it";
    audio.stopMusic();
    this.run.score += POINTS.day;
    const last = this.run.day === DAYS.length - 1;
    const show = this.rules.madeIt; // the turkey's big face pops up and it says something
    audio.play(last ? "fanfare" : "cheer");
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setOrigin(0).setDepth(4900).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 250 });

    // The big turkey face bounces up from the bottom, then wobbles with relief.
    const face = sized(this.add.image(W / 2, H + 40, show.face).setOrigin(0.5, 1), 3.4).setDepth(5000);
    this.tweens.add({ targets: face, y: H - 30, duration: 500, ease: "Back.easeOut",
      onComplete: () => this.tweens.add({ targets: face, angle: { from: -4, to: 4 }, duration: 260, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }) });

    // What it says, in a speech bubble
    const pick = Phaser.Math.Between(0, show.lines.length - 1);
    const said = show.lines[pick];
    this.time.delayedCall(700, () => audio.say(`turkey-made-${this.rules.id}-${pick}`));
    // drawn around its middle, so it can pop up from nothing
    const bubble = this.add.graphics({ x: W / 2, y: 275 }).setDepth(5001);
    const bw = W - 80;
    bubble.fillStyle(0xffffff).fillRoundedRect(-bw / 2, -85, bw, 170, 30).fillTriangle(-30, 81, 30, 81, 10, 135);
    bubble.lineStyle(6, 0x2b1d14).strokeRoundedRect(-bw / 2, -85, bw, 170, 30);
    const words = text(this, W / 2, 275, said, 40, { color: "#c4561d", stroke: "#ffffff", strokeThickness: 2 }).setDepth(5002);
    bubble.setScale(0);
    words.setScale(0);
    this.tweens.add({ targets: [bubble, words], scale: 1, duration: 350, delay: 350, ease: "Back.easeOut" });

    const t = text(this, W / 2, 120, last ? "PARDONED!" : "MADE IT!", 64, { color: "#7CFC9A", strokeThickness: 10 }).setDepth(5003).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 400, ease: "Back.easeOut" });
    if (!last) text(this, W / 2, 448, `+${POINTS.day} · on to ${DAYS[this.run.day + 1].name}`, 24, { color: "#ffffff", strokeThickness: 6 }).setDepth(5003);

    if (show.face === "turkey-phew") this.sweat(face);
    else this.confetti();
    this.time.delayedCall(3600, () => {
      if (last) return this.finish(true);
      this.scene.start("Day", { ...this.run, day: this.run.day + 1 });
    });
  }

  // Big drops of sweat flying off the turkey's head
  sweat(face) {
    this.time.addEvent({ delay: 70, repeat: 45, callback: () => {
      const top = face.y - face.displayHeight * 0.8;
      const side = Math.random() < 0.5 ? -1 : 1;
      const drop = this.add.image(W / 2 + side * Phaser.Math.Between(20, 90), top + Phaser.Math.Between(0, 60), "drop")
        .setDepth(5001).setScale(Phaser.Math.FloatBetween(1.1, 1.9)).setAngle(side * 30);
      this.tweens.add({ targets: drop, x: drop.x + side * Phaser.Math.Between(80, 200), duration: 700 });
      this.tweens.add({ targets: drop, y: drop.y - Phaser.Math.Between(40, 120), duration: 300, ease: "Quad.easeOut",
        onComplete: () => this.tweens.add({ targets: drop, y: H + 50, alpha: 0.4, duration: 700, ease: "Quad.easeIn", onComplete: () => drop.destroy() }) });
    } });
  }

  // Autumn-coloured confetti raining down
  confetti() {
    const colours = [0xe63946, 0xffb703, 0xfb8500, 0x7cfc9a, 0xffffff];
    for (let i = 0; i < 70; i++) {
      const bit = this.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(-400, -20), 12, 20, Phaser.Utils.Array.GetRandom(colours)).setDepth(4950);
      this.tweens.add({ targets: bit, y: H + 40, x: bit.x + Phaser.Math.Between(-80, 80), angle: Phaser.Math.Between(-720, 720),
        duration: Phaser.Math.Between(1800, 3200), delay: Phaser.Math.Between(0, 600) });
    }
  }

  caught() {
    this.phase = "caught";
    audio.stopMusic();
    audio.play("pan");
    this.time.delayedCall(200, () => audio.say("farmer-caught"));
    this.cameras.main.shake(250, 0.012);
    // The farmer lunges and flings his roasting pan up out of his hands, and it comes down over the
    // turkey. Plonk.
    const panY = this.farmer.y - this.farmer.displayHeight * 0.85;
    sized(this.farmer.setTexture("farmer-empty"), 1.15);
    this.tweens.add({ targets: this.farmer, y: GROUND_Y + 300, x: this.turkey.x, duration: 350, ease: "Cubic.easeOut" });
    const lid = sized(this.add.image(this.farmer.x, panY, "lid").setOrigin(0.5, 0.9)).setDepth(2600);
    this.tweens.add({ targets: lid, x: this.turkey.x, duration: 600, ease: "Sine.easeOut" });
    this.tweens.add({ targets: lid, angle: 360, duration: 300, ease: "Sine.easeOut" });
    this.tweens.chain({ targets: lid, tweens: [
      { y: GROUND_Y - 260, duration: 300, ease: "Cubic.easeOut" },
      { y: GROUND_Y + 10, duration: 450, ease: "Bounce.easeOut",
        onStart: () => audio.play("bonk"),
        onComplete: () => {
          this.turkey.setVisible(false);
          this.turkeyShadow.setVisible(false);
          for (const name in this.powerT) this.powerT[name] = 0;
          this.movePowers(0, this.turkey.x);
          audio.play("caught");
          text(this, W / 2, 440, "CAUGHT!", 72, { color: "#ff9e9e", strokeThickness: 10 }).setDepth(5000);
          text(this, W / 2, 520, "Back to the coop, you!", 28, { color: "#ffffff", strokeThickness: 6 }).setDepth(5000);
          // Silly, not sad: the turkey peeks out from under the lid.
          this.tweens.add({ targets: lid, angle: -8, y: GROUND_Y - 4, duration: 300, delay: 500, yoyo: true, hold: 300 });
        },
      },
    ] });
    this.time.delayedCall(2600, () => (this.run.corn >= REVIVE_COST ? this.askRevive() : this.finish(false)));
  }

  askRevive() {
    const shown = [
      text(this, W / 2, 580, `REVIVE FOR ${REVIVE_COST} CORN?`, 26, { color: "#ffe066", strokeThickness: 6 }),
      text(this, W / 2, 616, `YOU HAVE ${this.run.corn}`, 18, { color: "#ffffff", strokeThickness: 4 }),
    ];
    for (const [r, colour, words, size] of [[REVIVE_BUTTON, 0x2a9d3a, "▶ REVIVE", 34], [GIVE_UP, 0x7d5a3c, "GIVE UP", 24]]) {
      const btn = button(this, r, colour, words, size);
      btn.g.setDepth(5001);
      btn.label.setDepth(5001);
      shown.push(btn.g, btn.label);
    }
    for (const o of shown.slice(0, 2)) o.setDepth(5001);
    this.reviveUI = shown;
  }

  // Starts the same day again, from the score it began with and the corn left after paying.
  revive() {
    audio.play("gobble");
    this.scene.start("Day", { day: this.run.day, score: this.dayStart, corn: this.run.corn - REVIVE_COST });
  }

  finish(pardoned) {
    if (pardoned) this.run.score += POINTS.pardon;
    const score = Math.round(this.run.score);
    const day = pardoned ? DAYS.length + 1 : this.run.day + 1;
    const { rank, previousTop } = store.recordRun(score, day, this.run.corn);
    this.scene.start("Results", { score, day, corn: this.run.corn, pardoned, rank, previousTop });
  }

  // ---- score, corn, pause, how far ----

  makeHud() {
    const d = 5000;
    const g = this.add.graphics().setDepth(d);
    g.fillStyle(0x000000, 0.32).fillRect(0, 0, W, 76);
    this.scoreText = text(this, 16, 30, "0", 30, { originX: 0 }).setDepth(d);
    sized(this.add.image(W - 26, 30, "corn"), 0.8).setDepth(d);
    this.cornText = text(this, W - 48, 30, "0", 30, { originX: 1, color: "#ffe066" }).setDepth(d);
    // the pause button
    g.fillStyle(0xffffff, 0.9).fillCircle(W / 2, 32, 24);
    g.fillStyle(0x2b1d14).fillRect(W / 2 - 9, 21, 6, 22).fillRect(W / 2 + 3, 21, 6, 22);
    // how far through the day: a little turkey along a track
    this.trackX = [60, W - 60];
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(this.trackX[0], 62, this.trackX[1] - this.trackX[0], 6, 3);
    text(this, this.trackX[0] - 8, 65, this.rules.short, 13, { originX: 1, strokeThickness: 3 }).setDepth(d);
    text(this, this.trackX[1] + 8, 65, this.rules.boss ? "FREE" : DAYS[this.run.day + 1].short, 13, { originX: 0, strokeThickness: 3 }).setDepth(d);
    this.marker = sized(this.add.image(this.trackX[0], 65, "turkey"), 0.16).setDepth(d + 1);
    // the power-ups going, each with how long it has left
    this.powerIcons = {};
    for (const name in POWERS) this.powerIcons[name] = sized(this.add.image(0, 30, name), 0.45).setDepth(d).setVisible(false);
    this.powerBars = this.add.graphics().setDepth(d);
  }

  // The power-ups count down and show on the turkey. They blink when time's nearly up.
  movePowers(dt, x) {
    const on = {};
    for (const name in this.powerT) {
      this.powerT[name] = Math.max(0, this.powerT[name] - dt);
      const left = this.powerT[name];
      on[name] = left > 0 && this.phase !== "caught" && !(left < 3 && Math.floor(left * 6) % 2 === 0);
    }
    const cy = this.turkey.y - 60;
    // the pumpkins circle the turkey; the near ones pass in front of it
    this.shieldGlow.setPosition(x, cy).setVisible(on.pumpkin);
    this.shieldBits.forEach((bit, i) => {
      const a = this.clock * 4 + (i * Math.PI * 2) / this.shieldBits.length;
      bit.setPosition(x + Math.cos(a) * 95, cy + Math.sin(a) * 34).setDepth(Math.sin(a) > 0 ? 2001 : 1999);
      bit.setAngle(a * 40).setVisible(on.pumpkin);
    });
    // sneakers on its feet, stepping in turn
    const step = this.clock * this.speed * 0.9;
    this.feet.forEach((foot, i) => {
      const side = i ? 1 : -1;
      foot.setPosition(x + side * 26, this.turkey.y + 8 - Math.max(0, Math.sin(step + i * Math.PI)) * 14).setFlipX(i === 0).setVisible(on.sneakers);
    });
    this.speedLines.clear();
    if (on.sneakers) {
      this.speedLines.lineStyle(4, 0xffffff, 0.55);
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const r1 = Phaser.Math.Between(140, 320);
        const r2 = r1 + Phaser.Math.Between(60, 200);
        this.speedLines.lineBetween(W / 2 + Math.cos(a) * r1, HORIZON + 40 + Math.sin(a) * r1, W / 2 + Math.cos(a) * r2, HORIZON + 40 + Math.sin(a) * r2);
      }
    }
    // the magnet, held up over its head
    this.magnetIcon.setPosition(x, this.turkey.y - this.turkey.displayHeight - 20 + Math.sin(this.clock * 8) * 5).setVisible(on.magnet);
    // with little zaps coming off its tips, so it reads as a magnet
    this.zaps.clear();
    if (on.magnet) {
      const m = this.magnetIcon;
      const tipY = m.y - m.displayHeight * 0.45;
      this.zaps.lineStyle(4, 0xffe066, 0.95);
      for (const side of [-1, 1]) {
        const tx = m.x + side * m.displayWidth * 0.3;
        for (let i = 0; i < 2; i++) {
          const a = -Math.PI / 2 + side * (0.3 + Math.random() * 0.6);
          const r = 10 + Math.random() * 6;
          this.zaps.lineBetween(tx + Math.cos(a) * r, tipY + Math.sin(a) * r, tx + Math.cos(a) * (r + 14), tipY + Math.sin(a) * (r + 14));
        }
      }
    }
  }

  updateHud() {
    this.scoreText.setText(Math.round(this.run.score).toLocaleString());
    this.cornText.setText(String(this.run.corn));
    const f = Math.min(1, this.distance / this.rules.length);
    this.marker.x = this.trackX[0] + f * (this.trackX[1] - this.trackX[0]);
    // the power-ups going, right to left from the corn, each with a bar of the time it has left
    this.powerBars.clear();
    let px = W - 130;
    for (const name in POWERS) {
      const left = this.powerT[name];
      this.powerIcons[name].setVisible(left > 0).setX(px);
      if (left <= 0) continue;
      this.powerBars.fillStyle(0x000000, 0.4).fillRoundedRect(px - 26, 50, 52, 8, 4);
      this.powerBars.fillStyle(0xffa53a).fillRoundedRect(px - 26, 50, 52 * (left / POWERS[name].seconds), 8, 4);
      px -= 64;
    }
  }
}

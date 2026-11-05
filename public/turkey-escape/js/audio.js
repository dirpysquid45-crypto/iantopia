// Sound: effects made with the Web Audio API, plus the recorded voice lines
// (js/voices.js). Browsers only allow sound after a touch, and Android only once the touch has ended,
// so unlock() runs on both the start and the end of a touch.
import { voiceUrl } from "./voices.js";

let ctx = null;
let enabled = true;
let noiseBuffer = null;
const voices = new Map(); // url → decoded AudioBuffer

// Background track: a looping element, so the 5 MB file streams instead of being decoded up front.
let music = null;
let wantMusic = false;

function playMusic() {
  if (!enabled || !wantMusic || typeof Audio === "undefined") return;
  if (!music) {
    music = new Audio("audio/feel-the-heat.mp3");
    music.loop = true;
    music.volume = 0.35;
  }
  music.play().catch(() => {});
}

// One-off clips (such as the sneakers' pop). The same element is reused, so rapid hits just restart it.
const clips = new Map();

export function playClip(url, volume = 0.6) {
  if (!enabled || typeof Audio === "undefined") return;
  const clip = clips.get(url) ?? new Audio(url);
  clips.set(url, clip);
  clip.currentTime = 0;
  clip.volume = volume;
  clip.play().catch(() => {});
}

export function startMusic() {
  wantMusic = true;
  playMusic();
}

export function stopMusic() {
  wantMusic = false;
  music?.pause();
}

export function setEnabled(on) {
  enabled = on;
  if (on) playMusic();
  else music?.pause();
}

export function unlock() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  if (music?.paused) playMusic();
}

function ready() {
  return enabled && ctx && ctx.state === "running";
}

function tone(freq, duration, { type = "square", volume = 0.06, slideTo = null, delay = 0, at = null, out = null } = {}) {
  if (!ready()) return;
  const t0 = at ?? ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(out || ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(duration, { volume = 0.15, filter = 1200, type = "lowpass", delay = 0, at = null, out = null } = {}) {
  if (!ready()) return;
  const t0 = at ?? ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filter;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f).connect(gain).connect(out || ctx.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

const SOUNDS = {
  // A turkey's gobble: a fast warble that wobbles down, twice.
  gobble() {
    for (let i = 0; i < 7; i++) tone(560 - i * 32 + (i % 2) * 150, 0.055, { type: "sawtooth", volume: 0.04, delay: i * 0.05 });
    for (let i = 0; i < 5; i++) tone(500 - i * 30 + (i % 2) * 130, 0.05, { type: "sawtooth", volume: 0.03, delay: 0.42 + i * 0.05 });
  },
  jump() {
    tone(260, 0.22, { type: "sine", volume: 0.09, slideTo: 620 });
  },
  slide() {
    noise(0.3, { volume: 0.1, filter: 900, type: "bandpass" });
  },
  lane() {
    noise(0.07, { volume: 0.05, filter: 2400, type: "bandpass" });
  },
  corn() {
    tone(880 + Math.random() * 60, 0.07, { type: "sine", volume: 0.05, slideTo: 1320 });
  },
  pumpkin() {
    [392, 523, 659].forEach((f, i) => tone(f, 0.12, { type: "triangle", volume: 0.08, delay: i * 0.08 }));
  },
  // turbo sneakers: a rising whoosh and a squeak of rubber
  sneakers() {
    noise(0.45, { volume: 0.14, filter: 1400, type: "bandpass" });
    tone(300, 0.4, { type: "sine", volume: 0.07, slideTo: 1400 });
    tone(2200, 0.08, { type: "square", volume: 0.02, delay: 0.38 });
  },
  // the corn magnet: an electric buzz
  magnet() {
    tone(110, 0.45, { type: "sawtooth", volume: 0.04, slideTo: 220 });
    tone(1760, 0.3, { type: "square", volume: 0.012, slideTo: 2640, delay: 0.05 });
  },
  // smashing through something in the turbo sneakers
  smash() {
    noise(0.2, { volume: 0.3, filter: 1800, type: "bandpass" });
    tone(160, 0.18, { type: "square", volume: 0.06, slideTo: 70 });
  },
  shield() {
    tone(700, 0.3, { type: "triangle", volume: 0.08, slideTo: 300 });
    noise(0.2, { volume: 0.2, filter: 1500 });
  },
  bonk() {
    noise(0.15, { volume: 0.35, filter: 600 });
    tone(180, 0.2, { type: "sine", volume: 0.2, slideTo: 60 });
  },
  pan() {
    tone(1200, 0.5, { type: "triangle", volume: 0.07, slideTo: 1150 });
    tone(1810, 0.4, { type: "sine", volume: 0.04 });
  },
  caught() {
    tone(392, 0.2, { type: "triangle", volume: 0.08 });
    tone(330, 0.2, { type: "triangle", volume: 0.08, delay: 0.2 });
    tone(262, 0.6, { type: "triangle", volume: 0.08, slideTo: 200, delay: 0.4 });
  },
  pop() {
    tone(500, 0.08, { type: "sine", volume: 0.06, slideTo: 900 });
  },
  tick() {
    tone(660, 0.05, { type: "square", volume: 0.03 });
  },
  cheer() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: "triangle", volume: 0.07, delay: i * 0.12 }));
  },
  fanfare() {
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 7 ? 0.5 : 0.12, { type: "triangle", volume: 0.07, delay: i * 0.13 }));
  },
  groan() {
    tone(300, 0.6, { type: "sawtooth", volume: 0.04, slideTo: 120 });
  },
};

export function play(name) {
  SOUNDS[name]?.();
}

// ---------------------------------------------------------------------------------------------
// Says one of the recorded lines (js/voices.js), fetched and decoded the first time it is needed.
// One voice at a time: a new line cuts off the last one.
let speaking = null;

export async function say(id) {
  const url = voiceUrl(id);
  if (!url || !ready()) return false;
  try {
    let buffer = voices.get(url);
    if (!buffer) {
      const bytes = await (await fetch(url)).arrayBuffer();
      buffer = await ctx.decodeAudioData(bytes);
      voices.set(url, buffer);
    }
    try {
      speaking?.stop();
    } catch {
      // it had already finished
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
    speaking = src;
    return true;
  } catch {
    return false;
  }
}

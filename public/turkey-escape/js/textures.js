// Stand-in art drawn in code, until the cartoon pictures are made: the turkey (seen from behind),
// the farmer, everything in the way, the corn and the pumpkin, the roadside props.
// A picture in img/ with the same name replaces any of these (BootScene loads them first).
// Every picture is drawn at the size it shows right next to the turkey; farther away it shrinks.

const SIZE = {}; // each stand-in's size: a picture of any size is shown at its width or height
// Things in the road and the pick-ups are fitted to their stand-in's width (so they fill the lane);
// the characters and the roadside props to its height.
const BY_WIDTH = ["fence", "hay", "puddle", "crate", "banner", "tractor", "wagon", "truck", "corn", "pumpkin", "sneakers", "magnet",
  "pumpkins", "basket", "pigpen", "squash", "cone", "drum", "sled", "ice", "ladder", "bunting", "awning", "sign", "streamers",
  "icebranch", "wheelbarrow", "applecart", "candy", "piecart", "cart", "car", "float", "snowman"];

function make(scene, key, w, h, draw) {
  SIZE[key] = { w, h };
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ add: false });
  draw(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
}

// Scales a picture so it shows at its stand-in's size, times `scale`.
export function sized(img, scale = 1) {
  const key = img.texture.key;
  const want = SIZE[key];
  if (!want) return img.setScale(scale);
  const fit = BY_WIDTH.includes(key) ? want.w / img.frame.width : want.h / img.frame.height;
  return img.setScale(scale * fit);
}

const INK = 0x2b1d14;

export function makeTextures(scene) {
  // The turkey from behind: a big fan of tail feathers, the body, the head peeking over.
  const turkey = (g, w, h, squash = 1) => {
    const cx = w / 2;
    const base = h - 14;
    const fanY = base - 52 * squash;
    const colours = [0x8b4513, 0xc4561d, 0xe8a33d, 0xc4561d, 0x8b4513, 0xc4561d, 0xe8a33d];
    for (let i = 0; i < 7; i++) {
      const a = Phaser.Math.DegToRad(200 + i * 23.3);
      const fx = cx + Math.cos(a) * 34;
      const fy = fanY + Math.sin(a) * 34 * squash;
      g.fillStyle(INK).fillEllipse(fx, fy, 30, 56 * squash);
      g.fillStyle(colours[i]).fillEllipse(fx, fy, 25, 51 * squash);
      g.fillStyle(0xfff3c4).fillEllipse(cx + Math.cos(a) * 52, fanY + Math.sin(a) * 52 * squash, 12, 12 * squash);
    }
    // head and wattle, over the fan
    g.fillStyle(INK).fillCircle(cx, fanY - 64 * squash, 14);
    g.fillStyle(0x9fc3e0).fillCircle(cx, fanY - 64 * squash, 11);
    g.fillStyle(0xd32f2f).fillEllipse(cx + 9, fanY - 54 * squash, 9, 16);
    // body
    g.fillStyle(INK).fillEllipse(cx, base - 26 * squash, 76, 62 * squash);
    g.fillStyle(0x6b3a1e).fillEllipse(cx, base - 26 * squash, 70, 56 * squash);
    g.fillStyle(0x8b5a2b).fillEllipse(cx, base - 34 * squash, 44, 26 * squash);
    // legs
    g.fillStyle(0xf0a020);
    g.fillRect(cx - 18, base - 4, 7, 14);
    g.fillRect(cx + 11, base - 4, 7, 14);
  };
  make(scene, "turkey", 120, 140, (g, w, h) => turkey(g, w, h));
  // looking back over its shoulder in a panic: after a stumble, and on the title
  make(scene, "turkey-scared", 120, 140, (g, w, h) => turkey(g, w, h));
  // the big faces at the end of a day: sweating, cheering, cool in sunglasses
  for (const key of ["turkey-phew", "turkey-yay", "turkey-cool"]) make(scene, key, 120, 140, (g, w, h) => turkey(g, w, h));

  // The farmer, running at you, roasting pan held high.
  const farmer = (g) => {
    const cx = 90;
    // pan up high
    g.fillStyle(INK).fillEllipse(cx, 26, 150, 44);
    g.fillStyle(0x9aa4ad).fillEllipse(cx, 26, 142, 36);
    g.fillStyle(0xc8d0d8).fillEllipse(cx, 22, 120, 22);
    // arms up
    g.fillStyle(INK).fillRect(cx - 62, 30, 20, 80).fillRect(cx + 42, 30, 20, 80);
    g.fillStyle(0xc0392b).fillRect(cx - 59, 40, 14, 70).fillRect(cx + 45, 40, 14, 70);
    // legs and boots
    g.fillStyle(INK).fillRect(cx - 34, 176, 28, 54).fillRect(cx + 6, 176, 28, 54);
    g.fillStyle(0x2e5aa8).fillRect(cx - 31, 176, 22, 46).fillRect(cx + 9, 176, 22, 46);
    g.fillStyle(0x4a2a12).fillRoundedRect(cx - 38, 218, 34, 18, 6).fillRoundedRect(cx + 4, 218, 34, 18, 6);
    // shirt and overalls
    g.fillStyle(INK).fillRoundedRect(cx - 46, 96, 92, 90, 20);
    g.fillStyle(0xc0392b).fillRoundedRect(cx - 43, 99, 86, 84, 18);
    g.lineStyle(2, 0x8e2a20);
    for (let x = cx - 36; x < cx + 40; x += 12) g.lineBetween(x, 100, x, 182);
    g.fillStyle(0x2e5aa8).fillRect(cx - 30, 128, 60, 56);
    g.fillStyle(0x2e5aa8).fillRect(cx - 30, 100, 10, 30).fillRect(cx + 20, 100, 10, 30);
    g.fillStyle(0xf0c040).fillCircle(cx - 25, 132, 4).fillCircle(cx + 25, 132, 4);
    // head: round, red cheeks, big moustache, straw hat
    g.fillStyle(INK).fillCircle(cx, 78, 30);
    g.fillStyle(0xf2c9a0).fillCircle(cx, 78, 27);
    g.fillStyle(0xe88a7a).fillCircle(cx - 15, 86, 6).fillCircle(cx + 15, 86, 6);
    g.fillStyle(INK).fillCircle(cx - 9, 74, 3.5).fillCircle(cx + 9, 74, 3.5);
    g.fillStyle(0x6b4a2a).fillEllipse(cx - 9, 90, 20, 8).fillEllipse(cx + 9, 90, 20, 8);
    g.fillStyle(INK).fillEllipse(cx, 60, 96, 16);
    g.fillStyle(0xe8c55a).fillEllipse(cx, 59, 90, 12);
    g.fillStyle(INK).fillRoundedRect(cx - 26, 36, 52, 26, 8);
    g.fillStyle(0xe8c55a).fillRoundedRect(cx - 23, 39, 46, 22, 7);
    g.fillStyle(0xc0392b).fillRect(cx - 23, 52, 46, 6);
  };
  // In play he's behind the turkey (seen from behind in the pictures); on the title, from the front.
  for (const key of ["farmer", "farmer-front", "farmer-empty"]) make(scene, key, 180, 240, farmer);

  // JUMP over these
  make(scene, "fence", 150, 84, (g) => {
    g.fillStyle(INK).fillRect(8, 6, 18, 78).fillRect(124, 6, 18, 78);
    g.fillStyle(0xf2efe6).fillRect(11, 9, 12, 75).fillRect(127, 9, 12, 75);
    for (const y of [16, 40]) {
      g.fillStyle(INK).fillRect(0, y, 150, 18);
      g.fillStyle(0xf2efe6).fillRect(2, y + 2, 146, 14);
    }
  });
  make(scene, "hay", 140, 92, (g) => {
    g.fillStyle(INK).fillRoundedRect(0, 0, 140, 92, 12);
    g.fillStyle(0xe8c55a).fillRoundedRect(3, 3, 134, 86, 10);
    g.lineStyle(2, 0xc9a640);
    for (let y = 14; y < 88; y += 10) g.lineBetween(8, y, 132, y + (y % 20 ? 3 : -3));
    g.fillStyle(0xb5651d).fillRect(36, 3, 6, 86).fillRect(98, 3, 6, 86);
  });
  make(scene, "puddle", 150, 44, (g) => {
    g.fillStyle(0x4a7fb8).fillEllipse(75, 22, 150, 44);
    g.fillStyle(0x6fa8dc).fillEllipse(75, 20, 128, 30);
    g.fillStyle(0xffffff, 0.6).fillEllipse(52, 16, 34, 7);
  });
  make(scene, "crate", 120, 96, (g) => {
    g.fillStyle(INK).fillRect(0, 0, 120, 96);
    g.fillStyle(0xb5803f).fillRect(3, 3, 114, 90);
    g.lineStyle(6, 0x8a5a2b).strokeRect(8, 8, 104, 80);
    g.lineBetween(10, 10, 110, 86);
    g.lineBetween(110, 10, 10, 86);
  });

  // DUCK under these: tall, with a gap at the bottom a ducking turkey fits through
  const posts = (g, colour) => {
    g.fillStyle(INK).fillRect(0, 0, 14, 200).fillRect(136, 0, 14, 200);
    g.fillStyle(colour).fillRect(3, 0, 8, 200).fillRect(139, 0, 8, 200);
  };
  make(scene, "line", 150, 200, (g) => {
    posts(g, 0x8a5a2b);
    g.lineStyle(3, INK).lineBetween(7, 40, 143, 40);
    // laundry: a shirt, long johns, a sock
    g.fillStyle(INK).fillRect(18, 38, 42, 52);
    g.fillStyle(0xe74c3c).fillRect(21, 41, 36, 46);
    g.fillStyle(INK).fillRect(64, 38, 38, 86);
    g.fillStyle(0xf2efe6).fillRect(67, 41, 32, 80);
    g.fillStyle(INK).fillRect(82, 80, 2, 44);
    g.fillStyle(INK).fillRect(110, 38, 18, 44);
    g.fillStyle(0x3fa34d).fillRect(113, 41, 12, 38);
  });
  make(scene, "banner", 150, 200, (g) => {
    posts(g, 0x555555);
    g.fillStyle(INK).fillRect(10, 36, 130, 76);
    g.fillStyle(0xf4e4c1).fillRect(13, 39, 124, 70);
    g.fillStyle(0xc4561d);
    for (let x = 13; x < 137; x += 20) g.fillTriangle(x, 109, x + 20, 109, x + 10, 124);
    g.fillStyle(0x8b4513).fillRect(30, 60, 90, 8).fillRect(30, 78, 70, 8);
  });

  // BLOCKERS: swipe around these
  make(scene, "tractor", 150, 190, (g) => {
    g.fillStyle(INK).fillRect(70, 0, 12, 50);
    g.fillStyle(INK).fillRoundedRect(28, 40, 94, 90, 12);
    g.fillStyle(0xc0392b).fillRoundedRect(31, 43, 88, 84, 10);
    g.fillStyle(0x9fd3f0).fillRect(44, 54, 62, 34);
    g.fillStyle(INK).fillRect(8, 104, 40, 86).fillRect(102, 104, 40, 86);
    g.fillStyle(0x444444).fillRect(13, 109, 30, 76).fillRect(107, 109, 30, 76);
    g.fillStyle(INK).fillRect(40, 130, 70, 30);
    g.fillStyle(0xf0c040).fillRect(48, 136, 54, 16);
  });
  make(scene, "wagon", 150, 170, (g) => {
    g.fillStyle(0xe8c55a);
    for (const [x, y] of [[30, 30], [75, 18], [118, 32], [52, 50], [100, 50]]) g.fillCircle(x, y, 26);
    g.fillStyle(INK).fillRect(4, 56, 142, 84);
    g.fillStyle(0x8a5a2b).fillRect(7, 59, 136, 78);
    g.lineStyle(3, 0x6b4420);
    for (let y = 78; y < 136; y += 18) g.lineBetween(8, y, 142, y);
    g.fillStyle(INK).fillCircle(26, 146, 22).fillCircle(124, 146, 22);
    g.fillStyle(0x666666).fillCircle(26, 146, 16).fillCircle(124, 146, 16);
  });
  make(scene, "truck", 150, 180, (g) => {
    g.fillStyle(INK).fillRoundedRect(4, 10, 142, 150, 16);
    g.fillStyle(0x2a7fc0).fillRoundedRect(7, 13, 136, 144, 14);
    g.fillStyle(0x9fd3f0).fillRoundedRect(22, 26, 106, 46, 8);
    g.fillStyle(0xd0d0d0).fillRect(7, 110, 136, 18);
    g.fillStyle(0xd32f2f).fillRect(14, 88, 22, 14).fillRect(114, 88, 22, 14);
    g.fillStyle(INK).fillRect(12, 150, 34, 30).fillRect(104, 150, 34, 30);
  });

  // The later days' things in the way, as plain shapes until their pictures load: a box to jump,
  // a band on two posts to duck under, a big block to swerve round.
  const box = (colour) => (g, w, h) => {
    g.fillStyle(INK).fillRoundedRect(0, 0, w, h, 12);
    g.fillStyle(colour).fillRoundedRect(3, 3, w - 6, h - 6, 10);
  };
  const band = (colour) => (g) => {
    posts(g, 0x8a5a2b);
    g.fillStyle(INK).fillRect(10, 36, 130, 50);
    g.fillStyle(colour).fillRect(13, 39, 124, 44);
  };
  for (const [key, w, h, colour] of [
    ["pumpkins", 140, 80, 0xf07c1a], ["basket", 120, 96, 0xb5803f], ["pigpen", 150, 84, 0xf4a6b8], ["squash", 120, 96, 0x8fae3c],
    ["cone", 90, 90, 0xff7a1a], ["drum", 130, 90, 0xc0392b], ["sled", 140, 60, 0xa0522d], ["ice", 150, 44, 0xbfe6f5],
    ["wheelbarrow", 150, 150, 0xc0392b], ["applecart", 150, 170, 0x8a5a2b], ["candy", 150, 190, 0xf4a6c8], ["piecart", 150, 180, 0xe8c55a],
    ["cart", 140, 150, 0xc8ccd4], ["car", 150, 150, 0xd32f2f], ["float", 150, 200, 0xf0a020], ["snowman", 130, 190, 0xffffff],
    ["appletree", 140, 220, 0x5a9e3a], ["tent", 200, 200, 0xe74c3c], ["stall", 180, 190, 0xb5803f], ["balloon", 140, 240, 0xf07c1a],
    ["pine", 130, 230, 0x2e7d4f],
  ]) make(scene, key, w, h, box(colour));
  for (const [key, colour] of [["ladder", 0xb5803f], ["bunting", 0xf0a020], ["awning", 0xe74c3c], ["sign", 0xf7d33c],
    ["streamers", 0xe0662a], ["icebranch", 0xdde6f0]]) make(scene, key, 150, 200, band(colour));

  // Pick-ups
  make(scene, "corn", 34, 54, (g) => {
    g.fillStyle(0x3fa34d).fillTriangle(4, 54, 17, 18, 14, 54).fillTriangle(30, 54, 17, 18, 20, 54);
    g.fillStyle(INK).fillEllipse(17, 24, 24, 46);
    g.fillStyle(0xf7d33c).fillEllipse(17, 24, 19, 41);
    g.fillStyle(0xe8b020);
    for (let y = 8; y < 44; y += 7) for (const x of [12, 17, 22]) g.fillCircle(x, y, 1.6);
  });
  make(scene, "pumpkin", 76, 68, (g) => {
    g.fillStyle(0x3d6b22).fillRect(34, 0, 9, 16);
    g.fillStyle(INK).fillEllipse(38, 40, 76, 56);
    g.fillStyle(0xf07c1a).fillEllipse(38, 40, 70, 50);
    g.fillStyle(0xd8650f).fillEllipse(38, 40, 24, 50);
    g.fillStyle(0xffffff, 0.4).fillEllipse(20, 30, 10, 18);
  });
  // The roasting pan's lid, which comes down over a caught turkey. Plonk.
  make(scene, "lid", 190, 130, (g) => {
    g.fillStyle(INK).fillRoundedRect(80, 0, 30, 18, 6);
    g.fillStyle(0x9aa4ad).fillRoundedRect(84, 3, 22, 12, 4);
    g.fillStyle(INK).fillEllipse(95, 110, 190, 40);
    g.fillStyle(INK).fillRoundedRect(10, 16, 170, 104, { tl: 80, tr: 80, bl: 10, br: 10 });
    g.fillStyle(0xb8c2cc).fillRoundedRect(14, 20, 162, 96, { tl: 76, tr: 76, bl: 8, br: 8 });
    g.fillStyle(0xe6ecf2).fillEllipse(60, 52, 30, 46);
    g.fillStyle(0x9aa4ad).fillEllipse(95, 112, 182, 30);
  });
  // more power-ups: turbo sneakers (a pair to pick up, one for each foot) and the corn magnet
  const sneaker = (g, x, y) => {
    g.fillStyle(INK).fillRoundedRect(x, y, 40, 24, 8);
    g.fillStyle(0xe63946).fillRoundedRect(x + 3, y + 3, 34, 14, 6);
    g.fillStyle(0xffffff).fillRect(x + 3, y + 16, 34, 5);
  };
  make(scene, "sneakers", 76, 50, (g) => {
    sneaker(g, 2, 4);
    sneaker(g, 32, 22);
  });
  make(scene, "sneaker", 44, 28, (g) => sneaker(g, 2, 2));
  make(scene, "magnet", 70, 72, (g) => {
    g.lineStyle(22, INK).beginPath().arc(35, 30, 22, 0, Math.PI).strokePath();
    g.fillStyle(INK).fillRect(2, 8, 22, 24).fillRect(46, 8, 22, 24);
    g.lineStyle(16, 0xe63946).beginPath().arc(35, 30, 22, 0, Math.PI).strokePath();
    g.fillStyle(0xe63946).fillRect(5, 22, 16, 10).fillRect(49, 22, 16, 10);
    g.fillStyle(0xd0d4d8).fillRect(5, 9, 16, 14).fillRect(49, 9, 16, 14);
  });

  // a drop of sweat, for the end of a day
  make(scene, "drop", 26, 38, (g) => {
    g.fillStyle(INK).fillCircle(13, 24, 13).fillTriangle(1, 22, 25, 22, 13, 0);
    g.fillStyle(0x7cc8f0).fillCircle(13, 24, 10).fillTriangle(4, 22, 22, 22, 13, 4);
    g.fillStyle(0xffffff).fillCircle(9, 22, 3);
  });

  make(scene, "shadow", 100, 26, (g) => {
    g.fillStyle(0x000000, 0.28).fillEllipse(50, 13, 100, 26);
  });

  // Roadside props
  make(scene, "tree", 140, 220, (g) => {
    g.fillStyle(INK).fillRect(60, 120, 22, 100);
    g.fillStyle(0x6b4420).fillRect(63, 120, 16, 100);
    for (const [x, y, r, c] of [[70, 80, 56, 0xe0662a], [40, 110, 36, 0xf0a020], [102, 106, 38, 0xc0392b], [70, 44, 40, 0xf0a020]]) {
      g.fillStyle(INK).fillCircle(x, y, r + 3);
      g.fillStyle(c).fillCircle(x, y, r);
    }
  });
  make(scene, "scarecrow", 120, 200, (g) => {
    g.fillStyle(0x6b4420).fillRect(56, 40, 8, 160).fillRect(10, 76, 100, 8);
    g.fillStyle(INK).fillRect(32, 70, 56, 64);
    g.fillStyle(0x2e5aa8).fillRect(35, 73, 50, 58);
    g.fillStyle(INK).fillCircle(60, 52, 22);
    g.fillStyle(0xe8d4a0).fillCircle(60, 52, 19);
    g.fillStyle(0x8b4513).fillTriangle(30, 38, 90, 38, 60, 6);
  });
  make(scene, "house", 200, 220, (g) => {
    g.fillStyle(INK).fillTriangle(0, 90, 200, 90, 100, 0);
    g.fillStyle(0x8e3b2a).fillTriangle(8, 86, 192, 86, 100, 6);
    g.fillStyle(INK).fillRect(14, 86, 172, 134);
    g.fillStyle(0xf4e4c1).fillRect(17, 89, 166, 131);
    g.fillStyle(0x9fd3f0).fillRect(34, 112, 44, 40).fillRect(122, 112, 44, 40);
    g.fillStyle(0x6b4420).fillRect(84, 150, 32, 70);
  });
  make(scene, "lamp", 50, 220, (g) => {
    g.fillStyle(INK).fillRect(20, 30, 10, 190);
    g.fillStyle(INK).fillRoundedRect(6, 6, 38, 34, 8);
    g.fillStyle(0xffe680).fillRoundedRect(10, 10, 30, 26, 6);
  });
}

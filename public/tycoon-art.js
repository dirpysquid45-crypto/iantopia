// tycoon-art.js
// Everything My Iantopia draws that isn't game logic: the procedural pixel art
// for every building, and the painters that compose the photographic ground
// layers (grass, cobbled road, animated water).
//
// Split out of tycoon.astro for two reasons. It is ~500 lines of pure drawing
// that has no business sharing a scope with the economy, and as its own file
// the browser caches it instead of re-parsing it inline on every visit.
//
// Performance model, since this is what the structure is for:
//   * Buildings are BAKED once per type to an offscreen canvas and then shown
//     as ordinary sprites. The art functions below issue hundreds of 1px
//     fillRects (that is what makes the gradients); doing that every refresh
//     was the single biggest cost. Now it happens once per type, ever.
//   * Terrain (grass + zones + roads) is composed to one canvas and only
//     recomposed when a tile or a building footprint actually changes.
//   * Water is the only thing that animates, on its own small canvas, and only
//     while at least one water tile exists.
window.TycoonArt = (function () {
  const T = 16;          // art pixels per tile
  const PAD_TOP = 12;    // art may rise above its footprint (chimneys, spires, steam)

  // ---------------------------------------------------------------- helpers
  const hex = (s) => parseInt(s.replace('#', ''), 16);

  // `g` only needs fillStyle(color, alpha) and fillRect(x, y, w, h). A Phaser
  // Graphics object has both, and so does the canvas adapter below, which is
  // what lets the same art code draw to either.
  function rect(g, color, x, y, w, h, alpha) {
    g.fillStyle(hex(color), alpha == null ? 1 : alpha);
    g.fillRect(x, y, w, h);
  }
  function mix(c1, c2, t) {
    const a = hex(c1), b = hex(c2);
    const r = Math.round(((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t));
    const gr = Math.round(((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t));
    const bl = Math.round((a & 255) + (((b & 255) - (a & 255)) * t));
    return (r << 16) | (gr << 8) | bl;
  }
  // 1px-band gradients: still crisp pixel art, just shaded.
  function vgrad(g, x, y, w, h, top, bottom, alpha) {
    for (let i = 0; i < h; i++) {
      g.fillStyle(mix(top, bottom, h <= 1 ? 0 : i / (h - 1)), alpha == null ? 1 : alpha);
      g.fillRect(x, y + i, w, 1);
    }
  }
  function hgrad(g, x, y, w, h, left, right, alpha) {
    for (let i = 0; i < w; i++) {
      g.fillStyle(mix(left, right, w <= 1 ? 0 : i / (w - 1)), alpha == null ? 1 : alpha);
      g.fillRect(x + i, y, 1, h);
    }
  }
  // Stable pseudo-random, so baked art and window patterns never differ
  // between sessions or redraws.
  const rnd = (x, y, salt) => {
    const n = Math.imul((x * 73856093) ^ (y * 19349663) ^ ((salt || 0) * 83492791), 2654435761) >>> 0;
    return n / 4294967296;
  };

  function surface(ctx) {
    return {
      fillStyle(c, a) {
        ctx.fillStyle = 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',' + (a == null ? 1 : a) + ')';
      },
      fillRect(x, y, w, h) { ctx.fillRect(x, y, w, h); },
    };
  }

  // ------------------------------------------------------------- building art
  // Light comes from the upper left throughout: every facade has a lit edge and
  // a shadowed one, and roofs carry a top highlight. (ox, oy) is the top-left of
  // the footprint; anything drawn above oy lands in the PAD_TOP margin.
  const ART = {
    shabby_apartment(g, ox, oy) {
      rect(g, '#1a0f08', ox + 1, oy + 3, 14, 12, 0.5);
      vgrad(g, ox + 2, oy + 5, 12, 10, '#bb9468', '#6d4f33');
      hgrad(g, ox + 2, oy + 5, 4, 10, '#d4ab7c', '#bb9468');
      rect(g, '#573a22', ox + 13, oy + 5, 1, 10);
      for (let r = 0; r < 4; r++) rect(g, '#5d4028', ox + 2, oy + 7 + r * 2, 12, 1, 0.35);
      vgrad(g, ox + 1, oy + 2, 14, 4, '#9c4b38', '#6d2f22');
      rect(g, '#c06a4e', ox + 1, oy + 2, 14, 1);
      rect(g, '#3a1d14', ox + 1, oy + 5, 14, 1);
      [3, 10].forEach((wx) => {
        rect(g, '#2a1a10', ox + wx, oy + 8, 3, 3);
        vgrad(g, ox + wx, oy + 8, 3, 3, '#ffe9a8', '#e8a94c');
        rect(g, '#fff6d2', ox + wx, oy + 8, 1, 1);
      });
      vgrad(g, ox + 7, oy + 10, 3, 5, '#5e3a1e', '#3a2412');
      rect(g, '#d7b06a', ox + 9, oy + 12, 1, 1);
      vgrad(g, ox + 11, oy - 1, 2, 4, '#7d7d7d', '#4e4e4e');
      rect(g, '#cfcfcf', ox + 11, oy - 2, 2, 1, 0.5);
    },

    generic_building(g, ox, oy) {
      rect(g, '#14171c', ox + 1, oy + 2, 30, 13, 0.5);
      vgrad(g, ox + 2, oy + 4, 28, 11, '#a7b0bd', '#5c6470');
      hgrad(g, ox + 2, oy + 4, 6, 11, '#c3cad4', '#a7b0bd');
      rect(g, '#464d58', ox + 29, oy + 4, 1, 11);
      vgrad(g, ox + 1, oy + 1, 30, 4, '#78818e', '#4a515c');
      rect(g, '#99a2ae', ox + 1, oy + 1, 30, 1);
      rect(g, '#aeb7c2', ox + 4, oy, 5, 2);
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 6; i++) {
          const wx = ox + 4 + i * 4, wy = oy + 6 + r * 4;
          rect(g, '#20262e', wx - 1, wy - 1, 4, 4, 0.55);
          vgrad(g, wx, wy, 3, 3, '#d8f0ff', '#6f9fc4');
          rect(g, '#ffffff', wx, wy, 1, 1, 0.8);
        }
      }
      vgrad(g, ox + 14, oy + 11, 4, 4, '#4a2c17', '#2c1a0e');
      rect(g, '#ffd98a', ox + 13, oy + 10, 6, 1, 0.75);
    },

    pagoda(g, ox, oy) {
      rect(g, '#120d06', ox + 5, oy + 27, 22, 5, 0.5);
      vgrad(g, ox + 4, oy + 27, 24, 4, '#6d5436', '#3f2f1d');
      rect(g, '#8a6c48', ox + 4, oy + 27, 24, 1);
      const tiers = [{ y: 20, w: 24, wall: 6 }, { y: 12, w: 18, wall: 6 }, { y: 4, w: 12, wall: 5 }];
      tiers.forEach((t) => {
        const x = ox + 16 - t.w / 2;
        vgrad(g, x + 2, oy + t.y + 3, t.w - 4, t.wall, '#f3e6c2', '#bda77c');
        hgrad(g, x + 2, oy + t.y + 3, 3, t.wall, '#fff6dd', '#f3e6c2');
        for (let i = 0; i < 3; i++) rect(g, '#7c3b22', x + 4 + i * ((t.w - 8) / 2), oy + t.y + 4, 1, t.wall - 2, 0.6);
        vgrad(g, x - 3, oy + t.y, t.w + 6, 3, '#d4503a', '#7a1f16');
        rect(g, '#ef7a5e', x - 2, oy + t.y, t.w + 4, 1);
        rect(g, '#ffd700', x - 3, oy + t.y + 2, t.w + 6, 1);
        rect(g, '#b8911f', x - 3, oy + t.y + 3, t.w + 6, 1, 0.5);
        rect(g, '#ffd700', x - 3, oy + t.y + 1, 1, 2);
        rect(g, '#ffd700', x + t.w + 2, oy + t.y + 1, 1, 2);
      });
      vgrad(g, ox + 15, oy - 1, 2, 6, '#fff0a8', '#c9a21a');
      vgrad(g, ox + 14, oy + 23, 4, 5, '#6b3f1c', '#38200e');
      rect(g, '#ffce6b', ox + 14, oy + 25, 4, 1, 0.5);
    },

    generic_skyscraper(g, ox, oy) {
      rect(g, '#0b1118', ox + 5, oy + 4, 23, 27, 0.5);
      vgrad(g, ox + 6, oy + 4, 20, 27, '#6ea6d8', '#1e3550');
      hgrad(g, ox + 6, oy + 4, 5, 27, '#9fd0f2', '#6ea6d8', 0.55);
      rect(g, '#16293d', ox + 25, oy + 4, 1, 27);
      vgrad(g, ox + 6, oy + 4, 20, 3, '#395d80', '#24405c');
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          const wx = ox + 8 + c * 5, wy = oy + 9 + r * 4;
          const lit = rnd(c, r, 7) > 0.45;
          rect(g, '#101d2b', wx - 1, wy - 1, 4, 3, 0.5);
          vgrad(g, wx, wy, 3, 2, lit ? '#ffeab0' : '#9fd0f2', lit ? '#d99a3a' : '#4d7ba6');
        }
      }
      rect(g, '#2a4055', ox + 6, oy + 30, 20, 1);
      vgrad(g, ox + 15, oy - 2, 2, 6, '#e3e9ef', '#8d949c');
      rect(g, '#ff4444', ox + 15, oy - 3, 2, 1);
    },

    taipei_101(g, ox, oy) {
      rect(g, '#0a1710', ox + 9, oy + 39, 30, 8, 0.5);
      vgrad(g, ox + 10, oy + 39, 28, 8, '#2c5a42', '#15301f');
      rect(g, '#3f7a5c', ox + 10, oy + 39, 28, 1);
      for (let i = 0; i < 8; i++) {
        const w = i === 0 ? 14 : 12 + (i % 2 ? 4 : 0);
        const x = ox + 24 - w / 2;
        const y = oy + 36 - i * 4;
        vgrad(g, x, y, w, 4, '#49b584', '#1f6b4a');
        hgrad(g, x, y, 3, 4, '#7fd9ae', '#49b584', 0.7);
        rect(g, '#144a33', x + w - 1, y, 1, 4);
        rect(g, '#ffd700', x - 1, y + 3, w + 2, 1);
        rect(g, '#9c7a12', x - 1, y + 4, w + 2, 1, 0.45);
        rect(g, '#dff4ff', x + 2, y + 1, 2, 2, 0.9);
        rect(g, '#dff4ff', x + w - 4, y + 1, 2, 2, 0.9);
      }
      vgrad(g, ox + 18, oy + 2, 12, 4, '#49b584', '#246b4c');
      rect(g, '#ffd700', ox + 18, oy + 5, 12, 1);
      vgrad(g, ox + 23, oy - 3, 2, 6, '#f2f6fa', '#9aa3ab');
      rect(g, '#ff5555', ox + 23, oy - 4, 2, 1);
    },

    // ---- 2x2, commercial ------------------------------------------------
    bank(g, ox, oy) {
      rect(g, '#10140f', ox + 2, oy + 27, 29, 5, 0.45);
      vgrad(g, ox + 1, oy + 29, 30, 3, '#dcd9cf', '#9c998f');          // lower step
      vgrad(g, ox + 3, oy + 27, 26, 2, '#ece9df', '#b6b3a8');          // upper step
      vgrad(g, ox + 4, oy + 11, 24, 16, '#f2efe5', '#c6c2b4');         // marble body
      hgrad(g, ox + 4, oy + 11, 4, 16, '#ffffff', '#f2efe5', 0.8);
      rect(g, '#9a968a', ox + 27, oy + 11, 1, 16);
      for (let i = 0; i < 5; i++) {                                     // columns
        const x = ox + 6 + i * 5;
        vgrad(g, x, oy + 12, 2, 14, '#ffffff', '#bab6a8');
        rect(g, '#8f8b7e', x + 2, oy + 12, 1, 14, 0.55);
        rect(g, '#dcd8ca', x - 1, oy + 12, 4, 1);                      // capital
        rect(g, '#dcd8ca', x - 1, oy + 25, 4, 1);                      // base
      }
      vgrad(g, ox + 14, oy + 18, 4, 8, '#e6bf55', '#8a6a1c');         // gilded door
      rect(g, '#fff0a8', ox + 14, oy + 18, 4, 1, 0.8);
      rect(g, '#6a4f12', ox + 16, oy + 18, 1, 8, 0.6);
      for (let r = 0; r < 7; r++) {                                     // pediment
        const half = 2 + r * 2;
        const t = r / 6;
        rect(g, mixHex('#f4f1e7', '#c9c5b7', t), ox + 16 - half, oy + 3 + r, half * 2, 1);
      }
      rect(g, '#d6d2c4', ox + 16 - 2, oy + 3, 4, 1);
      rect(g, '#a8a498', ox + 2, oy + 10, 28, 1);                      // cornice
      rect(g, '#7e7a6e', ox + 2, oy + 11, 28, 1, 0.5);
      rect(g, '#e6bf55', ox + 14, oy + 6, 4, 4);                       // gold coin
      rect(g, '#fff0a8', ox + 14, oy + 6, 1, 4, 0.8);
      rect(g, '#6a4f12', ox + 16, oy + 7, 1, 2);
      vgrad(g, ox + 15, oy - 1, 2, 4, '#d6d2c4', '#8d897c');           // flagpole
      rect(g, '#d94a3a', ox + 17, oy - 1, 3, 2);
    },

    // ---- 2x2, agricultural -------------------------------------------------
    farm(g, ox, oy) {
      rect(g, '#10140f', ox + 1, oy + 28, 31, 4, 0.4);
      vgrad(g, ox, oy + 12, 32, 20, '#8a6a3a', '#5e4524');             // tilled soil
      for (let r = 0; r < 4; r++) {                                      // crop rows
        const y = oy + 18 + r * 3;
        rect(g, '#3f7d2c', ox + 2, y, 28, 1);
        for (let c = 0; c < 14; c++) rect(g, rnd(c, r, 7) > 0.5 ? '#79c04a' : '#5ea83a', ox + 2 + c * 2, y - 1, 1, 1);
        rect(g, '#4a3418', ox + 2, y + 1, 28, 1, 0.55);
      }
      vgrad(g, ox + 3, oy + 3, 12, 10, '#c23a30', '#7c1f1a');          // barn
      rect(g, '#f2e6d4', ox + 7, oy + 8, 4, 5);                          // barn door
      rect(g, '#7c1f1a', ox + 8, oy + 8, 1, 5);
      for (let i = 0; i < 6; i++) rect(g, '#e9d9c4', ox + 2 + i * 2, oy + 2 - Math.abs(i - 2.5) | 0, 2, 1); // roof edge
      rect(g, '#5a2a12', ox + 2, oy + 1, 14, 2);
      vgrad(g, ox + 19, oy + 2, 5, 11, '#d6d2c4', '#8d897c');          // silo
      rect(g, '#9aa5af', ox + 19, oy, 5, 3);
      rect(g, '#f0e2a0', ox + 27, oy + 13, 1, 4);                       // scarecrow
      rect(g, '#f0e2a0', ox + 26, oy + 14, 3, 1);
      rect(g, '#b5651d', ox + 26, oy + 12, 3, 1);
      for (let i = 0; i < 8; i++) rect(g, '#7a5a30', ox + i * 4, oy + 30, 1, 2); // fence
      rect(g, '#7a5a30', ox, oy + 30, 31, 1);
    },

    // ---- 2x2, commercial: grocery ------------------------------------------
    grocery_store(g, ox, oy) {
      rect(g, '#0b1118', ox + 2, oy + 28, 29, 4, 0.45);
      vgrad(g, ox + 2, oy + 9, 28, 20, '#f2e9d6', '#cfc2a6');          // cream wall
      hgrad(g, ox + 2, oy + 9, 4, 20, '#ffffff', '#f2e9d6', 0.6);
      vgrad(g, ox + 1, oy + 5, 30, 5, '#2f9a55', '#1b5e33');          // sign band
      for (let i = 0; i < 5; i++) rect(g, '#ffe9a8', ox + 5 + i * 5, oy + 7, 3, 2); // lettering
      for (let i = 0; i < 10; i++) {                                    // striped awning
        rect(g, i % 2 ? '#ffffff' : '#d9473a', ox + 2 + i * 3, oy + 10, 3, 4);
        rect(g, '#00000030', ox + 2 + i * 3, oy + 14, 3, 1, 0.3);
      }
      vgrad(g, ox + 4, oy + 16, 11, 9, '#8fc8ec', '#3e6f94');         // window
      rect(g, '#6bbd5b', ox + 5, oy + 22, 3, 2); rect(g, '#e8793a', ox + 8, oy + 22, 3, 2); rect(g, '#d9473a', ox + 11, oy + 22, 3, 2); // produce
      vgrad(g, ox + 18, oy + 16, 8, 12, '#2b3d50', '#101b27');        // glass door
      rect(g, '#b8e6ff', ox + 19, oy + 17, 3, 10, 0.6);
      rect(g, '#7a5c26', ox + 22, oy + 22, 1, 2);
      rect(g, '#9a968a', ox + 1, oy + 28, 30, 2);
      rect(g, '#7c8791', ox + 25, oy + 2, 4, 3);                       // roof vent
    },

    // ---- 2x1, commercial: 7-Eleven ------------------------------------------
    seven_eleven(g, ox, oy) {
      rect(g, '#0b1118', ox + 1, oy + 14, 30, 2, 0.45);
      vgrad(g, ox + 1, oy + 3, 30, 12, '#ffffff', '#d8dde3');
      rect(g, '#f0792a', ox + 1, oy + 3, 30, 2);
      rect(g, '#2a9a4a', ox + 1, oy + 5, 30, 2);
      rect(g, '#d63a30', ox + 1, oy + 7, 30, 1);
      vgrad(g, ox + 3, oy + 9, 14, 5, '#8fc8ec', '#3e6f94');
      vgrad(g, ox + 20, oy + 9, 7, 6, '#2b3d50', '#101b27');
      rect(g, '#ffe9a8', ox + 21, oy + 10, 5, 4, 0.5);
    },

    office_building(g, ox, oy) {
      rect(g, '#0b1118', ox + 4, oy + 5, 26, 27, 0.45);
      vgrad(g, ox + 4, oy + 4, 24, 27, '#58a0d2', '#183a5e');         // glass curtain wall
      hgrad(g, ox + 4, oy + 4, 7, 27, '#b3dcf6', '#58a0d2', 0.55);
      rect(g, '#10253b', ox + 27, oy + 4, 1, 27);
      for (let r = 0; r < 6; r++) {                                     // floor slabs + windows
        const y = oy + 7 + r * 4;
        rect(g, '#dce6ee', ox + 4, y + 3, 24, 1, 0.9);
        for (let c = 0; c < 5; c++) {
          const lit = rnd(c, r, 21) > 0.55;
          const wx = ox + 6 + c * 4;
          rect(g, lit ? '#ffe9a8' : '#8fc8ec', wx, y, 3, 2, lit ? 0.95 : 0.7);
        }
      }
      vgrad(g, ox + 3, oy + 2, 26, 3, '#d3dbe3', '#8a959f');          // roof slab
      rect(g, '#eef3f7', ox + 3, oy + 2, 26, 1);
      rect(g, '#9aa5af', ox + 7, oy, 5, 3);                            // AC units
      rect(g, '#7c8791', ox + 7, oy + 2, 5, 1);
      rect(g, '#9aa5af', ox + 15, oy + 1, 4, 2);
      rect(g, '#cdd5dc', ox + 24, oy - 4, 1, 6);                       // antenna
      rect(g, '#ff4a4a', ox + 24, oy - 5, 1, 1);
      vgrad(g, ox + 4, oy + 27, 24, 4, '#2b3d50', '#101b27');         // lobby
      rect(g, '#ffd98a', ox + 12, oy + 28, 8, 3, 0.9);
      rect(g, '#7a5c26', ox + 15, oy + 28, 2, 3);
    },

    // ---- 2x2, industrial --------------------------------------------------
    sweatshop(g, ox, oy) {
      rect(g, '#0e0f12', ox + 3, oy + 8, 27, 24, 0.45);
      vgrad(g, ox + 3, oy + 7, 26, 24, '#989ca1', '#4f5258');         // stained concrete
      hgrad(g, ox + 3, oy + 7, 5, 24, '#b4b8bd', '#989ca1', 0.7);
      rect(g, '#3a3c41', ox + 28, oy + 7, 1, 24);
      for (let i = 0; i < 9; i++) rect(g, '#3d3f44', ox + 4 + ((i * 7) % 22), oy + 10 + ((i * 5) % 18), 1, 3, 0.25); // streaks
      for (let r = 0; r < 3; r++) {                                     // cramped barred windows
        rect(g, '#6a6d73', ox + 3, oy + 12 + r * 6, 26, 1);           // ledge
        for (let c = 0; c < 6; c++) {
          const wx = ox + 5 + c * 4, wy = oy + 9 + r * 6;
          const lit = rnd(c, r, 33) > 0.4;
          rect(g, '#15171b', wx, wy, 3, 3);
          rect(g, lit ? '#d8c076' : '#2e3a46', wx, wy, 3, 3, lit ? 0.85 : 0.9);
          rect(g, '#15171b', wx + 1, wy, 1, 3);                        // bars
        }
      }
      vgrad(g, ox + 2, oy + 5, 28, 3, '#6d7076', '#43464b');          // parapet
      rect(g, '#8a8d93', ox + 2, oy + 5, 28, 1);
      rect(g, '#7a5a3a', ox + 22, oy + 0, 6, 5);                       // water tank
      rect(g, '#9a7a56', ox + 22, oy + 0, 6, 1);
      rect(g, '#4a3a28', ox + 23, oy + 5, 1, 1);
      rect(g, '#4a3a28', ox + 26, oy + 5, 1, 1);
      rect(g, '#a4a8ad', ox + 6, oy + 2, 11, 2);                       // ductwork
      rect(g, '#6c7076', ox + 6, oy + 3, 11, 1);
      rect(g, '#c24a3a', ox + 13, oy + 25, 2, 2);                      // washing line
      rect(g, '#e8e2d2', ox + 16, oy + 25, 2, 2);
      rect(g, '#4a7fb5', ox + 19, oy + 25, 2, 2);
      vgrad(g, ox + 14, oy + 25, 4, 6, '#3a2d22', '#1c1510');         // door
    },

    // ---- 3x2, industrial --------------------------------------------------
    factory(g, ox, oy) {
      rect(g, '#0e0b09', ox + 2, oy + 14, 45, 18, 0.45);
      vgrad(g, ox + 2, oy + 13, 44, 18, '#bf6a4c', '#7a3b2a');        // brick
      hgrad(g, ox + 2, oy + 13, 6, 18, '#d98a68', '#bf6a4c', 0.6);
      rect(g, '#5a2a1c', ox + 45, oy + 13, 1, 18);
      for (let r = 0; r < 9; r++) rect(g, '#4a2216', ox + 2, oy + 15 + r * 2, 44, 1, 0.25); // courses
      for (let i = 0; i < 4; i++) {                                     // sawtooth roof
        const x = ox + 3 + i * 10;
        for (let r = 0; r < 6; r++) {
          rect(g, mixHex('#9aa0a6', '#555b61', r / 5), x, oy + 7 + r, 3 + r * 2, 1);
        }
        rect(g, '#a8d4ea', x + 1, oy + 8, 2, 4);                       // north-light glazing
        rect(g, '#d8eef8', x + 1, oy + 8, 1, 4, 0.7);
      }
      rect(g, '#40464c', ox + 2, oy + 12, 44, 1);
      [[ox + 33, oy - 4, 9], [ox + 39, oy - 7, 12]].forEach(([cx, top, h]) => {   // striped chimneys
        vgrad(g, cx, top, 4, h, '#cf5a40', '#8e2f1c');
        for (let st = 2; st < h - 1; st += 6) rect(g, '#e9e4d8', cx, top + st, 4, 2);
        rect(g, '#2a2c30', cx, top, 4, 1);
      });
      rect(g, '#d6d6d6', ox + 32, oy - 8, 6, 3, 0.7);                  // smoke
      rect(g, '#c4c4c4', ox + 36, oy - 11, 7, 3, 0.55);
      rect(g, '#b8b8b8', ox + 41, oy - 12, 6, 3, 0.4);
      for (let i = 0; i < 5; i++) {                                     // lit windows
        rect(g, '#2b1a12', ox + 20 + i * 4, oy + 18, 3, 3);
        rect(g, '#f6d675', ox + 20 + i * 4, oy + 18, 3, 3, 0.9);
      }
      vgrad(g, ox + 5, oy + 22, 11, 9, '#4d5258', '#2a2e33');         // roller door
      for (let r = 0; r < 4; r++) rect(g, '#1c1f23', ox + 5, oy + 23 + r * 2, 11, 1, 0.6);
      rect(g, '#b58a4a', ox + 38, oy + 25, 4, 4);                      // crates
      rect(g, '#8a6532', ox + 38, oy + 25, 4, 1);
      rect(g, '#b58a4a', ox + 42, oy + 27, 3, 3);
    },

    // ---- 3x3, industrial --------------------------------------------------
    coal_plant(g, ox, oy) {
      rect(g, '#0b0c0e', ox + 2, oy + 24, 45, 24, 0.45);
      vgrad(g, ox + 2, oy + 23, 34, 24, '#747a82', '#363a40');        // boiler hall
      hgrad(g, ox + 2, oy + 23, 5, 24, '#9298a0', '#747a82', 0.7);
      rect(g, '#2a2d32', ox + 35, oy + 23, 1, 24);
      vgrad(g, ox + 1, oy + 21, 36, 3, '#5a5f66', '#383c42');         // roof
      rect(g, '#8a9098', ox + 1, oy + 21, 36, 1);
      for (let i = 0; i < 6; i++) {                                     // furnace-glow windows
        const lit = rnd(i, 1, 51) > 0.35;
        rect(g, '#14161a', ox + 5 + i * 5, oy + 27, 3, 5);
        rect(g, lit ? '#ff9a3c' : '#26323f', ox + 5 + i * 5, oy + 27, 3, 5, 0.9);
      }
      rect(g, '#8a9098', ox + 3, oy + 37, 32, 1);                      // pipework
      rect(g, '#aab0b8', ox + 3, oy + 38, 32, 1, 0.7);
      for (let i = 0; i < 3; i++) vgrad(g, ox + 8 + i * 9, oy + 39, 4, 7, '#6a7078', '#34383e');  // fuel bunkers
      vgrad(g, ox + 37, oy + 6, 5, 40, '#c9cdd2', '#6c7279');         // tall stacks
      rect(g, '#d94a3a', ox + 37, oy + 6, 5, 3);
      rect(g, '#d94a3a', ox + 37, oy + 14, 5, 3);
      rect(g, '#d94a3a', ox + 37, oy + 22, 5, 3);
      rect(g, '#25282c', ox + 37, oy + 6, 5, 1);
      vgrad(g, ox + 43, oy - 2, 4, 48, '#c9cdd2', '#6c7279');
      rect(g, '#d94a3a', ox + 43, oy - 2, 4, 3);
      rect(g, '#d94a3a', ox + 43, oy + 6, 4, 3);
      rect(g, '#d94a3a', ox + 43, oy + 14, 4, 3);
      rect(g, '#25282c', ox + 43, oy - 2, 4, 1);
      rect(g, '#555a60', ox + 34, oy + 1, 8, 4, 0.7);                  // smoke
      rect(g, '#4a4f55', ox + 38, oy - 3, 9, 4, 0.55);
      rect(g, '#40454b', ox + 42, oy - 7, 6, 4, 0.4);
      for (let r = 0; r < 6; r++) rect(g, '#16171a', ox + 2 + Math.floor(r / 2), oy + 41 + r, 12 - r * 2 + 2, 1); // coal heap
      rect(g, '#2a2c30', ox + 4, oy + 41, 6, 1);
      for (let i = 0; i < 13; i++) {                                    // conveyor gantry
        rect(g, '#d6b13c', ox + 10 + i, oy + 36 - Math.floor(i * 0.9), 1, 2);
      }
      rect(g, '#8a6f1c', ox + 10, oy + 38, 13, 1, 0.5);
      rect(g, '#e6c14a', ox + 28, oy + 41, 6, 4);                      // warning plate
      rect(g, '#141414', ox + 29, oy + 42, 1, 2);
      rect(g, '#141414', ox + 31, oy + 42, 1, 2);
    },

    nuclear_plant(g, ox, oy) {
      rect(g, '#0b0e12', ox + 2, oy + 36, 45, 12, 0.4);
      function tower(cx, topY, baseY, waist, base) {
        const hgt = baseY - topY;
        for (let r = 0; r <= hgt; r++) {
          const t = r / hgt;                                             // 0 top -> 1 base
          const half = Math.round(t >= 0.35
            ? waist + (base - waist) * Math.pow((t - 0.35) / 0.65, 2)
            : waist + 1 * Math.pow((0.35 - t) / 0.35, 2));
          hgrad(g, cx - half, topY + r, half * 2, 1, '#f4f6f8', '#8f98a1');
          rect(g, '#6c747d', cx + half - 1, topY + r, 1, 1);            // shadow rim
        }
        rect(g, '#dfe4e9', cx - waist - 1, topY, waist * 2 + 2, 1);      // lip
        rect(g, '#aab2ba', cx - waist - 1, topY + 1, waist * 2 + 2, 1, 0.6);
      }
      tower(ox + 13, oy + 9, oy + 38, 7, 11);
      tower(ox + 35, oy + 12, oy + 38, 6, 9);
      rect(g, '#ffffff', ox + 7, oy + 4, 11, 5, 0.85);                  // steam plumes
      rect(g, '#ffffff', ox + 4, oy - 1, 14, 5, 0.7);
      rect(g, '#f2f5f8', ox + 9, oy - 6, 12, 5, 0.55);
      rect(g, '#eaeef2', ox + 14, oy - 10, 10, 4, 0.4);
      rect(g, '#ffffff', ox + 30, oy + 7, 9, 5, 0.8);
      rect(g, '#f2f5f8', ox + 28, oy + 2, 11, 5, 0.6);
      rect(g, '#eaeef2', ox + 32, oy - 3, 9, 4, 0.4);
      vgrad(g, ox + 2, oy + 37, 44, 10, '#d3d8dd', '#8b929a');          // turbine hall
      hgrad(g, ox + 2, oy + 37, 6, 10, '#eef1f4', '#d3d8dd', 0.7);
      rect(g, '#6c737b', ox + 45, oy + 37, 1, 10);
      rect(g, '#f4f6f8', ox + 2, oy + 37, 44, 1);
      for (let i = 0; i < 9; i++) {                                     // window band
        rect(g, '#3a4b5c', ox + 4 + i * 4, oy + 40, 3, 2);
        rect(g, '#7fb0d4', ox + 4 + i * 4, oy + 40, 3, 1, 0.8);
      }
      for (let r = 0; r < 7; r++) {                                     // containment dome
        const half = Math.round(Math.sqrt(49 - (6 - r) * (6 - r)));
        hgrad(g, ox + 24 - half, oy + 31 + r, half * 2, 1, '#f6f8fa', '#a2abb4');
      }
      rect(g, '#e6c14a', ox + 22, oy + 42, 4, 4);                       // hazard sign
      rect(g, '#141414', ox + 23, oy + 43, 2, 2);
      vgrad(g, ox + 41, oy + 28, 3, 9, '#c9cdd2', '#7a8189');          // vent stack
      rect(g, '#d94a3a', ox + 41, oy + 28, 3, 2);
    },
  };

  // Local copy of mix() returning '#rrggbb', since the art above wants hex
  // strings for rect() but mix() returns a packed number.
  function mixHex(a, b, t) {
    return '#' + ('000000' + mix(a, b, t).toString(16)).slice(-6);
  }

  // Draws the art for `key` once, into its own canvas, with PAD_TOP of headroom
  // for anything that rises above the footprint. The result is meant to be
  // handed to the renderer as a texture and reused.
  function bake(key, w, h) {
    const c = document.createElement('canvas');
    c.width = w * T;
    c.height = h * T + PAD_TOP;
    const ctx = c.getContext('2d');
    (ART[key] || ART.shabby_apartment)(surface(ctx), 0, PAD_TOP);
    return c;
  }

  // Scaffold for a building under construction (drawn live, as it changes).
  function drawScaffold(g, ox, oy, w, h, pct) {
    rect(g, '#000000', ox + 1, oy + 2, w - 2, h - 2, 0.35);
    for (let i = 0; i < w - 2; i += 4) rect(g, i % 8 === 0 ? '#ffd23f' : '#262626', ox + 1 + i, oy + 2, 4, 2);
    rect(g, '#262626', ox + 1, oy + 2, 2, h - 2);
    rect(g, '#262626', ox + w - 3, oy + 2, 2, h - 2);
    const fillH = Math.max(1, Math.floor(((h - 6) * pct) / 100));
    rect(g, '#b99b6b', ox + 3, oy + h - 2 - fillH, w - 6, fillH);
    rect(g, '#000000', ox + 1, oy + h - 1, w - 2, 1, 0.6);
  }

  // ------------------------------------------------------------ ground layers
  const ASSETS = {
    grass: '/assets/decorations/mongolia-grass-texture.jpg', // seamless top-down grass
    road: '/tycoon/road.jpg',                                // seamless cobblestone
    water: '/tycoon/water.jpg',                              // 25 frames, 96px each, in a row
  };
  const WATER_FRAMES = 25;
  const WATER_FRAME_PX = 96;

  function loadImage(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null); // painters fall back to flat colour
      im.src = src;
    });
  }

  // Kicks off all three loads immediately so they overlap with Phaser booting.
  function preload() {
    const images = { grass: null, road: null, water: null };
    const promise = Promise.all(Object.keys(ASSETS).map((k) =>
      loadImage(ASSETS[k]).then((im) => { images[k] = im; })
    )).then(() => images);
    return { images, promise };
  }

  const rgba = (hexStr, a) => {
    const n = hex(hexStr);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  const ZONE_STYLE = {
    residential: { fill: '#2f6fd0', edge: '#bfe0ff' },
    commercial:  { fill: '#e08a1f', edge: '#ffe2b0' },
    industrial:  { fill: '#7b3fa0', edge: '#e5c8ff' },
    agricultural: { fill: '#9aa32a', edge: '#eef5b0' },
  };

  // Composes grass, zones and roads onto `o.canvas`. Call redraw() whenever a
  // tile or a building footprint changes; do not call it per frame.
  //   o.canvas    target canvas, o.map tiles per side, o.px canvas pixels per tile
  //   o.getTile(x, y)   -> 'road' | 'water' | zone name | null
  //   o.isCovered(x, y) -> true if a building stands there (zone art hides)
  //   o.images    the object preload() fills in
  function createTerrainPainter(o) {
    const ctx = o.canvas.getContext('2d');
    const P = o.px, W = o.map * P;
    let roadPattern = null, patternFor = null;

    // The grass (tiled texture + vignette) never changes, and recomposing it
    // was ~80% of every terrain redraw -- 16 image draws plus a full-canvas
    // gradient. It is rendered once to its own canvas and blitted each time.
    // Rebuilt only if the texture arrives after the first (flat) paint.
    let grassBase = null, grassBaseFor = undefined;
    function buildGrass(img) {
      const c = document.createElement('canvas');
      c.width = c.height = W;
      const g2 = c.getContext('2d');
      if (!img) { g2.fillStyle = '#4a8f3f'; g2.fillRect(0, 0, W, W); return c; }
      g2.imageSmoothingEnabled = true;
      g2.imageSmoothingQuality = 'high';
      const S = P * 5; // one repeat of the texture spans five tiles
      for (let y = 0; y * S < W; y++) for (let x = 0; x * S < W; x++) g2.drawImage(img, x * S, y * S, S, S);
      // A little depth so the plot reads as ground rather than a flat photo.
      const grad = g2.createRadialGradient(W / 2, W / 2, W * 0.35, W / 2, W / 2, W * 0.78);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.22)');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, W, W);
      return c;
    }
    function paintGrass() {
      const img = o.images.grass || null;
      if (grassBase === null || grassBaseFor !== img) { grassBase = buildGrass(img); grassBaseFor = img; }
      ctx.drawImage(grassBase, 0, 0);
    }

    function glyph(type, ox, oy) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      if (type === 'residential') {
        ctx.fillStyle = '#e4f1ff'; ctx.fillRect(ox + 20, oy + 28, 24, 18);
        ctx.fillStyle = '#9fd0ff';
        ctx.beginPath(); ctx.moveTo(ox + 16, oy + 28); ctx.lineTo(ox + 32, oy + 13); ctx.lineTo(ox + 48, oy + 28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2f6fd0'; ctx.fillRect(ox + 29, oy + 36, 6, 10);
      } else if (type === 'commercial') {
        ctx.fillStyle = '#fff1d6'; ctx.fillRect(ox + 14, oy + 24, 36, 22);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#e05a3a'; ctx.fillRect(ox + 14 + i * 6, oy + 16, 6, 9); }
        ctx.fillStyle = '#7a4a12'; ctx.fillRect(ox + 28, oy + 33, 8, 13);
      } else if (type === 'agricultural') {
        ctx.fillStyle = '#f1f0b8';
        for (let i = 0; i < 4; i++) { ctx.fillRect(ox + 14, oy + 16 + i * 8, 36, 3); }
        ctx.fillStyle = '#7a8a1f';
        for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) ctx.fillRect(ox + 16 + j * 6, oy + 13 + i * 8, 2, 3);
      } else if (type === 'industrial') {
        ctx.fillStyle = '#e8d6f6'; ctx.fillRect(ox + 14, oy + 30, 36, 16);
        ctx.fillStyle = '#c9a8e6';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(ox + 14 + i * 12, oy + 30); ctx.lineTo(ox + 14 + i * 12, oy + 20); ctx.lineTo(ox + 26 + i * 12, oy + 30); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#b896d8'; ctx.fillRect(ox + 42, oy + 12, 6, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(ox + 40, oy + 6, 10, 6);
      }
      ctx.restore();
    }

    function paintZones() {
      const E = Math.max(2, Math.round(P / 20));
      for (let y = 0; y < o.map; y++) {
        for (let x = 0; x < o.map; x++) {
          const t = o.getTile(x, y);
          const z = ZONE_STYLE[t];
          // A zone only paints where nothing is built on it: once a building
          // stands there the colour behind it disappears.
          if (!z || o.isCovered(x, y)) continue;
          const ox = x * P, oy = y * P;
          ctx.fillStyle = rgba(z.fill, 0.42);
          ctx.fillRect(ox, oy, P, P);
          // Outline only the district's outer edge, not every tile.
          ctx.fillStyle = rgba(z.edge, 0.9);
          if (o.getTile(x, y - 1) !== t) ctx.fillRect(ox, oy, P, E);
          if (o.getTile(x, y + 1) !== t) ctx.fillRect(ox, oy + P - E, P, E);
          if (o.getTile(x - 1, y) !== t) ctx.fillRect(ox, oy, E, P);
          if (o.getTile(x + 1, y) !== t) ctx.fillRect(ox + P - E, oy, E, P);
          glyph(t, ox, oy);
        }
      }
    }

    function paintRoads() {
      const LANE = Math.round(P * 0.75), EDGE = (P - LANE) / 2, HALF = P / 2;
      const arms = [];
      for (let y = 0; y < o.map; y++) {
        for (let x = 0; x < o.map; x++) {
          if (o.getTile(x, y) !== 'road') continue;
          const cx = x * P, cy = y * P;
          const n = o.getTile(x, y - 1) === 'road', s = o.getTile(x, y + 1) === 'road';
          const w = o.getTile(x - 1, y) === 'road', e = o.getTile(x + 1, y) === 'road';
          arms.push([cx + EDGE, cy + EDGE, LANE, LANE]);
          if (n) arms.push([cx + EDGE, cy, LANE, HALF + 1]);
          if (s) arms.push([cx + EDGE, cy + HALF - 1, LANE, HALF + 1]);
          if (w) arms.push([cx, cy + EDGE, HALF + 1, LANE]);
          if (e) arms.push([cx + HALF - 1, cy + EDGE, HALF + 1, LANE]);
        }
      }
      if (!arms.length) return;
      // Each pass fills the union of every arm, grown by `grow` px. Painting
      // outline, then kerb, then surface leaves a raised kerb along the outside
      // of the road only -- stroking each rect would draw a seam across every
      // junction.
      const pass = (grow, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        for (const a of arms) ctx.rect(a[0] - grow, a[1] - grow, a[2] + grow * 2, a[3] + grow * 2);
        ctx.fill();
      };
      pass(Math.round(P * 0.1), 'rgba(20,18,16,0.55)');
      pass(Math.round(P * 0.05), '#b9b5a8');
      const img = o.images.road;
      if (img) {
        if (patternFor !== img) {
          roadPattern = ctx.createPattern(img, 'repeat');
          if (roadPattern && roadPattern.setTransform && typeof DOMMatrix !== 'undefined') {
            roadPattern.setTransform(new DOMMatrix().scale(0.75));
          }
          patternFor = img;
        }
        pass(0, roadPattern || '#5b5f67');
      } else {
        pass(0, '#5b5f67');
      }
    }

    function redraw() {
      paintGrass(); // opaque and full-size, so no clear is needed first
      paintZones();
      paintRoads();
    }
    return { redraw };
  }

  // Animated water on its own small canvas. The source GIF is not seamless at
  // its edges, so it is laid out with mirrored tiling -- every other block is
  // flipped, which makes neighbouring edges match by construction.
  //   o.canvas, o.map, o.px (canvas px per tile), o.getTile, o.images
  function createWaterPainter(o) {
    const ctx = o.canvas.getContext('2d');
    const P = o.px, W = o.map * P;
    const BLOCK = 4;                       // tiles covered by one copy of a frame
    const SRC = WATER_FRAME_PX / BLOCK;    // source px per tile
    let tiles = [];

    function rescan() {
      tiles = [];
      for (let y = 0; y < o.map; y++) for (let x = 0; x < o.map; x++) if (o.getTile(x, y) === 'water') tiles.push(x, y);
    }
    const isWater = (x, y) => o.getTile(x, y) === 'water';

    function draw(frame) {
      ctx.clearRect(0, 0, W, W);
      if (!tiles.length) return;
      const sheet = o.images.water;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      const f = ((frame % WATER_FRAMES) + WATER_FRAMES) % WATER_FRAMES;
      for (let i = 0; i < tiles.length; i += 2) {
        const x = tiles[i], y = tiles[i + 1];
        const dx = x * P, dy = y * P;
        if (!sheet) { ctx.fillStyle = '#2b79a8'; ctx.fillRect(dx, dy, P, P); continue; }
        const flipX = (Math.floor(x / BLOCK) & 1) === 1, flipY = (Math.floor(y / BLOCK) & 1) === 1;
        const lx = x % BLOCK, ly = y % BLOCK;
        const sx = f * WATER_FRAME_PX + (flipX ? BLOCK - 1 - lx : lx) * SRC;
        const sy = (flipY ? BLOCK - 1 - ly : ly) * SRC;
        if (flipX || flipY) {
          ctx.save();
          ctx.translate(dx + (flipX ? P : 0), dy + (flipY ? P : 0));
          ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
          ctx.drawImage(sheet, sx, sy, SRC, SRC, 0, 0, P, P);
          ctx.restore();
        } else {
          ctx.drawImage(sheet, sx, sy, SRC, SRC, dx, dy, P, P);
        }
      }
      // Shoreline: a dark inner lip and a pale foam line just outside it,
      // only where the neighbour is dry land.
      const lip = Math.max(2, Math.round(P / 10)), foam = Math.max(1, Math.round(P / 16));
      for (let i = 0; i < tiles.length; i += 2) {
        const x = tiles[i], y = tiles[i + 1];
        const dx = x * P, dy = y * P;
        const sides = [
          [y > 0 && !isWater(x, y - 1), dx, dy, P, lip, dx, dy - foam, P, foam],
          [y < o.map - 1 && !isWater(x, y + 1), dx, dy + P - lip, P, lip, dx, dy + P, P, foam],
          [x > 0 && !isWater(x - 1, y), dx, dy, lip, P, dx - foam, dy, foam, P],
          [x < o.map - 1 && !isWater(x + 1, y), dx + P - lip, dy, lip, P, dx + P, dy, foam, P],
        ];
        for (const s of sides) {
          if (!s[0]) continue;
          ctx.fillStyle = 'rgba(6,40,66,0.5)'; ctx.fillRect(s[1], s[2], s[3], s[4]);
          ctx.fillStyle = 'rgba(225,246,255,0.55)'; ctx.fillRect(s[5], s[6], s[7], s[8]);
        }
      }
    }
    return { rescan, draw, hasWater: () => tiles.length > 0, frames: WATER_FRAMES };
  }

  return {
    T, PAD_TOP, ART, hex, rect, bake, drawScaffold,
    preload, createTerrainPainter, createWaterPainter,
  };
})();

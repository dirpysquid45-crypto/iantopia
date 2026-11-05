// Sound for the Tetris pages: the theme song (looping) and the sound effects from
// the "PC / Computer - Tetris Zone" pack. Both the single-player and the versus
// page use it, so they sound the same.
//
// window.TetrisSound:
//   onEngineEvent(name, data)  maps the engine's events (lock, clear, level, garbage, over)
//   play(name)                 one effect or voice line (see CLIPS and VOICES)
//   startMusic() / stopMusic() the theme song; starts only after a tap (browsers block sound before that)
//   toggleMute() -> muted      one switch for music and effects, remembered in this browser
(function () {
  var BASE = '/audio/tetris/';
  var MUTE_KEY = 'tetris_sound_v1';

  // Which file each game moment uses.
  var CLIPS = {
    move: 'sfx/SFX_PieceMoveLR',
    rotate: 'sfx/SFX_PieceRotateLR',
    rotatefail: 'sfx/SFX_PieceRotateFail',
    softdrop: 'sfx/SFX_PieceSoftDrop',
    hard: 'sfx/SFX_PieceHardDrop',
    lock: 'sfx/SFX_PieceLockdown',
    hold: 'sfx/SFX_PieceHold',
    clear1: 'sfx/SFX_SpecialLineClearSingle',
    clear2: 'sfx/SFX_SpecialLineClearDouble',
    clear3: 'sfx/SFX_SpecialLineClearTriple',
    tetris: 'sfx/SFX_SpecialTetris',
    level: 'sfx/SFX_LevelUp',
    over: 'sfx/SFX_GameOver',
    start: 'sfx/SFX_GameStart',
    garbage: 'sfx/SFX_Splash'
  };
  // Spoken praise. Used after a big clear, picked at random so it doesn't repeat.
  var VOICES = {
    b2btetris: 'VO_B2BTETRS',
    praise: ['VO_AMAZING', 'VO_BRILLIANT', 'VO_EXLNT', 'VO_FANTSTC', 'VO_WONDRFL', 'VO_THTGREAT', 'VO_VRYGOOD', 'VO_WOW']
  };
  // Some effects fire every few milliseconds when a key is held; keep them from piling up.
  var MIN_GAP = { move: 60, softdrop: 60, rotatefail: 120 };

  var muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === 'off'; } catch (e) { /* private mode: default to on */ }

  var cache = {};
  var lastPlayed = {};
  var theme = null;

  function clip(file) {
    if (!cache[file]) {
      cache[file] = new Audio(BASE + file + '.mp3');
      cache[file].preload = 'auto';
    }
    return cache[file];
  }

  function play(name, volume) {
    if (muted) return;
    var file = CLIPS[name] || name;
    if (!file) return;
    var now = Date.now();
    if (MIN_GAP[name] && now - (lastPlayed[name] || 0) < MIN_GAP[name]) return;
    lastPlayed[name] = now;
    try {
      // A copy of the preloaded element, so the same effect can overlap itself.
      var a = clip(file).cloneNode();
      a.volume = volume == null ? 0.7 : volume;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* no audio support: play nothing */ }
  }

  function playVoice(key) {
    var list = VOICES[key];
    if (!list) return;
    var pick = Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list;
    setTimeout(function () { play('sfx/' + pick, 0.9); }, 0);
  }

  function themeEl() {
    if (!theme) {
      theme = new Audio(BASE + 'theme.mp3');
      theme.loop = true;
      theme.volume = 0.35;
      theme.preload = 'auto';
    }
    return theme;
  }

  function startMusic() {
    if (muted) return;
    var p = themeEl().play();
    if (p && p.catch) p.catch(function () {});
  }
  function stopMusic() { if (theme) theme.pause(); }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? 'off' : 'on'); } catch (e) {}
    if (muted) stopMusic();
    return muted;
  }

  // The engine's events, mapped to sounds.
  function onEngineEvent(name, data) {
    switch (name) {
      case 'lock':
        play(data && data.hard ? 'hard' : 'lock');
        break;
      case 'clear':
        if (data.lines >= 4) play('tetris');
        else play('clear' + Math.max(1, data.lines));
        if (data.b2b) setTimeout(function () { playVoice('b2btetris'); }, 450);
        else if (data.lines >= 3) setTimeout(function () { playVoice('praise'); }, 450);
        break;
      case 'level':
        play('level');
        break;
      case 'garbage':
        play('garbage');
        break;
      case 'over':
        stopMusic();
        play('over');
        break;
      default:
        break;
    }
  }

  window.TetrisSound = {
    onEngineEvent: onEngineEvent,
    play: play,
    playVoice: playVoice,
    startMusic: startMusic,
    stopMusic: stopMusic,
    toggleMute: toggleMute,
    isMuted: function () { return muted; }
  };
})();

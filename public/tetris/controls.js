// Input for the Tetris pages: the keyboard and the on-screen touch pad. Both call
// the same actions, so a phone and a keyboard play the same game.
//
// Keyboard:
//   a / ←        move left (hold to repeat)
//   d / →        move right (hold to repeat)
//   s / ↓        soft drop (while held)
//   Space        slam (hard drop)
//   ↑            hold
//   r / x        rotate clockwise
//   q / z        rotate counter-clockwise
//   p / Esc      pause
//
// The touch pad is a set of <button data-action="..."> elements inside `pad`.
// Each one has an aria-label, so screen readers and keyboard users get the same names.
//
// window.TetrisControls.attach({ pad, onAction(name), onSoft(on) }) -> { destroy() }
(function () {
  var REPEAT_ACTIONS = { left: true, right: true };
  var KEYS = {
    'a': 'left', 'ArrowLeft': 'left',
    'd': 'right', 'ArrowRight': 'right',
    ' ': 'hard',
    'ArrowUp': 'hold',
    'r': 'rotcw', 'R': 'rotcw', 'x': 'rotcw', 'X': 'rotcw',
    'q': 'rotccw', 'Q': 'rotccw', 'z': 'rotccw', 'Z': 'rotccw',
    'p': 'pause', 'P': 'pause', 'Escape': 'pause'
  };
  var SOFT_KEYS = { 's': true, 'S': true, 'ArrowDown': true };
  var DAS = 160;   // ms before a held left or right starts repeating
  var ARR = 45;    // ms between repeats

  function attach(opts) {
    var pad = opts.pad;
    var onAction = opts.onAction;
    var onSoft = opts.onSoft || function () {};
    var held = {};     // action -> timer, while a repeat action is held
    var softOn = false;

    function fire(name) { onAction(name); }

    function startRepeat(name) {
      stopRepeat(name);
      fire(name);
      held[name] = setTimeout(function tick() {
        fire(name);
        held[name] = setTimeout(tick, ARR);
      }, DAS);
    }
    function stopRepeat(name) {
      if (held[name]) { clearTimeout(held[name]); delete held[name]; }
    }
    function setSoft(on) {
      if (softOn === on) return;
      softOn = on;
      onSoft(on);
    }
    function releaseAll() {
      Object.keys(held).forEach(stopRepeat);
      setSoft(false);
      if (pad) pad.querySelectorAll('.down').forEach(function (b) { b.classList.remove('down'); });
    }

    // Keyboard
    function onKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (SOFT_KEYS[e.key]) { e.preventDefault(); if (!e.repeat) setSoft(true); return; }
      var name = KEYS[e.key];
      if (!name) return;
      // Keep the page from scrolling on the game keys.
      if (name !== 'pause' || e.key === 'Escape') e.preventDefault();
      if (e.repeat) return;   // holding a key never repeats a one-shot action; left and right repeat on our own timer
      if (REPEAT_ACTIONS[name]) startRepeat(name);
      else fire(name);
    }
    function onKeyUp(e) {
      if (SOFT_KEYS[e.key]) { setSoft(false); return; }
      var name = KEYS[e.key];
      if (name && REPEAT_ACTIONS[name]) stopRepeat(name);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);

    // Touch pad
    function onPadDown(e) {
      var btn = e.target.closest && e.target.closest('button[data-action]');
      if (!btn || !pad.contains(btn)) return;
      e.preventDefault();
      if (btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (_) {} }
      btn.classList.add('down');
      var name = btn.getAttribute('data-action');
      if (name === 'soft') setSoft(true);
      else if (REPEAT_ACTIONS[name]) startRepeat(name);
      else fire(name);
    }
    function onPadUp(e) {
      var btn = e.target.closest && e.target.closest('button[data-action]');
      if (!btn) { releaseAll(); return; }
      var name = btn.getAttribute('data-action');
      btn.classList.remove('down');
      if (name === 'soft') setSoft(false);
      if (REPEAT_ACTIONS[name]) stopRepeat(name);
    }
    function onPadCancel(e) {
      var btn = e.target.closest && e.target.closest('button[data-action]');
      if (btn) {
        var name = btn.getAttribute('data-action');
        btn.classList.remove('down');
        if (name === 'soft') setSoft(false);
        if (REPEAT_ACTIONS[name]) stopRepeat(name);
      } else {
        releaseAll();
      }
    }

    if (pad) {
      pad.addEventListener('pointerdown', onPadDown);
      pad.addEventListener('pointerup', onPadUp);
      pad.addEventListener('pointercancel', onPadCancel);
      pad.addEventListener('lostpointercapture', onPadCancel);
      // Stop the phone's long-press menu and text selection on the pad.
      pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    return {
      releaseAll: releaseAll,
      destroy: function () {
        releaseAll();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', releaseAll);
        if (pad) {
          pad.removeEventListener('pointerdown', onPadDown);
          pad.removeEventListener('pointerup', onPadUp);
          pad.removeEventListener('pointercancel', onPadCancel);
          pad.removeEventListener('lostpointercapture', onPadCancel);
        }
      }
    };
  }

  window.TetrisControls = { attach: attach };
})();

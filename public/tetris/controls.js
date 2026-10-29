// Input for the Tetris pages: the keyboard and the on-screen touch pad. Both call
// the same actions, so a phone and a keyboard play the same game.
//
// Keyboard bindings come from TetrisKeys (public/tetris/keys.js), so a player's
// own choice applies on both pages. Left and right repeat while held.
//
// The touch pad is a set of <button data-action="..."> elements inside `pad`.
// Each one has an aria-label, so screen readers and keyboard users get the same names.
//
// On touch screens (and only for touch or pen pointers, never the mouse) the board also
// takes gestures, worked out by createGesture() below, which touches no DOM:
//   tap the board        rotate clockwise
//   drag sideways        move one column per column-width of finger travel
//   quick swipe down     hard drop (slam)
//   slower drag down     soft drop while the finger is down
//   tap the Hold box     hold / swap (a click on it works with a mouse too)
// On a coarse-pointer device the on-screen keys are hidden (only Pause stays).
//
// window.TetrisControls.attach({ pad, zone, board, holdBox, onAction(name, via), onSoft(on) })
//     -> { releaseAll(), denied(el), destroy() }
// via is 'tap' when the action came from tapping the Hold box, so a page can give feedback
// if the engine refuses it; otherwise it is undefined.
(function () {
  // ---- Gesture recogniser (pure: numbers in, action names out) ----
  var G = {
    SLOP: 10,          // px of travel before a touch stops being a tap
    TAP_MS: 350,       // a tap is shorter than this
    VERT_RATIO: 1.5,   // the first real movement is "down" only if dy > 1.5 * |dx|
    SOFT_AFTER_MS: 150,// a downward drag becomes soft drop after this long (a flick ends sooner)
    FLICK_MIN_DY: 48,  // a hard drop needs at least this much downward travel
    FLICK_V: 0.8,      // px/ms over the last RECENT_MS: a flick
    RECENT_MS: 100
  };

  // createGesture({ colWidth }) -> { down(x,y,t), move(x,y,t), up(x,y,t), cancel() }
  // Each returns an array of actions: 'left' | 'right' | 'rotcw' | 'hard' | 'softOn' | 'softOff'.
  // The first real movement decides the mode for the whole touch: 'h' (sideways) or 'v'
  // (downward). In sideways mode nothing can drop, so steering never slams by accident.
  // Upward first movement cancels the touch (no tap, no action).
  function createGesture(o) {
    var colW = Math.max(8, (o && o.colWidth) || 24);
    var st = null;
    function reset() { st = null; }
    return {
      down: function (x, y, t) {
        st = { x0: x, y0: y, t0: t, ax: x, mode: null, soft: false, trail: [[t, y]] };
        return [];
      },
      move: function (x, y, t) {
        if (!st) return [];
        var out = [];
        var dx = x - st.x0, dy = y - st.y0;
        st.trail.push([t, y]);
        while (st.trail.length > 2 && t - st.trail[1][0] > G.RECENT_MS) st.trail.shift();
        if (!st.mode) {
          if (Math.hypot(dx, dy) < G.SLOP) return out;
          if (dy > 0 && dy > G.VERT_RATIO * Math.abs(dx)) st.mode = 'v';
          else if (dy < 0 && -dy > G.VERT_RATIO * Math.abs(dx)) st.mode = 'x';   // upward: ignore
          else st.mode = 'h';
        }
        if (st.mode === 'h') {
          while (x - st.ax >= colW) { out.push('right'); st.ax += colW; }
          while (st.ax - x >= colW) { out.push('left'); st.ax -= colW; }
        } else if (st.mode === 'v') {
          if (!st.soft && t - st.t0 >= G.SOFT_AFTER_MS && dy >= G.SLOP) { st.soft = true; out.push('softOn'); }
        }
        return out;
      },
      up: function (x, y, t) {
        if (!st) return [];
        var out = [];
        var s = st;
        st = null;
        var dy = y - s.y0;
        if (s.mode === null) {
          if (t - s.t0 <= G.TAP_MS) out.push('rotcw');
          return out;
        }
        if (s.soft) out.push('softOff');
        if (s.mode === 'v' && dy >= G.FLICK_MIN_DY) {
          var a = s.trail[0], b = s.trail[s.trail.length - 1];
          var dt = Math.max(1, b[0] - a[0]);
          var recent = t - a[0] <= G.RECENT_MS * 1.5 ? (b[1] - a[1]) / dt : 0;
          var whole = dy / Math.max(1, t - s.t0);
          if (recent >= G.FLICK_V || (whole >= G.FLICK_V && t - s.t0 < G.SOFT_AFTER_MS * 2)) out.push('hard');
        }
        return out;
      },
      cancel: function () {
        var was = st && st.soft;
        st = null;
        return was ? ['softOff'] : [];
      }
    };
  }

  var coarse = false;
  try { coarse = !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (_) {}
  if (coarse && typeof document !== 'undefined') document.documentElement.classList.add('gestures');


  var REPEAT_ACTIONS = { left: true, right: true };
  var DAS = 160;   // ms before a held left or right starts repeating
  var ARR = 45;    // ms between repeats

  function attach(opts) {
    var pad = opts.pad;
    var zone = opts.zone, boardEl = opts.board, holdBox = opts.holdBox;
    if (coarse && pad && pad.querySelector('.pause')) document.documentElement.classList.add('has-pause');
    var onAction = opts.onAction;
    var onSoft = opts.onSoft || function () {};
    var held = {};     // action -> timer, while a repeat action is held
    var softOn = false;

    function fire(name, via) { onAction(name, via); }

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
      var name = window.TetrisKeys.actionFor(e.key);
      if (!name) return;
      // Keep the page from scrolling on the game keys (pause is left alone).
      if (name !== 'pause' || e.key === 'Escape') e.preventDefault();
      if (name === 'soft') { if (!e.repeat) setSoft(true); return; }
      if (e.repeat) return;   // holding a key never repeats a one-shot action; left and right repeat on our own timer
      if (REPEAT_ACTIONS[name]) startRepeat(name);
      else fire(name);
    }
    function onKeyUp(e) {
      var name = window.TetrisKeys.actionFor(e.key);
      if (name === 'soft') { setSoft(false); return; }
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

    // Touch gestures on the board zone (touch and pen only; the mouse does not steer).
    var gesture = null, gesturePointer = null, shakeTimer = null;
    function applyGesture(list) {
      list.forEach(function (a) {
        if (a === 'softOn') setSoft(true);
        else if (a === 'softOff') setSoft(false);
        else fire(a);
      });
    }
    function startsOnBoard(e) {
      var t = e.target;
      if (!t || !t.closest) return false;
      if (t.closest('.overlay, button, a, input, select, textarea')) return false;
      if (holdBox && holdBox.contains(t)) return false;
      return true;
    }
    function onZoneDown(e) {
      if (e.pointerType === 'mouse' || gesturePointer !== null || !startsOnBoard(e)) return;
      var r = (boardEl || zone).getBoundingClientRect();
      gesture = createGesture({ colWidth: r.width / 10 });
      gesturePointer = e.pointerId;
      if (zone.setPointerCapture) { try { zone.setPointerCapture(e.pointerId); } catch (_) {} }
      applyGesture(gesture.down(e.clientX, e.clientY, e.timeStamp));
    }
    function onZoneMove(e) {
      if (e.pointerId !== gesturePointer) return;
      if (e.cancelable) e.preventDefault();
      applyGesture(gesture.move(e.clientX, e.clientY, e.timeStamp));
    }
    function onZoneUp(e) {
      if (e.pointerId !== gesturePointer) return;
      applyGesture(gesture.up(e.clientX, e.clientY, e.timeStamp));
      gesture = null; gesturePointer = null;
    }
    function onZoneCancel(e) {
      if (e.pointerId !== gesturePointer) return;
      applyGesture(gesture.cancel());
      gesture = null; gesturePointer = null;
    }
    function onZoneMenu(e) { e.preventDefault(); }
    // No zoom: iOS ignores maximum-scale, so pinch (gesturestart) and the second tap of a
    // double tap are stopped here. Buttons, links, fields and the Hold box are left alone so
    // their taps always register (CSS touch-action: manipulation stops double-tap zoom there).
    var lastTouchEnd = 0;
    function onGestureStart(e) { e.preventDefault(); }
    function onTouchEndGuard(e) {
      var t = e.target;
      var now = Date.now();
      var quick = now - lastTouchEnd < 300;
      lastTouchEnd = now;
      if (!quick || !e.cancelable) return;
      if (t && t.closest && t.closest('button, a, input, select, textarea, label, #hold-box')) return;
      e.preventDefault();
    }
    document.addEventListener('gesturestart', onGestureStart);
    document.addEventListener('gesturechange', onGestureStart);
    document.addEventListener('touchend', onTouchEndGuard, { passive: false });

    function onHoldClick() { fire('hold', 'tap'); }
    if (zone) {
      zone.addEventListener('pointerdown', onZoneDown);
      zone.addEventListener('pointermove', onZoneMove);
      zone.addEventListener('pointerup', onZoneUp);
      zone.addEventListener('pointercancel', onZoneCancel);
      zone.addEventListener('contextmenu', onZoneMenu);
    }
    if (holdBox) holdBox.addEventListener('click', onHoldClick);

    // Little shake on a box when the game refused what was asked of it.
    function denied(el) {
      if (!el) return;
      el.classList.remove('denied');
      void el.offsetWidth;
      el.classList.add('denied');
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(function () { el.classList.remove('denied'); }, 350);
    }

    return {
      releaseAll: releaseAll,
      denied: denied,
      destroy: function () {
        releaseAll();
        document.removeEventListener('gesturestart', onGestureStart);
        document.removeEventListener('gesturechange', onGestureStart);
        document.removeEventListener('touchend', onTouchEndGuard);
        if (zone) {
          zone.removeEventListener('pointerdown', onZoneDown);
          zone.removeEventListener('pointermove', onZoneMove);
          zone.removeEventListener('pointerup', onZoneUp);
          zone.removeEventListener('pointercancel', onZoneCancel);
          zone.removeEventListener('contextmenu', onZoneMenu);
        }
        if (holdBox) holdBox.removeEventListener('click', onHoldClick);
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

  var api = { attach: attach, createGesture: createGesture, GESTURE: G };
  if (typeof window !== 'undefined') window.TetrisControls = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

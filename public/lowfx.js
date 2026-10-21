// Low graphics mode, for computers where hardware acceleration is off or
// struggling. When it's on, the page gets class "lowfx" on <html>, and
// lowfx.css switches off the costly parts: background videos and GIFs,
// looping glows and filters, fixed backgrounds, and the custom cursor's
// per-frame drawing.
//
// The choice is saved in localStorage as lowfx_v1: "on", "off", or absent for
// Auto. In Auto, the page times a short run of frames once per session and
// turns the mode on if they come out slow.
(function () {
  var KEY = 'lowfx_v1', AUTO = 'lowfx_auto_v1';

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function measured() { try { return sessionStorage.getItem(AUTO); } catch (e) { return null; } }
  function apply(on) { document.documentElement.classList.toggle('lowfx', !!on); }

  // Apply straight away, before the first paint, from the saved choice or the
  // last measurement this session.
  var choice = stored();   // 'on', 'off', or null for Auto
  if (choice === 'on') apply(true);
  else if (choice === 'off') apply(false);
  else apply(measured() === 'slow');

  var NEXT = { auto: 'on', on: 'off', off: 'auto' };
  var LABEL = { auto: 'Auto', on: 'Low', off: 'Full' };

  function mode() { return choice === 'on' || choice === 'off' ? choice : 'auto'; }

  function set(next) {
    choice = next === 'auto' ? null : next;
    try {
      if (next === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
      sessionStorage.removeItem(AUTO);
    } catch (e) {}
    // Going back to Auto measures again, so reload to start the measurement.
    if (next === 'auto') { location.reload(); return; }
    apply(next === 'on');
    label();
  }

  function label() {
    var btn = document.getElementById('graphics-btn');
    if (btn) btn.textContent = '🎛️ Graphics: ' + LABEL[mode()];
  }

  window.IantopiaLowFx = {
    get mode() { return mode(); },
    isOn() { return document.documentElement.classList.contains('lowfx'); },
    set: set
  };

  document.addEventListener('DOMContentLoaded', function () {
    label();
    var btn = document.getElementById('graphics-btn');
    if (btn) btn.addEventListener('click', function () { set(NEXT[mode()]); });
  });

  // Automatic check: after the page has settled, time about 90 frames and see
  // how smoothly they're drawn. Too few frames, or a median above 30 ms, is slow.
  // Nothing is decided on a tab that isn't being drawn, so it tries again later.
  if (choice === null && measured() === null) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        var times = [], last = null, begun = null;
        function tick(now) {
          if (begun === null) begun = now;
          if (last !== null) times.push(now - last);
          last = now;
          if (now - begun < 1500) { requestAnimationFrame(tick); return; }
          if (times.length < 10) return;
          times.sort(function (a, b) { return a - b; });
          var median = times[Math.floor(times.length / 2)];
          var hitches = times.filter(function (t) { return t > 80; }).length;
          var slow = median > 30 || hitches > 6;
          try { sessionStorage.setItem(AUTO, slow ? 'slow' : 'fast'); } catch (e) {}
          apply(slow);
        }
        requestAnimationFrame(tick);
      }, 2000);
    });
  }
})();

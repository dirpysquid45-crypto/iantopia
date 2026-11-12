// Low graphics mode, an optional optimization. Full is the default and looks
// exactly as the game was designed. Low only drops the costliest blur and
// backdrop filters (see lowfx.css). Animations, hover effects and the custom
// cursor keep running in both modes.
//
// The choice is saved in localStorage as lowfx_v1: "on" for Low, "off" for
// Full. Nothing saved means Full.
(function () {
  var KEY = 'lowfx_v1';

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(on) { document.documentElement.classList.toggle('lowfx', !!on); }

  // Apply straight away, before the first paint, so the page never flashes.
  var on = stored() === 'on';
  apply(on);

  var LABEL = { on: 'Low', off: 'Full' };

  function mode() { return on ? 'on' : 'off'; }

  function set(next) {
    on = next === 'on';
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    apply(on);
    label();
  }

  function label() {
    var btn = document.getElementById('graphics-btn');
    if (btn) btn.textContent = '🎛️ Graphics: ' + LABEL[mode()];
  }

  window.IantopiaLowFx = {
    get mode() { return mode(); },
    isOn() { return on; },
    set: set
  };

  document.addEventListener('DOMContentLoaded', function () {
    label();
    var btn = document.getElementById('graphics-btn');
    if (btn) btn.addEventListener('click', function () { set(on ? 'off' : 'on'); });
  });
})();

// Raining Money: an optional layer that sits over whichever background is chosen.
// It's switched on and off in the Background picker, and saved in localStorage as
// money_rain_v1 ('1' on, '0' off).
(function () {
  var KEY = 'money_rain_v1';
  var ID = 'money-rain-layer';

  function isOn() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function paint() {
    var el = document.getElementById(ID);
    if (isOn()) {
      if (!el) {
        el = document.createElement('div');
        el.id = ID;
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background:url(/video/raining-money.gif) center / cover no-repeat;';
        document.body.insertBefore(el, document.body.firstChild);
      }
    } else if (el) {
      el.remove();
    }
  }

  window.MoneyRain = {
    isOn: isOn,
    set: function (on) {
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
      paint();
      window.dispatchEvent(new CustomEvent('money-rain:changed', { detail: { on: !!on } }));
    },
    paint: paint,
  };

  if (document.body) paint(); else document.addEventListener('DOMContentLoaded', paint);
})();

// tycoon-tutorial.js
// Hover tips for new players in My Iantopia. Hovering a control (or tapping it on a
// phone) shows a short box that says what the control does. Tips are on for a new
// village and switch off once it has three finished buildings, or when the player
// turns them off with the Tips button. Browser only.
(function () {
  var PREF_KEY = 'tycoon_tips_v1';            // 'on' | 'off' | absent (automatic)
  var VILLAGE_KEY = 'tycoon_village_v2';      // the same save the Tycoon page writes
  var AUTO_OFF_AFTER = 3;                     // finished buildings before the tips retire
  var SHOW_DELAY_MS = 350;                    // a passing mouse shouldn't flash a box
  var TAP_HIDE_MS = 4000;                     // on touch, the box stays up for this long

  var HINTS = [
    { sel: '#build-btn', text: 'Build: pick a building, then tap a tile to place it. It needs a road next to it and the right zoning under it.' },
    { sel: '#zoning-btn', text: 'Zoning: choose what each part of town is for. Buildings only go on zoning that matches them.' },
    { sel: '.brush-chip[data-brush="road"]', text: 'Roads: a building earns nothing unless a road touches it.' },
    { sel: '.brush-chip[data-brush="residential"]', text: 'Residential: where homes go. Homes house the people who work in your shops and offices.' },
    { sel: '#undo-btn', text: 'Undo: takes back your last placement, road or zoning change.' },
    { sel: '#bank-btn', text: 'Bank: raises your wallet cap, so your earnings are not clipped.' },
    { sel: '#stats-btn', text: 'Stats: your numbers, the leaderboards and today’s profit.' },
    { sel: '#next-goal-row', text: 'Early goals: each one you reach pays a one-time bonus, in order.' },
    { sel: '#guide-btn', text: 'Guide: the full rules, if you want more detail.' },
    { sel: '#game-stage', text: 'Your village. Pick a brush or a building first, then tap a tile.' }
  ];

  function readPref() {
    try { return localStorage.getItem(PREF_KEY); } catch (e) { return null; }
  }
  function writePref(v) {
    try { localStorage.setItem(PREF_KEY, v); } catch (e) { /* private window: tips just stay as they are */ }
  }
  function finishedBuildings() {
    try {
      var v = JSON.parse(localStorage.getItem(VILLAGE_KEY) || 'null');
      if (!v || !Array.isArray(v.b)) return 0;
      return v.b.filter(function (s) { return s && s.status === 'complete'; }).length;
    } catch (e) { return 0; }
  }
  function tipsOn() {
    var pref = readPref();
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    return finishedBuildings() < AUTO_OFF_AFTER;
  }

  var box, showTimer, hideTimer, current = null;

  function buildBox() {
    box = document.createElement('div');
    box.id = 'tycoon-tip';
    box.setAttribute('role', 'tooltip');
    box.style.cssText = 'position:fixed; z-index:70; display:none; max-width:min(300px,86vw); background:#000; color:#fff; border:3px solid #ffd700; padding:10px 12px; font:10px/1.7 monospace; box-shadow:0 0 0 2px #000, 0 6px 18px rgba(0,0,0,.6); pointer-events:auto;';
    var text = document.createElement('div');
    text.className = 'tip-text';
    var row = document.createElement('div');
    row.style.cssText = 'margin-top:6px; text-align:right;';
    var off = document.createElement('button');
    off.type = 'button';
    off.textContent = 'Hide tips';
    off.style.cssText = 'font:inherit; color:#ffd700; background:#000; border:2px solid #ffd700; padding:2px 6px; cursor:pointer;';
    off.addEventListener('click', function (e) {
      e.stopPropagation();
      writePref('off');
      hide();
      syncButton();
    });
    row.appendChild(off);
    box.appendChild(text);
    box.appendChild(row);
    document.body.appendChild(box);
  }

  function place(el) {
    var r = el.getBoundingClientRect();
    var w = box.offsetWidth, h = box.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    var top = r.bottom + 10;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 10);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  function show(el, text, sticky) {
    if (!box) buildBox();
    clearTimeout(hideTimer);
    current = el;
    box.querySelector('.tip-text').textContent = text;
    box.style.display = 'block';
    place(el);
    if (!sticky) hideTimer = setTimeout(hide, TAP_HIDE_MS);
  }

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    current = null;
    if (box) box.style.display = 'none';
  }

  function hintFor(node) {
    if (!node || !node.closest) return null;
    for (var i = 0; i < HINTS.length; i++) {
      var el = node.closest(HINTS[i].sel);
      if (el) return { el: el, text: HINTS[i].text };
    }
    return null;
  }

  function syncButton() {
    var b = document.getElementById('tips-btn');
    if (!b) return;
    var on = tipsOn();
    b.textContent = on ? '💡 Tips: on' : '💡 Tips: off';
    b.setAttribute('aria-pressed', String(on));
  }

  function onOver(e) {
    if (box && box.contains(e.target)) return;   // moving onto the box itself keeps it up
    if (!tipsOn() || e.pointerType === 'touch') return;
    var hit = hintFor(e.target);
    if (!hit) { hide(); return; }
    if (current === hit.el) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(function () { if (tipsOn()) show(hit.el, hit.text, true); }, SHOW_DELAY_MS);
  }

  function onOut(e) {
    if (!box) return;
    var to = e.relatedTarget;
    if (to && box.contains(to)) return;
    if (!to || !hintFor(to) || hintFor(to).el !== current) hide();
  }

  function onTap(e) {
    if (!tipsOn() || e.pointerType !== 'touch') return;
    var hit = hintFor(e.target);
    if (hit) show(hit.el, hit.text, false);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerup', onTap);
    document.addEventListener('scroll', hide, true);
    var tips = document.getElementById('tips-btn');
    if (tips) tips.addEventListener('click', function () {
      writePref(tipsOn() ? 'off' : 'on');
      if (!tipsOn()) hide();
      syncButton();
    });
    syncButton();
  });

  window.TycoonTips = { on: tipsOn, hide: hide };
})();

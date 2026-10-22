// Keyboard bindings for the Tetris pages: presets, a rebinding panel, and the
// saved choice (per browser, under localStorage key tetris_keys_v1).
//
// window.TetrisKeys:
//   ACTIONS                 [id, label] for each game action, in panel order
//   PRESETS                 name -> { title, bindings }
//   actionFor(key)          the action bound to this key, or null
//   get() / applyPreset(n) / bind(action, key)
//   keyLabel(key)           how a key is written on screen ("↑", "Space", "A")
//   mountPanel(el, onDone)  fills an element with the preset buttons and the rebinding list
(function () {
  var STORE = 'tetris_keys_v1';

  var ACTIONS = [
    ['left', 'Move left'],
    ['right', 'Move right'],
    ['soft', 'Soft drop'],
    ['hard', 'Slam (hard drop)'],
    ['hold', 'Hold'],
    ['rotcw', 'Rotate clockwise'],
    ['rotccw', 'Rotate counter-clockwise'],
    ['pause', 'Pause']
  ];

  // Presets. The first is the default. "Arrows rotate" puts rotation on Up and Down.
  var PRESETS = {
    arrows: {
      title: 'Arrows rotate (default)',
      bindings: {
        left: ['ArrowLeft', 'a'], right: ['ArrowRight', 'd'], soft: ['s'], hard: [' '],
        hold: ['c', 'Shift'], rotcw: ['ArrowUp', 'x'], rotccw: ['ArrowDown', 'z'], pause: ['p', 'Escape']
      }
    },
    guideline: {
      title: 'Guideline (Tetris Wiki)',
      bindings: {
        left: ['ArrowLeft', 'a'], right: ['ArrowRight', 'd'], soft: ['ArrowDown', 's'], hard: [' '],
        hold: ['c', 'Shift'], rotcw: ['ArrowUp', 'x'], rotccw: ['z', 'Control'], pause: ['Escape', 'p']
      }
    },
    classic: {
      title: 'Classic (R rotates, Up holds)',
      bindings: {
        left: ['a', 'ArrowLeft'], right: ['d', 'ArrowRight'], soft: ['s', 'ArrowDown'], hard: [' '],
        hold: ['ArrowUp'], rotcw: ['r', 'x'], rotccw: ['q', 'z'], pause: ['p', 'Escape']
      }
    }
  };
  var DEFAULT = 'arrows';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // A saved binding set is used only if it has every action with at least one key.
  function valid(b) {
    if (!b || typeof b !== 'object') return false;
    return ACTIONS.every(function (a) { return Array.isArray(b[a[0]]) && b[a[0]].length > 0; });
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && valid(o.bindings)) return clone(o.bindings);
      }
    } catch (e) { /* private mode: use the default */ }
    return clone(PRESETS[DEFAULT].bindings);
  }

  var current = load();

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ bindings: current })); } catch (e) {}
    window.dispatchEvent(new CustomEvent('tetris-keys-changed'));
  }

  function get() { return clone(current); }

  function actionFor(key) {
    for (var i = 0; i < ACTIONS.length; i++) {
      var name = ACTIONS[i][0];
      if (current[name].indexOf(key) !== -1) return name;
    }
    return null;
  }

  // One key per action. The key is taken from any other action it was on.
  function bind(action, key) {
    Object.keys(current).forEach(function (name) {
      current[name] = current[name].filter(function (k) { return k !== key; });
      if (!current[name].length) current[name] = [PRESETS[DEFAULT].bindings[name][0]];
    });
    current[action] = [key];
    save();
  }

  function applyPreset(name) {
    if (!PRESETS[name]) return;
    current = clone(PRESETS[name].bindings);
    save();
  }

  var NAMES = {
    ' ': 'Space', 'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    'Escape': 'Esc', 'Shift': 'Shift', 'Control': 'Ctrl'
  };
  function keyLabel(key) {
    if (NAMES[key]) return NAMES[key];
    return key.length === 1 ? key.toUpperCase() : key;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Fills `root` with the preset buttons and one row per action. Clicking "change"
  // waits for the next key press (Esc cancels). The page's own key handling is
  // blocked during that press, so the key doesn't also move a piece.
  function mountPanel(root, onDone) {
    root.textContent = '';
    var presetRow = el('div', 'keys-presets');
    Object.keys(PRESETS).forEach(function (name) {
      var b = el('button', 'btn keys-preset', PRESETS[name].title);
      b.type = 'button';
      b.addEventListener('click', function () { applyPreset(name); draw(); });
      presetRow.appendChild(b);
    });
    root.appendChild(presetRow);

    var list = el('div', 'keys-list');
    root.appendChild(list);

    var capturing = null;   // the action waiting for a key, or null
    var status = el('p', 'keys-status', 'Choose a preset, or change one key at a time.');
    root.appendChild(status);

    function draw() {
      list.textContent = '';
      ACTIONS.forEach(function (a) {
        var row = el('div', 'keys-row');
        row.appendChild(el('span', 'keys-name', a[1]));
        var keys = el('span', 'keys-keys', current[a[0]].map(keyLabel).join(' · '));
        row.appendChild(keys);
        var btn = el('button', 'btn keys-change', capturing === a[0] ? 'press a key…' : 'change');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Change key for ' + a[1]);
        btn.addEventListener('click', function () { start(a[0]); });
        row.appendChild(btn);
        list.appendChild(row);
      });
    }

    function start(action) {
      capturing = action;
      status.textContent = 'Press the new key for ' + action + '. Esc cancels.';
      draw();
      window.addEventListener('keydown', capture, true);
    }

    function capture(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', capture, true);
      if (e.key !== 'Escape') {
        bind(capturing, e.key);
        status.textContent = keyLabel(e.key) + ' is now ' + capturing + '.';
      } else {
        status.textContent = 'Cancelled.';
      }
      capturing = null;
      draw();
      if (onDone) onDone();
    }

    draw();
  }

  // ---- look settings (the board's extra layers) ----
  var LOOK_KEY = 'tetris_look_v1';
  var LOOK_DEFAULT = { ghost: true, onion: true, effects: true };
  var LOOK_TITLES = [
    ['ghost', 'Ghost layers (landing spot)'],
    ['onion', 'Onion skin (falling trail)'],
    ['effects', 'Row flashes on clears']
  ];
  function lookLoad() {
    try {
      var o = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null');
      if (o && typeof o === 'object') return { ghost: o.ghost !== false, onion: o.onion !== false, effects: o.effects !== false };
    } catch (e) {}
    return clone(LOOK_DEFAULT);
  }
  var look = lookLoad();
  function lookSet(name, on) {
    look[name] = !!on;
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) {}
  }

  // Fills the labels in the touch pad (and anywhere else with data-hint="action")
  // with the key each action is bound to, so the pad doubles as a keyboard guide.
  function refreshHints(root) {
    (root || document).querySelectorAll('[data-hint]').forEach(function (n) {
      var keys = current[n.getAttribute('data-hint')] || [];
      n.textContent = keys.length ? keys.map(keyLabel).join(' / ') : '';
    });
  }
  window.addEventListener('tetris-keys-changed', function () { refreshHints(); });

  // Settings panel: the key bindings, and the look toggles. `onDone` runs after any change.
  function mountSettings(root, onDone) {
    root.textContent = '';
    var keysBox = el('div', 'settings-keys');
    root.appendChild(keysBox);
    mountPanel(keysBox, function () { refreshHints(); if (onDone) onDone(); });

    var lookBox = el('div', 'settings-look');
    lookBox.appendChild(el('h3', 'settings-h', 'Look'));
    LOOK_TITLES.forEach(function (t) {
      var label = el('label', 'settings-toggle');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = look[t[0]];
      box.addEventListener('change', function () { lookSet(t[0], box.checked); if (onDone) onDone(); });
      label.appendChild(box);
      label.appendChild(el('span', '', t[1]));
      lookBox.appendChild(label);
    });
    root.appendChild(lookBox);
    refreshHints();
  }

  window.TetrisKeys = {
    look: function () { return clone(look); },
    setLook: lookSet,
    refreshHints: refreshHints,
    mountSettings: mountSettings,
    ACTIONS: ACTIONS,
    PRESETS: PRESETS,
    actionFor: actionFor,
    get: get,
    applyPreset: applyPreset,
    bind: bind,
    keyLabel: keyLabel,
    mountPanel: mountPanel
  };
})();

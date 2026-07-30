// Shared music/background/cursor picker logic for all pages.
// Each page must define the element IDs and load the libraries first.
// Usage: call initPickers() after DOM is ready and libraries are loaded.

window.initPickers = function() {
  const ACTIVE_BG_KEY = 'active_bg_v1';
  const ACTIVE_TRACK_KEY = 'active_track_v1';
  const BG_LIB = window.BACKGROUND_LIBRARY || {};
  const MUSIC_LIB = window.MUSIC_LIBRARY || {};
  const CURSOR_LIB = window.CURSOR_LIBRARY || {};

  // Utility: load inventory from localStorage
  function loadInventory() {
    try {
      const inv = localStorage.getItem('strubles_inventory_v1');
      return inv ? JSON.parse(inv) : { items: [], badges: [], powerups: [], sfx: [], themes: [], tracks: [], backgrounds: [], cursors: [] };
    } catch {
      return { items: [], badges: [], powerups: [], sfx: [], themes: [], tracks: [], backgrounds: [], cursors: [] };
    }
  }

  // Background switcher
  const bgBtn = document.getElementById('bg-btn');
  const bgOverlay = document.getElementById('bg-overlay');
  const bgList = document.getElementById('bg-list');
  const bgClose = document.getElementById('bg-close');
  if (bgBtn && bgOverlay) {
    function renderBgPicker() {
      bgList.innerHTML = '';
      Object.entries(BG_LIB).forEach(([key, bg]) => {
        const row = document.createElement('div');
        row.className = 'picker-row';
        row.style.cursor = 'pointer';
        const label = document.createElement('span');
        label.textContent = bg.label;
        const indicator = document.createElement('span');
        indicator.style.marginLeft = 'auto';
        indicator.textContent = localStorage.getItem(ACTIVE_BG_KEY) === key ? '✓' : '';
        row.appendChild(label);
        row.appendChild(indicator);
        row.addEventListener('click', () => {
          localStorage.setItem(ACTIVE_BG_KEY, key);
          applyBg(key);
          renderBgPicker();
        });
        bgList.appendChild(row);
      });
    }
    function applyBg(key) {
      const bg = BG_LIB[key] || BG_LIB.default || {};
      if (bg.type === 'video') {
        document.body.style.backgroundImage = 'none';
        const vid = document.getElementById('bg-video');
        if (vid) {
          vid.src = bg.src;
          vid.classList.add('show');
          vid.play().catch(() => {});
        }
      } else {
        const vid = document.getElementById('bg-video');
        if (vid) {
          vid.classList.remove('show');
          vid.pause();
        }
        document.body.style.backgroundImage = `url('${bg.src}')`;
        document.body.style.backgroundPosition = bg.position || 'center';
      }
    }
    bgBtn.addEventListener('click', () => {
      renderBgPicker();
      bgOverlay.classList.add('open');
    });
    bgClose.addEventListener('click', () => bgOverlay.classList.remove('open'));
    bgOverlay.addEventListener('click', (e) => {
      if (e.target === bgOverlay) bgOverlay.classList.remove('open');
    });
    const bgKey = localStorage.getItem(ACTIVE_BG_KEY) || 'default';
    if (BG_LIB[bgKey]) applyBg(bgKey);
  }

  // Music player (only init if all required elements exist)
  const nowPlayingBtn = document.getElementById('now-playing');
  const playlistOverlay = document.getElementById('playlist-overlay');
  const playlistList = document.getElementById('playlist-list');
  const playlistClose = document.getElementById('playlist-close');
  if (nowPlayingBtn && playlistOverlay && playlistList && playlistClose) {
    const themeMusic = document.getElementById('theme-music');
    function getActiveTrackKey() {
      const key = localStorage.getItem(ACTIVE_TRACK_KEY);
      return (key && MUSIC_LIB[key]) ? key : 'balatro';
    }
    function playTrack(key) {
      if (!MUSIC_LIB[key]) return;
      localStorage.setItem(ACTIVE_TRACK_KEY, key);
      if (themeMusic) {
        themeMusic.src = MUSIC_LIB[key].src;
        themeMusic.play().catch(() => {});
      }
    }
    function renderPlaylist() {
      playlistList.innerHTML = '';
      Object.entries(MUSIC_LIB).forEach(([key, track]) => {
        const owned = loadInventory().tracks?.includes(key) || key === 'balatro';
        const row = document.createElement('div');
        row.className = 'picker-row';
        row.style.cursor = owned ? 'pointer' : 'default';
        row.style.opacity = owned ? '1' : '0.5';
        const label = document.createElement('span');
        label.textContent = track.label;
        if (!owned) label.style.textDecoration = 'line-through';
        const indicator = document.createElement('span');
        indicator.style.marginLeft = 'auto';
        indicator.textContent = getActiveTrackKey() === key ? '▶' : '';
        row.appendChild(label);
        row.appendChild(indicator);
        if (owned) {
          row.addEventListener('click', () => {
            playTrack(key);
            renderPlaylist();
          });
        }
        playlistList.appendChild(row);
      });
    }
    nowPlayingBtn.addEventListener('click', () => {
      renderPlaylist();
      playlistOverlay.classList.add('open');
    });
    playlistClose.addEventListener('click', () => playlistOverlay.classList.remove('open'));
    playlistOverlay.addEventListener('click', (e) => {
      if (e.target === playlistOverlay) playlistOverlay.classList.remove('open');
    });
    if (themeMusic) {
      themeMusic.src = MUSIC_LIB[getActiveTrackKey()].src;
      themeMusic.play().catch(() => {});
    }
  }

  // Cursor picker (only init if all required elements exist)
  const cursorBtn = document.getElementById('cursor-btn');
  const cursorOverlay = document.getElementById('cursor-overlay');
  const cursorList = document.getElementById('cursor-list');
  const cursorClose = document.getElementById('cursor-close');
  if (cursorBtn && cursorOverlay && cursorList && cursorClose) {
    const ACTIVE_CURSOR_KEY = 'active_cursor_v1';
    function getActiveCursorKey() {
      const key = localStorage.getItem(ACTIVE_CURSOR_KEY);
      return (key && CURSOR_LIB[key]) ? key : 'default';
    }
    function renderCursorPicker() {
      cursorList.innerHTML = '';
      Object.entries(CURSOR_LIB).forEach(([key, cursor]) => {
        const owned = loadInventory().cursors?.includes(key) || key === 'default';
        const row = document.createElement('div');
        row.className = 'picker-row';
        row.style.cursor = owned ? 'pointer' : 'default';
        row.style.opacity = owned ? '1' : '0.5';
        const label = document.createElement('span');
        label.textContent = cursor.label;
        if (!owned) label.style.textDecoration = 'line-through';
        const indicator = document.createElement('span');
        indicator.style.marginLeft = 'auto';
        indicator.textContent = getActiveCursorKey() === key ? '✓' : '';
        row.appendChild(label);
        row.appendChild(indicator);
        if (owned) {
          row.addEventListener('click', () => {
            localStorage.setItem(ACTIVE_CURSOR_KEY, key);
            window.dispatchEvent(new Event('cursor:changed'));
            renderCursorPicker();
          });
        }
        cursorList.appendChild(row);
      });
    }
    cursorBtn.addEventListener('click', () => {
      renderCursorPicker();
      cursorOverlay.classList.add('open');
    });
    cursorClose.addEventListener('click', () => cursorOverlay.classList.remove('open'));
    cursorOverlay.addEventListener('click', (e) => {
      if (e.target === cursorOverlay) cursorOverlay.classList.remove('open');
    });
  }

};

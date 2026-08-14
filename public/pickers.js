// Shared music/background/cursor picker logic for all pages.
// Each page must define the element IDs and load the libraries first.
// Usage: call initPickers() after DOM is ready and libraries are loaded.

window.initPickers = function() {
  // Suffixed with the page's own path so blackjack/alternate-ending/
  // minesweeper each get independent storage instead of sharing one key —
  // previously all three pages you'd load pickers.js on shared a single
  // active_bg_v1/active_track_v1, so a pick on one silently applied to the
  // others too. Home and lootbox already have their own dedicated keys
  // outside this shared file.
  //
  // Trailing slash stripped before using it as a key: "/blackjack" and
  // "/blackjack/" are the same page, but nginx doesn't always normalize a
  // bare-directory request to the slash form before the app ever sees it
  // (and a service worker sitting in front of that can obscure whichever
  // form actually got requested) — without this, a pick made under one
  // form is invisible from the other, which reads as "my choice keeps
  // getting reset" even though it's really just reading the wrong key.
  const PAGE_PATH = location.pathname.replace(/\/$/, '') || '/';
  const ACTIVE_BG_KEY = 'active_bg_v1__' + PAGE_PATH;
  const ACTIVE_TRACK_KEY = 'active_track_v1__' + PAGE_PATH;
  const VIDEO_POS_KEY = 'bg_video_pos_v1__' + PAGE_PATH;
  const BG_LIB = window.BACKGROUND_LIBRARY || {};
  const MUSIC_LIB = window.MUSIC_LIBRARY || {};
  const CURSOR_LIB = window.CURSOR_LIBRARY || {};

  // Set once the music block below actually runs (it's gated on this page
  // having the playlist elements at all) — applyBg() needs to be able to
  // trigger a combo background's paired track even though it's defined
  // before the music section, and a function declared inside that section's
  // own `if` block isn't reachable from here directly (block-scoped). By
  // the time applyBg() is ever actually CALLED (on click, or the on-load
  // auto-apply at the bottom of this file), the music block has already
  // run and populated this if it exists on the page.
  let playTrackRef = null;

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
      // A page can restrict itself to a fixed subset of BG_LIB (e.g. the
      // inventory room only ever offers its own shelf variants, never the
      // general Taipei/casino/etc. library) via window.PAGE_BG_ALLOWLIST.
      // When set, it fully replaces the normal "every owned background"
      // list — including the literal 'default' entry, which is why an
      // allowlisted page has to name its own free key explicitly via
      // PAGE_FREE_BG_KEY rather than relying on 'default' being free.
      const allowlist = window.PAGE_BG_ALLOWLIST;
      const keys = allowlist || Object.keys(BG_LIB);
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      keys.forEach((key) => {
        const bg = BG_LIB[key];
        if (!bg) return;
        // `restricted` backgrounds (the inventory shelf variants) only ever
        // show up on a page whose OWN allowlist names them explicitly —
        // otherwise they'd leak into every other page's picker just for
        // being present in the shared library at all.
        if (bg.restricted && !(allowlist && allowlist.includes(key))) return;
        // `desktopOnly` backgrounds (Leafy Shelf) are hidden below the
        // site's usual 768px breakpoint — it's a busy image that doesn't
        // read well at phone width.
        if (bg.desktopOnly && isMobile) return;
        // Locked backgrounds are hidden entirely, not shown-and-greyed —
        // you can't see it until you've actually unlocked it.
        const owned = loadInventory().backgrounds?.includes(key) || key === 'default' || key === window.PAGE_FREE_BG_KEY;
        if (!owned) return;
        const row = document.createElement('div');
        row.className = 'picker-row';
        row.style.cursor = 'pointer';
        const label = document.createElement('span');
        // The "Default" row's label follows this page's own declared
        // default (if any), not the shared library's Taipei label — it'd
        // be confusing to show "Taipei" for a row that actually restores
        // blackjack's casino entrance or minesweeper's drone footage.
        label.textContent = (key === 'default' && window.PAGE_DEFAULT_BG?.label) || bg.label;
        const indicator = document.createElement('span');
        indicator.style.marginLeft = 'auto';
        indicator.textContent = localStorage.getItem(ACTIVE_BG_KEY) === key ? '✓' : '';
        row.appendChild(label);
        row.appendChild(indicator);
        row.addEventListener('click', () => {
          localStorage.setItem(ACTIVE_BG_KEY, key);
          applyBg(key);
          renderBgPicker();
          // Lets anything that depends on which background is active react
          // immediately — e.g. the inventory room re-snapping items to the
          // newly-selected shelf's line positions instead of the old one's.
          window.dispatchEvent(new CustomEvent('active-background:changed', { detail: { key } }));
        });
        bgList.appendChild(row);
      });
    }
    // "Default" resolves to whatever this specific page declared as its own
    // look (window.PAGE_DEFAULT_BG — e.g. minesweeper's drone footage,
    // blackjack's casino entrance), not the shared library's Taipei entry,
    // so picking "Default" here restores THIS page's default, not home's.
    function applyBg(key) {
      const bg = (key === 'default' && window.PAGE_DEFAULT_BG) || BG_LIB[key] || BG_LIB.default || {};
      // A page can redirect where the image itself actually lands via
      // window.PAGE_BG_TARGET (an element) — the inventory room uses this
      // to keep its background on a dedicated position:fixed layer instead
      // of body's background-attachment:fixed, which iOS Safari desyncs
      // from fixed content during elastic overscroll bounce.
      const target = window.PAGE_BG_TARGET || document.body;
      if (bg.type === 'video') {
        target.style.backgroundImage = 'none';
        const vid = document.getElementById('bg-video');
        if (vid) {
          const isSameVideo = vid.src && vid.src.endsWith(bg.src);
          vid.src = bg.src;
          vid.classList.add('show');
          // Resumes where this exact video last left off, same as
          // MusicPosition already does for audio tracks — previously every
          // video-type background restarted from 0:00 on every page load
          // or re-pick, even the same one you were already watching.
          if (window.MusicPosition) {
            window.MusicPosition.restore(VIDEO_POS_KEY, vid);
            if (!vid.dataset.positionTracked) {
              vid.dataset.positionTracked = '1';
              window.MusicPosition.track(VIDEO_POS_KEY, vid);
            }
          }
          vid.play().catch(() => {});
          // Combo backgrounds (Waster, Evian Christ, Clarity, etc. — see
          // background-library.js's `comboTrack`) switch Now Playing to
          // their paired track automatically, same as home's own picker
          // already does — this was home-only before, so picking one of
          // these on minesweeper/blackjack/etc. changed the video but left
          // whatever track was already playing untouched.
          if (bg.comboTrack && !isSameVideo && playTrackRef) playTrackRef(bg.comboTrack);
        }
      } else {
        const vid = document.getElementById('bg-video');
        if (vid) {
          vid.classList.remove('show');
          vid.pause();
        }
        target.style.backgroundImage = `url('${bg.src}')`;
        target.style.backgroundPosition = bg.position || 'center';
      }
      // Themed backgrounds (Hello Kitty, Old People Slot, etc. — see
      // background-library.js) recolor this page's chrome the same way
      // home's own picker does, always on document.body regardless of
      // PAGE_BG_TARGET — the background image can be redirected elsewhere,
      // but the button/outline styling always lives on body.
      if (window.BACKGROUND_THEME_CLASSES) document.body.classList.remove(...window.BACKGROUND_THEME_CLASSES);
      if (bg.theme) document.body.classList.add(bg.theme);
    }
    bgBtn.addEventListener('click', () => {
      renderBgPicker();
      bgOverlay.classList.add('open');
    });
    bgClose.addEventListener('click', () => bgOverlay.classList.remove('open'));
    bgOverlay.addEventListener('click', (e) => {
      if (e.target === bgOverlay) bgOverlay.classList.remove('open');
    });
    // Only apply anything if the user has made a REAL explicit choice —
    // otherwise leave the page's own hardcoded default background alone.
    // This used to unconditionally apply BG_LIB.default (Taipei) on every
    // page load, silently overwriting e.g. blackjack's casino-entrance.gif
    // with Taipei for anyone who'd never opened the picker.
    const savedBgKey = localStorage.getItem(ACTIVE_BG_KEY);
    const savedBg = savedBgKey && BG_LIB[savedBgKey];
    // A saved Leafy Shelf pick still shouldn't render on a phone even if it
    // was chosen from a desktop session earlier — falls back to this page's
    // own hardcoded default instead (matches the picker itself hiding it).
    const savedIsMobileBlocked = savedBg?.desktopOnly && window.matchMedia('(max-width: 768px)').matches;
    if (savedBgKey && savedBgKey !== 'default' && savedBg && !savedIsMobileBlocked) applyBg(savedBgKey);
  }

  // Music player (only init if all required elements exist)
  const nowPlayingBtn = document.getElementById('now-playing');
  const playlistOverlay = document.getElementById('playlist-overlay');
  const playlistList = document.getElementById('playlist-list');
  const playlistClose = document.getElementById('playlist-close');
  if (nowPlayingBtn && playlistOverlay && playlistList && playlistClose) {
    const themeMusic = document.getElementById('theme-music');
    // A page's own resting-default track (e.g. blackjack's Balatro,
    // minesweeper's Desert) plays for free with no unlock needed on THAT
    // page, but was previously implemented as `key === 'balatro'` being
    // owned everywhere unconditionally — meaning Balatro showed up as
    // already-unlocked on every page regardless of whether it had actually
    // been earned from a case. window.PAGE_FREE_TRACK_KEY scopes that
    // "free without unlocking" grant to just the one page that declares it;
    // everywhere else the track still has to be earned normally, and once
    // it genuinely is (added to the shared inventory), it plays everywhere.
    const freeKey = window.PAGE_FREE_TRACK_KEY;
    function getActiveTrackKey() {
      const key = localStorage.getItem(ACTIVE_TRACK_KEY);
      return (key && MUSIC_LIB[key]) ? key : (freeKey || 'default');
    }
    function playTrack(key) {
      if (!MUSIC_LIB[key]) return;
      localStorage.setItem(ACTIVE_TRACK_KEY, key);
      if (themeMusic) {
        themeMusic.src = MUSIC_LIB[key].src;
        themeMusic.play().catch(() => {});
      }
      // Previously dispatched nothing at all, so a track pick had no path
      // to the cloud faster than the 15s periodic sync — see cloud-sync.js.
      window.dispatchEvent(new CustomEvent('active-track:changed', { detail: { key } }));
    }
    playTrackRef = playTrack;
    function renderPlaylist() {
      playlistList.innerHTML = '';
      Object.entries(MUSIC_LIB).forEach(([key, track]) => {
        const owned = loadInventory().tracks?.includes(key) || key === 'default' || key === freeKey;
        // Hidden entirely when locked, not shown-and-greyed.
        if (!owned) return;
        const row = document.createElement('div');
        row.className = 'picker-row';
        row.style.cursor = 'pointer';
        const label = document.createElement('span');
        label.textContent = track.label;
        const indicator = document.createElement('span');
        indicator.style.marginLeft = 'auto';
        indicator.textContent = getActiveTrackKey() === key ? '▶' : '';
        row.appendChild(label);
        row.appendChild(indicator);
        row.addEventListener('click', () => {
          playTrack(key);
          renderPlaylist();
        });
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
    // Only apply anything if a REAL explicit choice was saved — otherwise
    // leave the page's own hardcoded <audio src> default alone. This used
    // to unconditionally force Balatro Main Theme on every page load,
    // which would have silently clobbered minesweeper's own default track.
    const savedTrackKey = localStorage.getItem(ACTIVE_TRACK_KEY);
    if (themeMusic && savedTrackKey && MUSIC_LIB[savedTrackKey]) {
      themeMusic.src = MUSIC_LIB[savedTrackKey].src;
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
        // Hidden entirely when locked, not shown-and-greyed.
        if (!owned) return;
        const row = document.createElement('div');
        row.className = 'picker-row';
        row.style.cursor = 'pointer';
        const label = document.createElement('span');
        label.textContent = cursor.label;
        const indicator = document.createElement('span');
        indicator.style.marginLeft = 'auto';
        indicator.textContent = getActiveCursorKey() === key ? '✓' : '';
        row.appendChild(label);
        row.appendChild(indicator);
        row.addEventListener('click', () => {
          localStorage.setItem(ACTIVE_CURSOR_KEY, key);
          window.dispatchEvent(new Event('cursor:changed'));
          renderCursorPicker();
        });
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

// music-position.js
// Remembers playback position per page so long tracks (e.g. the home
// theme) resume where they left off instead of restarting when you
// navigate away and back. This is a saved-position resume, not true
// gapless playback across pages -- the site is multi-page (full reload
// on navigation), so the audio element itself can't survive a nav.
window.MusicPosition = {
  save(key, audio) {
    if (!audio || !audio.src) return;
    try {
      localStorage.setItem(key, JSON.stringify({ src: audio.src, time: audio.currentTime }));
    } catch {}
  },
  restore(key, audio) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.src === audio.src && isFinite(data.time) && data.time > 0) {
        audio.currentTime = data.time;
      }
    } catch {}
  },
  // Wires periodic + on-leave saving for a given <audio> element.
  track(key, audio) {
    const interval = setInterval(() => this.save(key, audio), 3000);
    const saveNow = () => this.save(key, audio);
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', saveNow);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('beforeunload', saveNow);
    };
  },
};

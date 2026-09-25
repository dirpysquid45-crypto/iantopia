/**
 * Arena music controller with volume/mute UI.
 * Shared across all Arena pages (hub, Blackjack, Battleship).
 */

class ArenaMusic {
  constructor(trackPath, autoplay = true) {
    this.audio = new Audio(trackPath);
    this.audio.loop = true;
    this.audio.volume = 0.5;
    if (autoplay) this.audio.play().catch(() => {}); // Autoplay may fail due to browser policy

    this.createUI();
  }

  createUI() {
    // Create floating music control
    const control = document.createElement('div');
    control.id = 'arena-music-control';
    control.innerHTML = `
      <style>
        #arena-music-control {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 100;
          background: rgba(0,0,0,.7);
          border: 2px solid #ffd700;
          padding: 12px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: 'Press Start 2P', monospace;
        }
        #arena-music-control button {
          background: #ffd700;
          color: #000;
          border: none;
          padding: 6px 10px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.2s;
        }
        #arena-music-control button:hover {
          background: #ffe766;
        }
        #arena-music-control input[type="range"] {
          width: 100px;
          accent-color: #ffd700;
          cursor: pointer;
        }
        #arena-music-control .volume-label {
          font-size: 9px;
          color: #ffd700;
          white-space: nowrap;
        }
      </style>
      <div class="volume-label">♪</div>
      <input type="range" id="volume-slider" min="0" max="100" value="50">
      <button id="mute-btn">Mute</button>
    `;
    document.body.appendChild(control);

    // Wire up controls
    const slider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');

    slider.addEventListener('input', (e) => {
      this.audio.volume = e.target.value / 100;
      muteBtn.textContent = this.audio.volume === 0 ? 'Unmute' : 'Mute';
    });

    muteBtn.addEventListener('click', () => {
      if (this.audio.volume > 0) {
        this._previousVolume = this.audio.volume;
        this.audio.volume = 0;
        muteBtn.textContent = 'Unmute';
        slider.value = 0;
      } else {
        this.audio.volume = this._previousVolume || 0.5;
        muteBtn.textContent = 'Mute';
        slider.value = this.audio.volume * 100;
      }
    });

    this.slider = slider;
    this.muteBtn = muteBtn;
  }

  play() {
    this.audio.play().catch(() => {});
  }

  pause() {
    this.audio.pause();
  }

  setVolume(vol) {
    this.audio.volume = Math.max(0, Math.min(1, vol));
    if (this.slider) this.slider.value = this.audio.volume * 100;
    if (this.muteBtn) this.muteBtn.textContent = this.audio.volume === 0 ? 'Unmute' : 'Mute';
  }
}

window.ArenaMusic = ArenaMusic;

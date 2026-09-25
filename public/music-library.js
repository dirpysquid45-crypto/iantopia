/**
 * Iantopia Music Library & Playlist Manager
 * Shared across all game pages. Supports shuffle, repeat, and track selection.
 */

const MUSIC_LIBRARY = [
  // Arena Competitive
  { name: 'Koronba - Ryegen', path: '/koronba%20-%20Ryegen.mp3', category: 'arena', mood: 'intense' },
  { name: 'AAA Powerline', path: '/audio/music/aaa-powerline.mp3', category: 'arena', mood: 'energy' },
  { name: 'Deathmetal', path: '/audio/music/deathmetal.mp3', category: 'arena', mood: 'aggressive' },

  // Exploration & Chill
  { name: 'Balatro Main Theme', path: '/audio/music/Balatro-Main-Theme.mp3', category: 'lobby', mood: 'strategic' },
  { name: 'Forever Young', path: '/audio/music/forever-young.mp3', category: 'chill', mood: 'relaxed' },
  { name: 'Clarity', path: '/audio/music/clarity.mp3', category: 'chill', mood: 'meditative' },
  { name: 'Hotel', path: '/audio/music/hotel.mp3', category: 'chill', mood: 'ambient' },

  // Tycoon & Management
  { name: 'Buildings Instrumental', path: '/audio/music/buildings-instrumental.mp3', category: 'tycoon', mood: 'productive' },
  { name: 'Taipei Instrumental', path: '/audio/music/taipei-instrumental.mp3', category: 'tycoon', mood: 'zen' },

  // Epic & Adventure
  { name: 'Chinggis Khaan', path: '/audio/music/chinggis-khaan.mp3', category: 'epic', mood: 'heroic' },
  { name: 'Arvan Khoyor Jil', path: '/audio/music/arvan-khoyor-jil.mp3', category: 'epic', mood: 'majestic' },

  // Experimental
  { name: 'Bladee Waster', path: '/audio/music/bladee-waster.mp3', category: 'experimental', mood: 'ethereal' },
  { name: 'Evian Christ Yxguden', path: '/audio/music/evian-christ-yxguden.mp3', category: 'experimental', mood: 'cosmic' },
  { name: 'Girl Like Me', path: '/audio/music/girl-like-me.mp3', category: 'experimental', mood: 'upbeat' },

  // Special
  { name: 'Minecraft OST', path: '/audio/music/minecraft-ost.mp3', category: 'nostalgia', mood: 'calm' },
  { name: 'Lootbox Theme', path: '/audio/music/lootbox-theme.mp3', category: 'games', mood: 'exciting' },
  { name: 'Home Theme', path: '/audio/music/home-theme.mp3', category: 'lobby', mood: 'welcoming' },
  { name: 'Cursed', path: '/audio/music/cursed.mp3', category: 'experimental', mood: 'dark' }
];

class PlaylistManager {
  constructor() {
    this.library = MUSIC_LIBRARY;
    this.currentIndex = 0;
    this.isShuffling = false;
    this.playlist = [...this.library];
    this.audio = null;
  }

  init(audioElement = null) {
    if (audioElement) {
      this.audio = audioElement;
    } else {
      this.audio = new Audio();
      this.audio.loop = false;
      this.audio.volume = 0.6;
    }
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.audio) {
      this.audio.addEventListener('ended', () => this.nextTrack());
    }
  }

  shuffle() {
    this.isShuffling = !this.isShuffling;
    if (this.isShuffling) {
      this.playlist = this.library.sort(() => Math.random() - 0.5);
      this.currentIndex = 0;
    } else {
      this.playlist = [...this.library];
      this.currentIndex = 0;
    }
    return this.isShuffling;
  }

  play(trackIndex = this.currentIndex) {
    if (trackIndex < 0 || trackIndex >= this.playlist.length) return;
    const track = this.playlist[trackIndex];
    if (!this.audio) return;

    this.audio.src = track.path;
    this.audio.play().catch(() => {});
    this.currentIndex = trackIndex;
    return track;
  }

  nextTrack() {
    if (this.currentIndex + 1 < this.playlist.length) {
      this.currentIndex++;
    } else {
      this.currentIndex = 0;
    }
    this.play(this.currentIndex);
  }

  prevTrack() {
    if (this.currentIndex - 1 >= 0) {
      this.currentIndex--;
    } else {
      this.currentIndex = this.playlist.length - 1;
    }
    this.play(this.currentIndex);
  }

  getCurrentTrack() {
    return this.playlist[this.currentIndex] || null;
  }

  getTracksByCategory(category) {
    return this.library.filter(t => t.category === category);
  }

  getTracksByMood(mood) {
    return this.library.filter(t => t.mood === mood);
  }

  setVolume(vol) {
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, vol));
    }
  }
}

window.PlaylistManager = PlaylistManager;
window.MUSIC_LIBRARY = MUSIC_LIBRARY;

/**
 * Snoopy Coaster Web Game - UI and Input Handling System
 *
 * Manages game states, screen rendering, user input, and seasonal features.
 * Designed to be engine-agnostic and modular for easy integration.
 */

class SnoopyCoasterUI {
  constructor(options = {}) {
    // Core configuration
    this.canvasId = options.canvasId || 'game-canvas';
    this.containerId = options.containerId || 'game-container';
    this.canvas = document.getElementById(this.canvasId);
    this.container = document.getElementById(this.containerId);
    this.ctx = this.canvas?.getContext('2d');

    // Game state
    this.state = 'menu'; // menu | playing | paused | gameover
    this.score = 0;
    this.multiplier = 1;
    this.lives = 3;
    this.level = 1;
    this.bestScore = parseInt(localStorage.getItem('snoopy_coaster_best_v1') || 0);
    this.soundEnabled = localStorage.getItem('snoopy_sound_enabled') !== 'false';
    this.volume = parseFloat(localStorage.getItem('snoopy_volume_v1') || 0.3);

    // Game engine reference (set after construction)
    this.gameEngine = null;

    // Input state
    this.keys = {};
    this.touchActive = false;
    this.lastTouchTime = 0;
    this.isMobile = this.detectMobile();
    this.devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);

    // Seasonal content
    this.isSeasonUnlocked = this.checkSeasonalUnlock();
    this.currentTheme = this.isSeasonUnlocked ? 'thanksgiving' : 'default';

    // Audio
    this.audioElements = {};
    this.initAudio();

    // UI state
    this.showSettings = false;
    this.showPauseMenu = false;
    this.lastFrameTime = Date.now();

    // Bind event handlers
    this.setupEventListeners();
    this.setupTouchControls();
    this.resizeCanvas();

    // Version tracking
    this.version = '1.0.0';
  }

  // ==================== Initialization ====================

  /**
   * Link game engine for state synchronization
   */
  setGameEngine(engine) {
    this.gameEngine = engine;
  }

  /**
   * Initialize audio system
   */
  initAudio() {
    this.audioElements = {
      jump: new Audio('/audio/snoopy/jump.mp3'),
      collect: new Audio('/audio/snoopy/collect.mp3'),
      powerup: new Audio('/audio/snoopy/powerup.mp3'),
      hit: new Audio('/audio/snoopy/hit.mp3'),
      levelUp: new Audio('/audio/snoopy/levelup.mp3'),
      menuTheme: new Audio('/audio/snoopy/menu-theme.mp3'),
      gameTheme: new Audio('/audio/snoopy/game-theme.mp3'),
    };

    // Set volumes and basic properties
    Object.keys(this.audioElements).forEach(key => {
      const audio = this.audioElements[key];
      audio.volume = this.volume;
      audio.preload = 'auto';
    });

    // Loop theme music
    this.audioElements.menuTheme.loop = true;
    this.audioElements.gameTheme.loop = true;
  }

  /**
   * Detect if user is on mobile
   */
  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 768;
  }

  /**
   * Check if seasonal content is unlocked (Thanksgiving: Nov 8+)
   */
  checkSeasonalUnlock() {
    const today = new Date();
    const month = today.getMonth(); // 0-11
    const date = today.getDate();
    return month === 10 && date >= 8; // November 8+
  }

  // ==================== Event Listeners ====================

  /**
   * Setup keyboard and window event listeners
   */
  setupEventListeners() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      this.handleKeyDown(e);
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
      this.handleKeyUp(e);
    });

    // Canvas events
    if (this.canvas) {
      this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
      this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
      this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
      this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }

    // Window resize
    window.addEventListener('resize', () => this.resizeCanvas());
    if (window.ResizeObserver) {
      new ResizeObserver(() => this.resizeCanvas()).observe(this.container || document.body);
    }

    // Prevent context menu on game canvas
    this.canvas?.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Setup touch control buttons
   */
  setupTouchControls() {
    const jumpBtn = document.getElementById('jump-btn');
    const leftBtn = document.getElementById('left-btn');
    const rightBtn = document.getElementById('right-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const settingsBtn = document.getElementById('settings-btn');

    if (jumpBtn) {
      jumpBtn.addEventListener('touchstart', () => this.jumpButtonDown());
      jumpBtn.addEventListener('touchend', () => this.jumpButtonUp());
      jumpBtn.addEventListener('mousedown', () => this.jumpButtonDown());
      jumpBtn.addEventListener('mouseup', () => this.jumpButtonUp());
    }

    if (leftBtn) {
      leftBtn.addEventListener('touchstart', () => this.moveLeft(true));
      leftBtn.addEventListener('touchend', () => this.moveLeft(false));
      leftBtn.addEventListener('mousedown', () => this.moveLeft(true));
      leftBtn.addEventListener('mouseup', () => this.moveLeft(false));
    }

    if (rightBtn) {
      rightBtn.addEventListener('touchstart', () => this.moveRight(true));
      rightBtn.addEventListener('touchend', () => this.moveRight(false));
      rightBtn.addEventListener('mousedown', () => this.moveRight(true));
      rightBtn.addEventListener('mouseup', () => this.moveRight(false));
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.togglePause());
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.toggleSettings());
    }
  }

  // ==================== Input Handlers ====================

  /**
   * Handle keyboard down
   */
  handleKeyDown(e) {
    const key = e.key.toLowerCase();

    if (this.state === 'menu') {
      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        this.startGame();
      }
    } else if (this.state === 'playing') {
      if (key === ' ' || key === 'arrowup' || key === 'w') {
        e.preventDefault();
        this.handleJump(true);
      }
      if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        this.moveLeft(true);
      }
      if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        this.moveRight(true);
      }
      if (key === 'escape') {
        this.togglePause();
      }
    } else if (this.state === 'gameover') {
      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        this.startGame();
      }
    }
  }

  /**
   * Handle keyboard up
   */
  handleKeyUp(e) {
    const key = e.key.toLowerCase();

    if (this.state === 'playing') {
      if (key === ' ' || key === 'arrowup' || key === 'w') {
        e.preventDefault();
        this.handleJump(false);
      }
      if (key === 'arrowleft' || key === 'a') {
        this.moveLeft(false);
      }
      if (key === 'arrowright' || key === 'd') {
        this.moveRight(false);
      }
    }
  }

  /**
   * Handle canvas click (for desktop)
   */
  handleCanvasClick(e) {
    if (this.state === 'menu') {
      this.startGame();
    } else if (this.state === 'gameover') {
      this.startGame();
    }
  }

  /**
   * Handle touch start
   */
  handleTouchStart(e) {
    e.preventDefault();
    this.touchActive = true;
    this.lastTouchTime = Date.now();

    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;

    // Determine touch zone (for on-screen controls)
    if (x < canvasWidth * 0.33) {
      // Left zone
      this.moveLeft(true);
    } else if (x > canvasWidth * 0.67) {
      // Right zone
      this.moveRight(true);
    } else if (y > canvasHeight * 0.6) {
      // Bottom zone (jump)
      this.handleJump(true);
    }
  }

  /**
   * Handle touch move
   */
  handleTouchMove(e) {
    e.preventDefault();
  }

  /**
   * Handle touch end
   */
  handleTouchEnd(e) {
    e.preventDefault();
    this.touchActive = false;
    this.moveLeft(false);
    this.moveRight(false);
    this.handleJump(false);
  }

  /**
   * Handle jump input
   */
  handleJump(isDown) {
    if (this.gameEngine && this.gameEngine.onJump) {
      this.gameEngine.onJump(isDown);
    }
  }

  /**
   * Jump button from UI
   */
  jumpButtonDown() {
    if (this.state === 'playing') {
      this.handleJump(true);
    }
  }

  jumpButtonUp() {
    this.handleJump(false);
  }

  /**
   * Move left
   */
  moveLeft(isActive) {
    if (this.gameEngine && this.gameEngine.onMoveLeft) {
      this.gameEngine.onMoveLeft(isActive);
    }
  }

  /**
   * Move right
   */
  moveRight(isActive) {
    if (this.gameEngine && this.gameEngine.onMoveRight) {
      this.gameEngine.onMoveRight(isActive);
    }
  }

  // ==================== Game State Management ====================

  /**
   * Start the game
   */
  startGame() {
    this.state = 'playing';
    this.score = 0;
    this.multiplier = 1;
    this.lives = 3;
    this.level = 1;

    this.playAudio('gameTheme');
    this.stopAudio('menuTheme');

    if (this.gameEngine && this.gameEngine.startGame) {
      this.gameEngine.startGame();
    }

    this.updateHUD();
  }

  /**
   * Pause the game
   */
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.showPauseMenu = true;
      if (this.gameEngine && this.gameEngine.pause) {
        this.gameEngine.pause();
      }
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.showPauseMenu = false;
      if (this.gameEngine && this.gameEngine.resume) {
        this.gameEngine.resume();
      }
    }
  }

  /**
   * End the game
   */
  endGame(finalScore = 0) {
    this.state = 'gameover';
    this.score = finalScore;
    this.showPauseMenu = false;

    this.stopAudio('gameTheme');
    this.playAudio('hit');

    if (finalScore > this.bestScore) {
      this.bestScore = finalScore;
      localStorage.setItem('snoopy_coaster_best_v1', this.bestScore);
    }

    this.updateHUD();
  }

  /**
   * Add to score
   */
  addScore(points = 10) {
    this.score += Math.round(points * this.multiplier);
    this.updateHUD();
  }

  /**
   * Update multiplier
   */
  setMultiplier(value) {
    this.multiplier = Math.max(1, value);
    this.updateHUD();
  }

  /**
   * Lose a life
   */
  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this.updateHUD();
    this.playAudio('hit');
    return this.lives > 0;
  }

  /**
   * Level up
   */
  levelUp() {
    this.level += 1;
    this.playAudio('levelUp');
    this.updateHUD();
  }

  /**
   * Toggle settings panel
   */
  toggleSettings() {
    this.showSettings = !this.showSettings;
  }

  /**
   * Toggle sound
   */
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('snoopy_sound_enabled', this.soundEnabled);
    this.updateAudioState();
  }

  /**
   * Set volume
   */
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    localStorage.setItem('snoopy_volume_v1', this.volume);
    this.updateAudioState();
  }

  /**
   * Update audio state across all elements
   */
  updateAudioState() {
    Object.keys(this.audioElements).forEach(key => {
      const audio = this.audioElements[key];
      audio.volume = this.soundEnabled ? this.volume : 0;
    });
  }

  // ==================== Audio ====================

  /**
   * Play audio
   */
  playAudio(key) {
    if (!this.soundEnabled) return;
    const audio = this.audioElements[key];
    if (audio) {
      try {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } catch (e) {
        console.warn(`Failed to play audio: ${key}`, e);
      }
    }
  }

  /**
   * Stop audio
   */
  stopAudio(key) {
    const audio = this.audioElements[key];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  // ==================== Canvas & Rendering ====================

  /**
   * Resize canvas to fit container
   */
  resizeCanvas() {
    if (!this.canvas || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(240, rect.height);

    this.canvas.width = Math.round(width * this.devicePixelRatio);
    this.canvas.height = Math.round(height * this.devicePixelRatio);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    if (this.ctx) {
      this.ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    }
  }

  /**
   * Main render loop
   */
  render(deltaTime = 0) {
    if (!this.ctx) return;

    const w = this.canvas.width / this.devicePixelRatio;
    const h = this.canvas.height / this.devicePixelRatio;

    // Clear canvas
    this.ctx.fillStyle = this.currentTheme === 'thanksgiving' ? '#2d1810' : '#87ceeb';
    this.ctx.fillRect(0, 0, w, h);

    // Render state-specific screens
    switch (this.state) {
      case 'menu':
        this.renderMenuScreen(w, h);
        break;
      case 'playing':
        this.renderGameplay(w, h);
        break;
      case 'paused':
        this.renderPauseScreen(w, h);
        break;
      case 'gameover':
        this.renderGameOverScreen(w, h);
        break;
    }

    // Render overlays
    if (this.showSettings) {
      this.renderSettingsPanel(w, h);
    }

    if (this.state === 'playing') {
      this.renderHUD(w, h);
    }
  }

  /**
   * Render menu screen
   */
  renderMenuScreen(w, h) {
    // Background
    if (this.currentTheme === 'thanksgiving') {
      this.ctx.fillStyle = '#4a2f1a';
      this.ctx.fillRect(0, 0, w, h);
      this.drawText('🎃 SNOOPY COASTER 🎃', w / 2, h * 0.2, 48, '#ff8c00', 'center');
      this.drawText('Thanksgiving Edition', w / 2, h * 0.3, 24, '#ff6b35', 'center');
    } else {
      this.ctx.fillStyle = '#87ceeb';
      this.ctx.fillRect(0, 0, w, h);
      this.drawText('SNOOPY COASTER', w / 2, h * 0.2, 48, '#0066cc', 'center');
      this.drawText('A Coaster Adventure', w / 2, h * 0.3, 24, '#0099ff', 'center');
    }

    // Instructions
    const instY = h * 0.45;
    this.drawText('Instructions:', w / 2, instY, 16, '#fff', 'center');
    this.drawText('Tap/Click or Press SPACE to jump', w / 2, instY + 30, 12, '#fff', 'center');
    this.drawText('Use Arrow Keys or A/D to move left/right', w / 2, instY + 55, 12, '#fff', 'center');
    this.drawText('Collect items to earn points', w / 2, instY + 80, 12, '#fff', 'center');

    // Best score
    const bestY = h * 0.72;
    this.drawText(`Best Score: ${this.bestScore.toLocaleString()}`, w / 2, bestY, 16, '#ffff00', 'center');

    // Start button
    this.drawButton(w / 2, h * 0.85, 160, 50, '▶ START GAME', 24);

    // Seasonal badge
    if (this.currentTheme === 'thanksgiving') {
      this.ctx.fillStyle = '#ff8c00';
      this.ctx.font = '14px Arial, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('🦃 Thanksgiving Celebration Unlocked! 🦃', w / 2, h - 20);
    }
  }

  /**
   * Render gameplay (called by game engine)
   */
  renderGameplay(w, h) {
    // This is where the game engine draws the actual gameplay
    // The UI system just renders the HUD on top
  }

  /**
   * Render HUD overlay during gameplay
   */
  renderHUD(w, h) {
    // Semi-transparent background for stats
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(0, 0, w, 60);

    // Score
    this.drawText(`Score: ${this.score.toLocaleString()}`, 15, 25, 14, '#ffff00', 'left');

    // Multiplier
    const multColor = this.multiplier > 1 ? '#ff6b6b' : '#ffffff';
    this.drawText(`×${this.multiplier.toFixed(1)}`, w / 2, 25, 14, multColor, 'center');

    // Lives
    this.drawText(`Lives: ${this.lives}`, w - 15, 25, 14, '#ffffff', 'right');

    // Level
    this.drawText(`Lvl ${this.level}`, 15, 50, 12, '#aaaaaa', 'left');

    // Pause indicator
    if (this.isMobile) {
      this.drawText('[ESC to pause]', w - 15, 50, 11, '#aaaaaa', 'right');
    }
  }

  /**
   * Render pause screen
   */
  renderPauseScreen(w, h) {
    // Dim overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, w, h);

    // Pause message
    this.drawText('PAUSED', w / 2, h / 2 - 60, 48, '#ffff00', 'center');

    // Instructions
    this.drawButton(w / 2, h / 2 + 20, 200, 50, '▶ Resume Game', 18);
    this.drawButton(w / 2, h / 2 + 90, 200, 50, '⚙ Settings', 18);
    this.drawButton(w / 2, h / 2 + 160, 200, 50, '🏠 Main Menu', 18);
  }

  /**
   * Render game over screen
   */
  renderGameOverScreen(w, h) {
    // Dim overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, w, h);

    // Game Over text
    this.drawText('GAME OVER', w / 2, h * 0.15, 48, '#ff6b6b', 'center');

    // Score display
    const statsY = h * 0.35;
    this.drawText(`Final Score: ${this.score.toLocaleString()}`, w / 2, statsY, 20, '#ffffff', 'center');
    this.drawText(`Best Score: ${this.bestScore.toLocaleString()}`, w / 2, statsY + 35, 16, '#ffff00', 'center');

    // New record notification
    if (this.score === this.bestScore && this.score > 0) {
      this.drawText('🏆 NEW RECORD! 🏆', w / 2, statsY + 70, 18, '#ffcc00', 'center');
    }

    // Restart button
    this.drawButton(w / 2, h * 0.72, 200, 50, '↻ Play Again', 22);

    // Menu button
    this.drawButton(w / 2, h * 0.82, 200, 50, '🏠 Main Menu', 18);
  }

  /**
   * Render settings panel
   */
  renderSettingsPanel(w, h) {
    const panelW = Math.min(300, w * 0.85);
    const panelH = 280;
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    // Semi-transparent background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    this.ctx.fillRect(panelX, panelY, panelW, panelH);

    // Border
    this.ctx.strokeStyle = '#ffff00';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(panelX, panelY, panelW, panelH);

    // Title
    this.ctx.fillStyle = '#ffff00';
    this.ctx.font = 'bold 20px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('⚙ SETTINGS', w / 2, panelY + 30);

    // Sound toggle
    const soundY = panelY + 70;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '14px Arial, sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Sound:', panelX + 20, soundY);
    this.drawButton(panelX + 150, soundY - 12, 110, 30, this.soundEnabled ? '🔊 On' : '🔇 Off', 12);

    // Volume slider
    const volY = soundY + 50;
    this.ctx.fillText('Volume:', panelX + 20, volY);
    this.drawSlider(panelX + 140, volY - 8, 130, 16, this.volume);

    // Theme info
    const themeY = volY + 50;
    this.ctx.fillText('Theme:', panelX + 20, themeY);
    const themeText = this.currentTheme === 'thanksgiving' ? '🎃 Thanksgiving' : '☀ Default';
    this.ctx.fillText(themeText, panelX + 140, themeY);

    // Close button
    this.drawButton(w / 2, panelY + panelH - 30, 150, 28, 'Close', 14);
  }

  /**
   * Update HUD display
   */
  updateHUD() {
    // Update any DOM elements if they exist
    const scoreEl = document.getElementById('hud-score');
    const livesEl = document.getElementById('hud-lives');
    const levelEl = document.getElementById('hud-level');
    const multEl = document.getElementById('hud-multiplier');

    if (scoreEl) scoreEl.textContent = this.score.toLocaleString();
    if (livesEl) livesEl.textContent = this.lives;
    if (levelEl) levelEl.textContent = this.level;
    if (multEl) multEl.textContent = `×${this.multiplier.toFixed(1)}`;
  }

  // ==================== Drawing Utilities ====================

  /**
   * Draw text
   */
  drawText(text, x, y, size, color, align = 'center') {
    this.ctx.fillStyle = color;
    this.ctx.font = `bold ${size}px Arial, sans-serif`;
    this.ctx.textAlign = align;
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 4;
    this.ctx.shadowOffsetX = 2;
    this.ctx.shadowOffsetY = 2;
    this.ctx.fillText(text, x, y);
    this.ctx.shadowColor = 'transparent';
  }

  /**
   * Draw button
   */
  drawButton(x, y, w, h, text, fontSize) {
    // Button background
    this.ctx.fillStyle = '#0066cc';
    this.ctx.fillRect(x - w / 2, y - h / 2, w, h);

    // Button border
    this.ctx.strokeStyle = '#ffff00';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    // Button text
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x, y);
  }

  /**
   * Draw slider
   */
  drawSlider(x, y, w, h, value) {
    // Track
    this.ctx.fillStyle = '#444444';
    this.ctx.fillRect(x, y, w, h);

    // Fill
    this.ctx.fillStyle = '#00ff00';
    this.ctx.fillRect(x, y, w * value, h);

    // Border
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, w, h);
  }

  // ==================== Utilities ====================

  /**
   * Get current game state
   */
  getState() {
    return {
      state: this.state,
      score: this.score,
      multiplier: this.multiplier,
      lives: this.lives,
      level: this.level,
      bestScore: this.bestScore,
      soundEnabled: this.soundEnabled,
      volume: this.volume,
      theme: this.currentTheme,
      isSeasonUnlocked: this.isSeasonUnlocked,
    };
  }

  /**
   * Reset game state
   */
  reset() {
    this.state = 'menu';
    this.score = 0;
    this.multiplier = 1;
    this.lives = 3;
    this.level = 1;
    this.showSettings = false;
    this.showPauseMenu = false;
  }

  /**
   * Save game state
   */
  saveState(state) {
    try {
      const saveData = {
        version: this.version,
        timestamp: Date.now(),
        score: this.score,
        level: this.level,
        lives: this.lives,
        bestScore: this.bestScore,
        ...state,
      };
      localStorage.setItem('snoopy_coaster_save_v1', JSON.stringify(saveData));
    } catch (e) {
      console.warn('Failed to save game state', e);
    }
  }

  /**
   * Load game state
   */
  loadState() {
    try {
      const saved = localStorage.getItem('snoopy_coaster_save_v1');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.version === this.version) {
          return data;
        }
      }
    } catch (e) {
      console.warn('Failed to load game state', e);
    }
    return null;
  }

  /**
   * Export stats for leaderboard
   */
  exportStats() {
    return {
      score: this.score,
      level: this.level,
      multiplier: this.multiplier,
      bestScore: this.bestScore,
      theme: this.currentTheme,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    };
  }

  /**
   * Check if mobile
   */
  getIsMobile() {
    return this.isMobile;
  }

  /**
   * Get canvas dimensions
   */
  getCanvasDimensions() {
    return {
      width: this.canvas.width / this.devicePixelRatio,
      height: this.canvas.height / this.devicePixelRatio,
      dpr: this.devicePixelRatio,
    };
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SnoopyCoasterUI;
}

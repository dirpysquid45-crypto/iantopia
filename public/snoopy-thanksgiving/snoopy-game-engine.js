/**
 * Snoopy Coaster Game Engine
 * A modular, canvas-based game engine with physics, collision detection,
 * entity management, and input handling.
 *
 * Architecture:
 * - Canvas rendering (responsive, mobile-friendly, high-DPI support)
 * - Game loop (requestAnimationFrame with delta time)
 * - Physics engine (gravity, collisions, movement)
 * - Entity system (player, obstacles, collectibles, particles)
 * - Input handling (keyboard + touch events)
 * - Score tracking and game state management
 */

// ============================================================================
// GAME ENGINE CLASS
// ============================================================================

export class SnoopyGameEngine {
  constructor(canvas, options = {}) {
    // Core references
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Failed to get 2D context');

    // Configuration
    this.options = {
      gravity: options.gravity || 800,
      jumpVelocity: options.jumpVelocity || 550,
      maxSpeed: options.maxSpeed || 400,
      initialSpeed: options.initialSpeed || 150,
      acceleration: options.acceleration || 60,
      ...options,
    };

    // Game state
    this.state = 'idle'; // idle | playing | gameOver
    this.score = 0;
    this.distance = 0;
    this.itemsCollected = 0;

    // Physics and display
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.worldScale = 1;
    this.worldWidth = 0;
    this.worldHeight = 0;
    this.groundY = 0;
    this.speed = this.options.initialSpeed;

    // Entities
    this.player = this.createPlayer();
    this.obstacles = [];
    this.collectibles = [];
    this.particles = [];
    this.terrain = [];

    // Input state
    this.input = {
      jumping: false,
      jumpPressed: false,
      ducking: false,
    };

    // Timing
    this.deltaTime = 0;
    this.lastFrameTime = 0;
    this.elapsedTime = 0;
    this.spawnTimer = 0;
    this.dustTimer = 0;

    // Configuration constants
    this.GROUND_HEIGHT = 50;
    this.PLAYER_WIDTH = 60;
    this.PLAYER_HEIGHT = 60;
    this.MIN_SPAWN_DISTANCE = 200;
    this.SPAWN_INTERVAL = 2.5;

    // Initialize
    this.resize();
    this.setupInputHandlers();
    this.setupResizeObserver();
  }

  // ========================================================================
  // INITIALIZATION & SETUP
  // ========================================================================

  createPlayer() {
    return {
      x: 100,
      y: 0,
      width: this.PLAYER_WIDTH,
      height: this.PLAYER_HEIGHT,
      vy: 0,
      vx: 0,
      isGrounded: true,
      isDucking: false,
      isInvincible: false,
      invincibilityTimer: 0,
      image: null,
    };
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect() || {
      width: this.canvas.offsetWidth,
      height: this.canvas.offsetHeight,
    };

    const width = rect.width;
    const height = rect.height;

    // High-DPI canvas rendering
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);

    // Setup transform
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Calculate world scale (responsive scaling)
    const minWorldWidth = 320;
    const minWorldHeight = 240;
    this.worldScale = Math.max(
      0.5,
      Math.min(1.2, width / minWorldWidth, height / minWorldHeight)
    );

    this.worldWidth = width / this.worldScale;
    this.worldHeight = height / this.worldScale;
    this.groundY = this.worldHeight - this.GROUND_HEIGHT;

    this.ctx.scale(this.worldScale, this.worldScale);
  }

  setupResizeObserver() {
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.canvas.parentElement || this.canvas);
    }
  }

  setupInputHandlers() {
    // Keyboard input
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));

    // Touch/pointer input
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));

    // Prevent default touch behaviors
    this.canvas.style.touchAction = 'none';
  }

  handleKeyDown(e) {
    if (this.state !== 'playing') return;

    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'arrowup' || key === 'w') {
      e.preventDefault();
      if (!this.input.jumping) {
        this.input.jumpPressed = true;
        this.jump();
      }
    }
    if (key === 'arrowdown' || key === 's') {
      e.preventDefault();
      this.input.ducking = true;
      this.player.isDucking = true;
    }
  }

  handleKeyUp(e) {
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'arrowup' || key === 'w') {
      this.input.jumping = false;
      this.input.jumpPressed = false;
    }
    if (key === 'arrowdown' || key === 's') {
      this.input.ducking = false;
      this.player.isDucking = false;
    }
  }

  handlePointerDown(e) {
    if (this.state === 'idle') {
      this.start();
      return;
    }
    if (this.state !== 'playing') return;

    // Determine jump vs duck based on vertical position
    const rect = this.canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const midY = rect.height / 2;

    if (y < midY) {
      // Upper half: jump
      if (!this.input.jumping) {
        this.input.jumpPressed = true;
        this.jump();
      }
    } else {
      // Lower half: duck
      this.input.ducking = true;
      this.player.isDucking = true;
    }
  }

  handlePointerUp(e) {
    this.input.jumping = false;
    this.input.jumpPressed = false;
    this.input.ducking = false;
    this.player.isDucking = false;
  }

  handlePointerMove(e) {
    // Can be extended for tilt/accelerometer controls
  }

  // ========================================================================
  // GAME LOOP & UPDATE
  // ========================================================================

  start() {
    this.state = 'playing';
    this.score = 0;
    this.distance = 0;
    this.itemsCollected = 0;
    this.speed = this.options.initialSpeed;
    this.elapsedTime = 0;
    this.spawnTimer = 0;
    this.player = this.createPlayer();
    this.obstacles = [];
    this.collectibles = [];
    this.particles = [];
    this.terrain = [];
  }

  update(dt) {
    if (this.state !== 'playing') return;

    this.deltaTime = dt;
    this.elapsedTime += dt;

    // Update speed (acceleration)
    this.speed = Math.min(
      this.options.maxSpeed,
      this.speed + this.options.acceleration * dt
    );

    // Update player
    this.updatePlayer(dt);

    // Update entities
    this.updateObstacles(dt);
    this.updateCollectibles(dt);
    this.updateParticles(dt);

    // Spawn new obstacles
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnObstacle();
      this.spawnTimer = this.SPAWN_INTERVAL;
    }

    // Update distance
    this.distance += this.speed * dt;
  }

  updatePlayer(dt) {
    const p = this.player;

    // Apply gravity
    if (!p.isGrounded) {
      p.vy -= this.options.gravity * dt;
    }

    // Update position
    p.y += p.vy * dt;
    p.x += p.vx * dt;

    // Ground collision
    if (p.y >= this.groundY) {
      p.y = this.groundY;
      p.vy = 0;
      p.isGrounded = true;
    } else {
      p.isGrounded = false;
    }

    // Boundary checks
    if (p.x < 0) p.x = 0;
    if (p.x + p.width > this.worldWidth) {
      p.x = this.worldWidth - p.width;
    }

    // Invincibility management
    if (p.isInvincible) {
      p.invincibilityTimer -= dt;
      if (p.invincibilityTimer <= 0) {
        p.isInvincible = false;
      }
    }
  }

  jump() {
    const p = this.player;
    if (!p.isGrounded) return;

    p.vy = this.options.jumpVelocity;
    p.isGrounded = false;
    this.input.jumping = true;

    // Spawn jump particle effect
    this.spawnDustParticles(p.x + p.width / 2, p.y + p.height, 5);
  }

  updateObstacles(dt) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= this.speed * dt;

      // Remove if off-screen
      if (obs.x + obs.width < 0) {
        this.obstacles.splice(i, 1);
        continue;
      }

      // Collision detection
      if (this.checkCollision(this.player, obs) && !this.player.isInvincible) {
        this.gameOver();
        return;
      }

      // Update animation
      if (obs.animate) {
        obs.frameIndex = (obs.frameIndex || 0) + dt * (obs.frameRate || 10);
      }
    }
  }

  updateCollectibles(dt) {
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const item = this.collectibles[i];
      item.x -= this.speed * dt;

      // Bobbing animation
      item.bobOffset = (item.bobOffset || 0) + dt * 3;

      // Remove if off-screen
      if (item.x + item.width < 0) {
        this.collectibles.splice(i, 1);
        continue;
      }

      // Collision detection (pickup)
      if (this.checkCollision(this.player, item, true)) {
        this.collectItem(item);
        this.collectibles.splice(i, 1);
        this.spawnCollectParticles(item.x + item.width / 2, item.y);
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vx *= 0.95; // Air resistance
      p.vy -= 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // ========================================================================
  // ENTITY MANAGEMENT
  // ========================================================================

  spawnObstacle() {
    const obstacleTypes = ['spike', 'tree', 'rock'];
    const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];

    const obstacle = {
      x: this.worldWidth,
      y: this.groundY - 60,
      width: 40,
      height: 60,
      type,
      frameIndex: 0,
      frameRate: 10,
    };

    this.obstacles.push(obstacle);
  }

  spawnCollectible(x, y) {
    const types = ['star', 'gem', 'gift'];
    const type = types[Math.floor(Math.random() * types.length)];

    const collectible = {
      x,
      y,
      width: 24,
      height: 24,
      type,
      value: type === 'gift' ? 10 : (type === 'gem' ? 5 : 1),
      bobOffset: 0,
    };

    this.collectibles.push(collectible);
  }

  collectItem(item) {
    this.score += item.value;
    this.itemsCollected += 1;
  }

  spawnDustParticles(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 100 + Math.random() * 100;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.2,
        radius: 2 + Math.random() * 2,
        color: `rgba(200, 150, 100, ${0.6 + Math.random() * 0.4})`,
      });
    }
  }

  spawnCollectParticles(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 150;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 100,
        life: 0.4 + Math.random() * 0.3,
        radius: 3 + Math.random() * 3,
        color: `rgba(255, 215, 0, ${0.7 + Math.random() * 0.3})`,
      });
    }
  }

  // ========================================================================
  // COLLISION DETECTION
  // ========================================================================

  checkCollision(entity1, entity2, isPickup = false) {
    const padding = isPickup ? entity1.width * 0.2 : 8;

    return (
      entity1.x + padding < entity2.x + entity2.width &&
      entity1.x + entity1.width - padding > entity2.x &&
      entity1.y < entity2.y + entity2.height &&
      entity1.y + entity1.height > entity2.y
    );
  }

  // ========================================================================
  // GAME STATE
  // ========================================================================

  gameOver() {
    this.state = 'gameOver';
  }

  reset() {
    this.state = 'idle';
    this.score = 0;
    this.distance = 0;
    this.itemsCollected = 0;
    this.obstacles = [];
    this.collectibles = [];
    this.particles = [];
    this.player = this.createPlayer();
  }

  // ========================================================================
  // RENDERING
  // ========================================================================

  render() {
    this.clearScreen();

    // Draw background
    this.drawBackground();

    // Draw ground
    this.drawGround();

    // Draw entities
    this.drawPlayer();
    this.drawObstacles();
    this.drawCollectibles();
    this.drawParticles();

    // Draw UI
    this.drawHUD();
  }

  clearScreen() {
    this.ctx.fillStyle = '#87CEEB'; // Sky blue
    this.ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
  }

  drawBackground() {
    // Simple scrolling background gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.worldHeight);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.7, '#E0F6FF');
    gradient.addColorStop(1, '#90EE90');

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
  }

  drawGround() {
    this.ctx.fillStyle = '#228B22';
    this.ctx.fillRect(
      0,
      this.groundY,
      this.worldWidth,
      this.GROUND_HEIGHT
    );

    // Add grass texture
    this.ctx.strokeStyle = '#1a6b1a';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < this.worldWidth; i += 15) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, this.groundY);
      this.ctx.lineTo(i + 8, this.groundY - 4);
      this.ctx.stroke();
    }
  }

  drawPlayer() {
    const p = this.player;

    // Blinking effect for invincibility
    if (p.isInvincible && Math.floor(this.elapsedTime * 8) % 2 === 0) {
      return;
    }

    // Draw player body
    this.ctx.fillStyle = '#000';
    this.ctx.beginPath();
    this.ctx.arc(
      p.x + p.width / 2,
      p.y + p.height / 2,
      p.width / 2.2,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Draw player face
    this.ctx.fillStyle = '#fff';
    const eyeY = p.y + p.height * 0.35;
    this.ctx.beginPath();
    this.ctx.arc(p.x + p.width * 0.35, eyeY, 4, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(p.x + p.width * 0.65, eyeY, 4, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw eyes looking direction of travel
    this.ctx.fillStyle = '#000';
    this.ctx.beginPath();
    this.ctx.arc(p.x + p.width * 0.38, eyeY, 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(p.x + p.width * 0.68, eyeY, 2, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw mouth
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(
      p.x + p.width / 2,
      p.y + p.height * 0.65,
      6,
      0,
      Math.PI
    );
    this.ctx.stroke();
  }

  drawObstacles() {
    for (const obs of this.obstacles) {
      this.ctx.fillStyle = '#8B4513';
      this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Draw obstacle-specific details
      if (obs.type === 'spike') {
        this.ctx.fillStyle = '#654321';
        this.ctx.beginPath();
        this.ctx.moveTo(obs.x + obs.width / 2, obs.y);
        this.ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
        this.ctx.lineTo(obs.x, obs.y + obs.height);
        this.ctx.fill();
      } else if (obs.type === 'tree') {
        this.ctx.fillStyle = '#228B22';
        this.ctx.fillRect(obs.x + 10, obs.y - 20, 20, 20);
      }
    }
  }

  drawCollectibles() {
    for (const item of this.collectibles) {
      const y = item.y + Math.sin(item.bobOffset) * 3;

      this.ctx.fillStyle = item.type === 'gem' ? '#FF1493' : '#FFD700';
      this.ctx.beginPath();
      this.ctx.arc(
        item.x + item.width / 2,
        y + item.height / 2,
        item.width / 2,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Shine effect
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.beginPath();
      this.ctx.arc(
        item.x + item.width * 0.35,
        y + item.height * 0.35,
        item.width / 4,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    }
  }

  drawParticles() {
    for (const p of this.particles) {
      const alpha = p.life / (0.5);
      this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      this.ctx.fillStyle = p.color || '#FFD700';

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  drawHUD() {
    this.ctx.fillStyle = '#000';
    this.ctx.font = 'bold 16px Arial';
    this.ctx.textAlign = 'left';

    const padding = 10;
    this.ctx.fillText(`Score: ${Math.floor(this.score)}`, padding, padding + 16);
    this.ctx.fillText(`Distance: ${Math.floor(this.distance / 100)}m`, padding, padding + 36);

    // Game over message
    if (this.state === 'gameOver') {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 28px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('GAME OVER', this.worldWidth / 2, this.worldHeight / 2 - 20);

      this.ctx.font = 'bold 16px Arial';
      this.ctx.fillText(`Final Score: ${Math.floor(this.score)}`, this.worldWidth / 2, this.worldHeight / 2 + 20);
      this.ctx.fillText(`Distance: ${Math.floor(this.distance / 100)}m`, this.worldWidth / 2, this.worldHeight / 2 + 45);
      this.ctx.fillText('Click to restart', this.worldWidth / 2, this.worldHeight / 2 + 75);
    }
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  getState() {
    return {
      score: this.score,
      distance: this.distance,
      itemsCollected: this.itemsCollected,
      gameState: this.state,
      speed: this.speed,
      elapsedTime: this.elapsedTime,
    };
  }

  setGameOverCallback(callback) {
    this._gameOverCallback = callback;
  }

  gameOver() {
    this.state = 'gameOver';
    if (this._gameOverCallback) {
      this._gameOverCallback({
        score: this.score,
        distance: this.distance,
        itemsCollected: this.itemsCollected,
      });
    }
  }

  restart() {
    this.reset();
    this.start();
  }
}

// ============================================================================
// GAME RUNNER
// ============================================================================

export class GameRunner {
  constructor(engine) {
    this.engine = engine;
    this.isRunning = false;
    this.animationFrameId = null;
    this.lastTime = 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  loop = (currentTime = performance.now()) => {
    if (!this.isRunning) return;

    // Calculate delta time
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.033); // Cap at ~30fps
    this.lastTime = currentTime;

    // Update and render
    this.engine.update(dt);
    this.engine.render();

    // Handle game over restart
    if (this.engine.state === 'gameOver') {
      // Wait for click/tap to restart (handled by input handler)
    } else if (this.engine.state === 'idle') {
      // Waiting for start
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  pause() {
    this.isRunning = false;
  }

  resume() {
    this.lastTime = performance.now();
    this.isRunning = true;
    this.animationFrameId = requestAnimationFrame(this.loop);
  }
}

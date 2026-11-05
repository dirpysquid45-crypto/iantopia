/**
 * Snoopy Thanksgiving Coaster Game Adapter
 * Bridges the modular SnoopyGameEngine with the Astro page UI
 */

(async function initializeThanksgivingCoaster() {
  const { SnoopyGameEngine, GameRunner } = await import('/snoopy-game-engine.js');

  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('[Thanksgiving Coaster] Canvas not found');
    return;
  }

  // Initialize engine
  const engine = new SnoopyGameEngine(canvas, {
    gravity: 800,
    jumpVelocity: 550,
    maxSpeed: 400,
    initialSpeed: 150,
    acceleration: 60,
  });

  const runner = new GameRunner(engine);
  let gameActive = false;

  // Expose interface to Astro page
  window.ThanksgivingCoaster = {
    start() {
      if (gameActive) return;
      gameActive = true;
      engine.start();
      runner.start();
    },

    jump() {
      if (gameActive && engine.state === 'playing') {
        engine.jump();
      }
    },

    duck() {
      if (gameActive && engine.state === 'playing') {
        engine.player.isDucking = true;
      }
    },

    endDuck() {
      engine.player.isDucking = false;
    },

    reset() {
      gameActive = false;
      runner.stop();
      engine.reset();
      engine.render();
    },

    pause() {
      runner.pause();
    },

    resume() {
      runner.resume();
    },

    getState() {
      return engine.getState();
    },

    // Store reference to game state for UI updates
    _engine: engine,
    _runner: runner,
  };

  // Game over callback
  const originalGameOver = engine.gameOver.bind(engine);
  engine.gameOver = function () {
    originalGameOver();
    gameActive = false;
    runner.stop();

    // Notify Astro UI
    const state = engine.getState();
    if (window.ThanksgivingCoasterUI && window.ThanksgivingCoasterUI.gameOver) {
      window.ThanksgivingCoasterUI.gameOver(state.distance, 0);
    }
  };

  // Handle input at page level
  window.addEventListener('keydown', (e) => {
    if (!gameActive) return;

    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      engine.jump();
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      engine.player.isDucking = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      engine.player.isDucking = false;
    }
  });

  // UI update loop (separate from render loop for efficiency)
  let lastUIUpdate = 0;
  const updateUI = () => {
    const now = performance.now();
    if (now - lastUIUpdate > 100 && gameActive) {
      const state = engine.getState();
      if (window.ThanksgivingCoasterUI) {
        window.ThanksgivingCoasterUI.updateDistance(state.distance);
        window.ThanksgivingCoasterUI.updateEarned(state.itemsCollected);
      }
      lastUIUpdate = now;
    }
    requestAnimationFrame(updateUI);
  };

  // Start UI update loop
  updateUI();

  // Initial render
  engine.render();

  console.log('[Thanksgiving Coaster] Game engine initialized');
})();

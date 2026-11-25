# Snoopy Coaster Web Game - Integration Guide

Complete UI and input handling system for the Snoopy Coaster web game with support for seasonal content, touch controls, and leaderboard integration.

## Files Overview

### Core Files
- **`snoopy-game-ui.js`** - Main UI system class (modular, engine-agnostic)
- **`snoopy-coaster-game.html`** - Complete HTML template with all controls
- **`SNOOPY_GAME_INTEGRATION.md`** - This integration guide

## Quick Start

### 1. Basic Setup

Include the UI system in your HTML:

```html
<script src="/snoopy-game-ui.js"></script>
<script src="/snoopy-coaster-game.html"></script>
```

### 2. Initialize the UI

```javascript
const gameUI = new SnoopyCoasterUI({
  canvasId: 'game-canvas',
  containerId: 'game-container',
});

// Link your game engine
gameUI.setGameEngine(gameEngine);
```

### 3. Game Loop Integration

The UI system is designed to be called from your game loop:

```javascript
function gameLoop() {
  const deltaTime = (Date.now() - lastFrameTime) / 1000;
  lastFrameTime = Date.now();
  
  // Update game state
  gameEngine.update(deltaTime);
  
  // Render UI (handles menu, HUD, game over screens)
  gameUI.render(deltaTime);
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

## API Reference

### State Management

```javascript
// Get current game state
const state = gameUI.getState();
// Returns: { state, score, multiplier, lives, level, bestScore, ... }

// Change game state
gameUI.startGame();      // Start playing
gameUI.togglePause();    // Pause/resume
gameUI.endGame(score);   // Show game over screen
gameUI.reset();          // Reset to menu
```

### Score & Game Mechanics

```javascript
// Update score (applies multiplier automatically)
gameUI.addScore(10);

// Set multiplier (for power-ups, combos, etc.)
gameUI.setMultiplier(1.5);

// Lives system
const hasLives = gameUI.loseLife();  // Returns true if lives > 0
gameUI.levelUp();  // Increase level
```

### Audio

```javascript
// Play sound effects
gameUI.playAudio('jump');
gameUI.playAudio('collect');
gameUI.playAudio('powerup');
gameUI.playAudio('hit');
gameUI.playAudio('levelUp');

// Control audio
gameUI.toggleSound();
gameUI.setVolume(0.5);  // 0-1 range
```

### Engine Callbacks

Your game engine should implement these callback methods:

```javascript
class YourGameEngine {
  // Called when jump button is pressed
  onJump(isDown) {
    if (isDown) {
      this.startJump();
    } else {
      this.releaseJump();
    }
  }

  // Called when move left is pressed
  onMoveLeft(isActive) {
    // true = start moving, false = stop moving
  }

  // Called when move right is pressed
  onMoveRight(isActive) {
    // true = start moving, false = stop moving
  }

  // Game lifecycle
  startGame() {
    // Reset and prepare game state
  }

  pause() {
    // Pause physics/logic
  }

  resume() {
    // Resume game
  }

  update(deltaTime) {
    // Update physics and game logic
  }

  render(canvas, deltaTime) {
    // Render game world (optional, can use canvas directly)
  }
}
```

## Features

### Seasonal Content

Automatically detects seasonal content:
- **Thanksgiving Theme** - Unlocked from November 8th onwards
  - Orange/brown color scheme
  - Pumpkin emojis
  - Thanksgiving-themed buttons and text

```javascript
if (gameUI.isSeasonUnlocked) {
  // Load seasonal assets
}

if (gameUI.currentTheme === 'thanksgiving') {
  // Use theme-specific rendering
}
```

### Touch Controls

Automatically detects mobile and provides:
- **Jump** - Bottom center of screen (or SPACE key)
- **Move Left** - Left third of screen (or A/left arrow)
- **Move Right** - Right third of screen (or D/right arrow)
- **UI Buttons** - Large, thumb-friendly buttons on mobile

### Input Handling

Supports multiple input methods simultaneously:

```javascript
// All these work at the same time:
// - Keyboard: SPACE, Arrow Keys, A/D
// - Touch: Three-zone control
// - Buttons: On-screen control buttons
// - Gamepad: (Can be added to engine callbacks)
```

### HUD Display

Three rendering modes:

1. **Menu Screen** - Start screen with instructions
2. **Gameplay HUD** - Score, multiplier, lives, level
3. **Game Over Screen** - Final score, best score, new record indicator

```javascript
// Update HUD during gameplay
gameUI.addScore(10);
gameUI.setMultiplier(2.0);
gameUI.loseLife();
```

### Pause & Settings

Built-in pause menu with:
- Resume option
- Settings panel
- Main menu return

```javascript
gameUI.togglePause();      // Toggle pause
gameUI.toggleSettings();   // Show settings
gameUI.showSettings;       // Check if open (boolean)
gameUI.showPauseMenu;      // Check if open (boolean)
```

### Leaderboard Integration

Export stats for cloud sync:

```javascript
const stats = gameUI.exportStats();
// Returns: { score, level, multiplier, bestScore, theme, timestamp, ... }

// Firebase integration example:
firebase.firestore()
  .collection('snoopy_leaderboard')
  .doc(userId)
  .update({
    displayName: userName,
    bestScore: stats.bestScore,
    updatedAt: new Date(),
  });
```

### Local Storage

Automatically persists:
- Best score (`snoopy_coaster_best_v1`)
- Sound enabled status (`snoopy_sound_enabled`)
- Volume level (`snoopy_volume_v1`)
- Save data (`snoopy_coaster_save_v1`)

```javascript
// Manually save state
gameUI.saveState({ customData: true });

// Load saved state
const savedState = gameUI.loadState();
```

## Canvas Rendering

### Render Loop Pattern

```javascript
function gameLoop() {
  // Let game UI handle all rendering
  gameUI.render(deltaTime);
  
  requestAnimationFrame(gameLoop);
}
```

The UI system handles:
- Menu screen rendering
- HUD overlay during gameplay
- Pause screen
- Game over screen
- Settings panel

Your game engine renders the actual gameplay to the canvas, and the UI overlays on top.

### Getting Canvas Reference

```javascript
const canvasDimensions = gameUI.getCanvasDimensions();
// Returns: { width, height, dpr }

// Draw game world to canvas
const canvas = gameUI.canvas;
const ctx = gameUI.ctx;
ctx.fillStyle = '#00ff00';
ctx.fillRect(0, 0, 100, 100);
```

## Mobile Optimization

The system automatically:
- Detects device type
- Scales canvas to device pixel ratio
- Provides large touch targets (44px minimum)
- Handles safe area insets (notches)
- Prevents text selection during gameplay
- Disables double-tap zoom
- Supports landscape and portrait

```javascript
if (gameUI.isMobile) {
  // Adjust game difficulty or controls for mobile
}

const { width, height } = gameUI.getCanvasDimensions();
```

## Sound Effects

Audio files needed:

```
/audio/snoopy/
├── jump.mp3          - Jump sound
├── collect.mp3       - Item collection
├── powerup.mp3       - Power-up activation
├── hit.mp3           - Hit/damage sound
├── levelup.mp3       - Level up sting
├── menu-theme.mp3    - Menu background music
└── game-theme.mp3    - In-game background music
```

Configure volume levels:

```javascript
// All audio is tied to the volume slider and mute toggle
gameUI.setVolume(0.3);      // 30% volume
gameUI.toggleSound();        // Mute/unmute
```

## Example Integration

### Simple Game Engine

```javascript
class SnoopyGameEngine {
  constructor() {
    this.playerX = 0;
    this.playerY = 0;
    this.velocity = { x: 0, y: 0 };
    this.isJumping = false;
    this.gameState = 'idle';
  }

  startGame() {
    this.gameState = 'playing';
    this.playerX = 100;
    this.playerY = 0;
    this.velocity = { x: 0, y: 0 };
  }

  pause() {
    this.gameState = 'paused';
  }

  resume() {
    this.gameState = 'playing';
  }

  onJump(isDown) {
    if (isDown && !this.isJumping) {
      this.velocity.y = -500;
      this.isJumping = true;
    } else if (!isDown) {
      // Could implement variable jump height
    }
  }

  onMoveLeft(isActive) {
    this.velocity.x = isActive ? -200 : 0;
  }

  onMoveRight(isActive) {
    this.velocity.x = isActive ? 200 : 0;
  }

  update(dt) {
    if (this.gameState !== 'playing') return;

    // Apply gravity
    this.velocity.y += 800 * dt;
    
    // Update position
    this.playerX += this.velocity.x * dt;
    this.playerY += this.velocity.y * dt;

    // Ground collision
    if (this.playerY > 300) {
      this.playerY = 300;
      this.velocity.y = 0;
      this.isJumping = false;
    }

    // Boundary checks
    this.playerX = Math.max(0, Math.min(this.playerX, 800));
  }
}

// Initialize
const engine = new SnoopyGameEngine();
const gameUI = new SnoopyCoasterUI();
gameUI.setGameEngine(engine);

// Main loop
function gameLoop() {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  engine.update(dt);
  gameUI.render(dt);

  requestAnimationFrame(gameLoop);
}

let lastTime = Date.now();
gameLoop();
```

## Debugging

### Console Access

```javascript
// UI system is exposed on window for debugging
window.gameUI.getState();
window.gameUI.score;
window.gameUI.state;
window.gameUI.lives;
```

### Common Issues

**Audio not playing:**
- Check browser autoplay policy (requires user interaction first)
- Verify audio file paths exist
- Check browser console for CORS errors

**Touch controls not responding:**
- Ensure `touch-action: none` on canvas
- Check that mobile detection works
- Verify touch event handlers are bound

**Rendering issues:**
- Ensure `devicePixelRatio` is handled
- Check canvas context exists
- Verify canvas is properly sized

**Seasonal content not showing:**
- Confirm system date is Nov 8 or later
- Check `gameUI.isSeasonUnlocked` boolean
- Verify theme-specific assets exist

## Performance Tips

1. **Use canvas directly** - Don't create DOM nodes during gameplay
2. **Cache selectors** - Store element references
3. **Minimize audio instances** - Use audio pool for repeated sounds
4. **Batch updates** - Update game state once per frame
5. **Debounce resize** - Current implementation uses ResizeObserver

## Version History

- **1.0.0** - Initial release
  - Complete UI system
  - Touch and keyboard controls
  - Seasonal content support
  - Leaderboard integration
  - Mobile optimization

## Next Steps

1. Create your game engine implementing the callback methods
2. Load this HTML template in an Astro page or standalone
3. Link your game engine with `gameUI.setGameEngine(engine)`
4. Implement audio files at `/audio/snoopy/` paths
5. Add cloud sync for leaderboards (optional)
6. Test on mobile devices

## Support

For integration help:
- Check the example engine above
- Review browser console for errors
- Verify all audio files are in place
- Test on actual mobile devices
- Use browser DevTools to debug canvas rendering

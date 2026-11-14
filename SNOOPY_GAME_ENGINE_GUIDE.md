# Snoopy Coaster Game Engine - Developer Guide

## Overview

The Snoopy Game Engine is a modular, canvas-based 2D game engine built for the Snoopy Thanksgiving Coaster web port. It provides a complete foundation for physics-based platformer gameplay with collision detection, entity management, and responsive rendering.

**File Location:** `/Users/solriver/iantopia/snoopy-game-engine.js`

## Architecture

### Core Classes

#### 1. `SnoopyGameEngine`
Main game engine class handling all logic, physics, rendering, and state management.

```javascript
import { SnoopyGameEngine, GameRunner } from '/snoopy-game-engine.js';

const engine = new SnoopyGameEngine(canvas, {
  gravity: 800,           // Downward acceleration (px/s²)
  jumpVelocity: 550,      // Initial upward velocity on jump (px/s)
  maxSpeed: 400,          // Maximum horizontal movement speed (px/s)
  initialSpeed: 150,      // Starting speed (px/s)
  acceleration: 60,       // Speed increase per second (px/s²)
});
```

#### 2. `GameRunner`
Manages the game loop using `requestAnimationFrame` with delta time calculation.

```javascript
const runner = new GameRunner(engine);
runner.start();    // Begin game loop
runner.pause();    // Pause without stopping
runner.resume();   // Resume from pause
runner.stop();     // Stop completely
```

## Key Components

### Physics System

- **Gravity:** Constant downward acceleration affecting non-grounded entities
- **Jump Velocity:** Initial upward momentum when player jumps
- **Ground Collision:** Automatic grounding detection and snap-to-ground
- **Entity Movement:** Velocity-based movement with delta time scaling

### Entity System

#### Player
- Position (x, y)
- Velocity (vx, vy)
- State flags: `isGrounded`, `isDucking`, `isInvincible`
- Collision box with size scaling

#### Obstacles
- Auto-spawned at intervals
- Multiple types: spike, tree, rock
- Scrolls based on world speed
- Automatic cleanup when off-screen

#### Collectibles
- Stars (1 point), gems (5 points), gifts (10 points)
- Bobbing animation
- Pickup collision detection
- Particle effects on collection

#### Particles
- Dust effects (movement, jumping)
- Collection sparkles
- Physics-based movement with air resistance
- Auto-cleanup

### Input Handling

**Keyboard:**
- Space/↑/W: Jump
- ↓/S: Duck

**Touch/Pointer:**
- Top half of canvas: Jump
- Bottom half: Duck
- Automatically scales to any device

## Game States

```
idle      → Game waiting for start
          → User clicks/taps to begin
          ↓
playing   → Active gameplay
          → Physics and collisions active
          ↓
gameOver  → Collision or game condition triggered
          → Score/distance displayed
          → User can restart
```

## Customization

### Physics Constants

Edit these in the `SnoopyGameEngine` constructor:

```javascript
const engine = new SnoopyGameEngine(canvas, {
  gravity: 800,        // Increase for faster falling
  jumpVelocity: 550,   // Increase for higher jumps
  maxSpeed: 400,       // Terminal velocity cap
  initialSpeed: 150,   // Starting world speed
  acceleration: 60,    // How fast game gets harder
});
```

### Entity Customization

#### Add New Obstacle Type
```javascript
// In spawnObstacle()
const obstacleTypes = ['spike', 'tree', 'rock', 'gift'];

// In drawObstacles()
if (obs.type === 'gift') {
  // Custom drawing logic
}
```

#### Change Collectible Values
```javascript
spawnCollectible(x, y) {
  const collectible = {
    value: type === 'gift' ? 20 : (type === 'gem' ? 10 : 2),
    // ... other properties
  };
}
```

### Rendering

#### Change Background
```javascript
drawBackground() {
  const gradient = this.ctx.createLinearGradient(0, 0, 0, this.worldHeight);
  gradient.addColorStop(0, '#your-color-1');
  gradient.addColorStop(1, '#your-color-2');
  this.ctx.fillStyle = gradient;
  this.ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
}
```

#### Customize Player
Replace `drawPlayer()` with image-based rendering:
```javascript
drawPlayer() {
  if (this.player.image) {
    this.ctx.drawImage(
      this.player.image,
      this.player.x,
      this.player.y,
      this.player.width,
      this.player.height
    );
  }
}
```

## Integration with Astro

### Quick Start

1. **Import the engine:**
```javascript
import { SnoopyGameEngine, GameRunner } from '/snoopy-game-engine.js';
```

2. **Initialize:**
```javascript
const engine = new SnoopyGameEngine(canvas);
const runner = new GameRunner(engine);
```

3. **Manage lifecycle:**
```javascript
document.getElementById('start-btn').addEventListener('click', () => {
  engine.start();
  runner.start();
});
```

4. **Handle game over:**
```javascript
engine.setGameOverCallback((state) => {
  console.log('Final Score:', state.score);
  console.log('Distance:', state.distance);
  console.log('Items Collected:', state.itemsCollected);
});
```

### Adapter Pattern

Use the `snoopy-thanksgiving-adapter.js` as a reference for bridging the engine with your Astro UI:

```javascript
window.ThanksgivingCoaster = {
  start() { engine.start(); runner.start(); },
  jump() { engine.jump(); },
  reset() { engine.reset(); runner.stop(); },
  getState() { return engine.getState(); },
};
```

## API Reference

### SnoopyGameEngine Methods

#### Game Control
- `start()` - Begin a new game
- `reset()` - Reset to idle state
- `update(deltaTime)` - Update game logic (called by GameRunner)
- `render()` - Draw current frame (separate from update)
- `jump()` - Player jump action
- `gameOver()` - End the game
- `restart()` - Restart immediately

#### State & Info
- `getState()` - Returns `{score, distance, itemsCollected, gameState, speed, elapsedTime}`
- Properties: `state`, `score`, `distance`, `itemsCollected`, `speed`

#### Callbacks
- `setGameOverCallback(fn)` - Set callback when game ends

#### Rendering
- `clearScreen()` - Fill background
- `drawBackground()` - Draw gradient/texture
- `drawGround()` - Draw grass/ground
- `drawPlayer()` - Draw player sprite
- `drawObstacles()` - Draw all obstacles
- `drawCollectibles()` - Draw stars, gems, gifts
- `drawParticles()` - Draw particle effects
- `drawHUD()` - Draw score/distance display

### GameRunner Methods

- `start()` - Begin animation loop
- `stop()` - Stop animation loop
- `pause()` - Pause without cleanup
- `resume()` - Resume from pause

## Performance Optimization

### Delta Time Scaling
The engine uses delta time to ensure frame-rate-independent movement:
```javascript
// Physics automatically scale to time passed
entity.y += entity.vy * deltaTime;
```

### Automatic Entity Cleanup
Off-screen entities are automatically removed from arrays to reduce memory usage.

### Responsive Canvas
- High-DPI display support (device pixel ratio)
- Automatic scaling based on container size
- Scales game world, not just the canvas

## Asset Integration

### Loading Images

```javascript
const snoopyImg = new Image();
snoopyImg.src = '/path/to/snoopy.png';

// Then in rendering:
if (snoopyImg.complete) {
  ctx.drawImage(snoopyImg, x, y, width, height);
}
```

### Sprite Animation

```javascript
// In update loop:
obstacle.frameIndex = (obstacle.frameIndex || 0) + deltaTime * frameRate;

// In render loop:
const frame = Math.floor(obstacle.frameIndex);
// Use frame to select portion of sprite sheet
```

## Common Patterns

### Add Power-up
```javascript
// In updateCollectibles():
if (item.type === 'powerup') {
  this.player.isInvincible = true;
  this.player.invincibilityTimer = 5; // 5 seconds
}
```

### Difficulty Progression
```javascript
// Speed increases over time
const difficultyMultiplier = 1 + (this.elapsedTime / 60);
```

### Score Multiplier
```javascript
const finalScore = baseScore * (1 + Math.floor(this.speed / 100) * 0.1);
```

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- iOS 12+ (with touch handling)
- Android 6+ (with pointer events)
- Requires HTML5 Canvas support
- Uses `requestAnimationFrame` (polyfill if needed for old browsers)

## Troubleshooting

### Game not starting
- Check canvas element exists: `console.log(document.getElementById('game-canvas'))`
- Verify engine initialized: `console.log(engine.state)`

### Physics feel wrong
- Adjust `gravity`, `jumpVelocity` constants
- Check `deltaTime` is being calculated: `console.log(engine.deltaTime)`

### Performance issues
- Monitor particle count: `console.log(engine.particles.length)`
- Check if too many obstacles spawning: `console.log(engine.obstacles.length)`
- Reduce spawn interval if needed: `this.SPAWN_INTERVAL = 3.0`

### Touch input not working
- Verify `canvas.addEventListener('pointerdown', ...)` is set up
- Check browser supports Pointer Events API

## Future Enhancements

Potential additions for extending the engine:

- [ ] Sound effects integration
- [ ] Music/background audio
- [ ] Pause menu overlay
- [ ] Multiple difficulty levels
- [ ] Leaderboard integration
- [ ] Combo system
- [ ] Boss entities
- [ ] Multiple lives/health system
- [ ] Tilt/accelerometer controls
- [ ] Screen shake effects
- [ ] Slow-motion/time effects

## License & Attribution

Part of the Iantopia project. Built with modular ES6 architecture for easy extension.

---

**Created:** November 2026
**Status:** Ready for production use

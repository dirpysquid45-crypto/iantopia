/**
 * Battleship sprite definitions and rendering system.
 * Maps ship types to sprite coordinates on BattleShipSheet_final.png
 * Supports both horizontal and vertical orientations.
 */

const SHIP_SPRITES = {
  // Format: { name, size, spriteX, spriteY, width, height, horizontalX, horizontalY, horizontalW, horizontalH }
  Carrier: {
    name: 'Carrier',
    size: 5,
    vertical: { x: 0, y: 0, w: 60, h: 200 },
    horizontal: { x: 250, y: 0, w: 200, h: 60 }
  },
  Battleship: {
    name: 'Battleship',
    size: 4,
    vertical: { x: 70, y: 0, w: 60, h: 160 },
    horizontal: { x: 250, y: 70, w: 160, h: 60 }
  },
  Cruiser: {
    name: 'Cruiser',
    size: 3,
    vertical: { x: 140, y: 0, w: 60, h: 120 },
    horizontal: { x: 250, y: 140, w: 120, h: 60 }
  },
  Submarine: {
    name: 'Submarine',
    size: 3,
    vertical: { x: 210, y: 0, w: 60, h: 120 },
    horizontal: { x: 250, y: 210, w: 120, h: 60 }
  },
  Destroyer: {
    name: 'Destroyer',
    size: 2,
    vertical: { x: 280, y: 0, w: 60, h: 80 },
    horizontal: { x: 250, y: 280, w: 80, h: 60 }
  }
};

function getShipSpriteStyle(shipName, horizontal) {
  const ship = SHIP_SPRITES[shipName];
  if (!ship) return null;

  const sprite = horizontal ? ship.horizontal : ship.vertical;
  const scale = 1; // Adjust if needed for grid sizing

  return {
    backgroundImage: 'url(/Naval%20Battle%20Assets/BattleShipSheet_final.png)',
    backgroundSize: '1200px 600px', // Full sprite sheet size
    backgroundPosition: `${sprite.x}px ${sprite.y}px`,
    backgroundRepeat: 'no-repeat',
    width: `${sprite.w * scale}px`,
    height: `${sprite.h * scale}px`,
    objectFit: 'cover'
  };
}

function applyShipSprite(element, shipName, horizontal) {
  const style = getShipSpriteStyle(shipName, horizontal);
  if (!style) return;

  Object.assign(element.style, style);
  element.classList.add('ship-sprite');
}

window.SHIP_SPRITES = SHIP_SPRITES;
window.getShipSpriteStyle = getShipSpriteStyle;
window.applyShipSprite = applyShipSprite;

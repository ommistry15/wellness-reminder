// Generates the pixel-art droplet icons used by the app: a small transparent
// tray icon, and a larger app icon (with a card backdrop) for the installer/exe.
// Pure JS (pngjs) so no native image tooling is required.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ORANGE = [218, 119, 86, 255]; // Claude accent
const DARK = [45, 43, 38, 255];
const CREAM = [250, 248, 243, 255];

function isDroplet(x, y) {
  // Triangle point (top) from y=2..8
  if (y >= 2 && y < 8) {
    const half = (y - 2) * 0.55 + 1; // widens as it goes down
    const cx = 8;
    return Math.abs(x - cx + 0.5) <= half;
  }
  // Round base (bottom) centered at (8,10) radius 5.5
  if (y >= 6 && y < 15) {
    const dx = x - 7.5;
    const dy = y - 9.5;
    return Math.sqrt(dx * dx + dy * dy) <= 5.4;
  }
  return false;
}

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = color[0];
  png.data[idx + 1] = color[1];
  png.data[idx + 2] = color[2];
  png.data[idx + 3] = color[3];
}

// Plain transparent droplet, scaled up by integer factor (crisp pixel edges).
function renderTrayIcon(scale) {
  const size = 16 * scale;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      if (isDroplet(sx, sy)) {
        const isEdge =
          !isDroplet(sx - 1, sy) || !isDroplet(sx + 1, sy) || !isDroplet(sx, sy - 1) || !isDroplet(sx, sy + 1);
        setPixel(png, x, y, isEdge ? DARK : ORANGE);
      } else {
        setPixel(png, x, y, [0, 0, 0, 0]);
      }
    }
  }
  return png;
}

// Droplet on a rounded cream card backdrop, for use as the app/installer icon.
function renderAppIcon(size) {
  const png = new PNG({ width: size, height: size });
  const border = Math.round(size * 0.035);
  const radius = Math.round(size * 0.22);
  const margin = Math.round(size * 0.04);

  function inRoundedSquare(x, y) {
    const left = margin, top = margin, right = size - margin, bottom = size - margin;
    if (x < left || x >= right || y < top || y >= bottom) return false;
    const cx = Math.min(Math.max(x, left + radius), right - radius);
    const cy = Math.min(Math.max(y, top + radius), bottom - radius);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  }

  const dropScale = size / 16 * 0.62;
  const dropSize = 16 * dropScale;
  const dropOffset = (size - dropSize) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRoundedSquare(x, y)) {
        setPixel(png, x, y, [0, 0, 0, 0]);
        continue;
      }
      const isBorder = !inRoundedSquare(x - border, y) || !inRoundedSquare(x + border, y) ||
        !inRoundedSquare(x, y - border) || !inRoundedSquare(x, y + border);
      if (isBorder) {
        setPixel(png, x, y, DARK);
        continue;
      }

      const dx = x - dropOffset, dy = y - dropOffset;
      if (dx >= 0 && dy >= 0 && dx < dropSize && dy < dropSize) {
        const sx = Math.floor(dx / dropScale);
        const sy = Math.floor(dy / dropScale);
        if (isDroplet(sx, sy)) {
          const isEdge =
            !isDroplet(sx - 1, sy) || !isDroplet(sx + 1, sy) || !isDroplet(sx, sy - 1) || !isDroplet(sx, sy + 1);
          setPixel(png, x, y, isEdge ? DARK : ORANGE);
          continue;
        }
      }
      setPixel(png, x, y, CREAM);
    }
  }
  return png;
}

function write(png, outPath) {
  return new Promise((resolve, reject) => {
    png
      .pack()
      .pipe(fs.createWriteStream(outPath))
      .on('finish', () => {
        console.log('Wrote', outPath);
        resolve();
      })
      .on('error', reject);
  });
}

(async () => {
  await write(renderTrayIcon(2), path.join(__dirname, '..', 'assets', 'tray-icon.png'));
  await write(renderAppIcon(256), path.join(__dirname, '..', 'build', 'icon.png'));
})();

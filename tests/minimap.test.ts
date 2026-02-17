import { describe, expect, it } from 'vitest';
import { collectMinimapColors } from '../src/render/minimap';
import { TILE_PALETTE_CSS } from '../src/render/palette';

describe('minimap rendering colors', () => {
  it('uses only base biome palette colors without per-tile shading', () => {
    const colors = collectMinimapColors(
      'default',
      { q: 0, r: 0 },
      {
        size: 192,
        sampleStep: 2,
        worldUnitsPerPixel: 14 * 0.65,
      },
    );

    const allowed = new Set(Object.values(TILE_PALETTE_CSS));
    for (const color of colors) {
      expect(allowed.has(color), `unexpected minimap color ${color}`).toBe(true);
    }

    expect(colors.size).toBeLessThanOrEqual(allowed.size);
    expect(colors.size).toBeGreaterThanOrEqual(4);
  }, 15000);
});

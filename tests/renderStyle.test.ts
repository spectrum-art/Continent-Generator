import { describe, expect, it } from 'vitest';
import { colorForRenderedTile } from '../src/render/style';

function luminance(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('render style', () => {
  it('produces at least 3 luminance levels for same biome at different elevations', () => {
    const baseGrass = 0x63b359;
    const colors = [
      colorForRenderedTile('grass', baseGrass, 0.2, 0),
      colorForRenderedTile('grass', baseGrass, 0.5, 0),
      colorForRenderedTile('grass', baseGrass, 0.8, 0),
      colorForRenderedTile('grass', baseGrass, 0.95, 0),
    ];
    const levels = new Set(colors.map((c) => Math.round(luminance(c))));
    expect(levels.size).toBeGreaterThanOrEqual(3);
  });

  it('applies shoreline tint when adjacent to water', () => {
    const baseGrass = 0x63b359;
    const inland = colorForRenderedTile('grass', baseGrass, 0.5, 0);
    const shoreline = colorForRenderedTile('grass', baseGrass, 0.5, 2);
    expect(shoreline).not.toBe(inland);
  });
});

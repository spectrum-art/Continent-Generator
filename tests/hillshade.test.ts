import { describe, expect, it } from 'vitest';
import { computeLightAndSlope } from '../src/gen/continent';

function p95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

describe('hillshade generation', () => {
  it('is deterministic for identical elevation fields', () => {
    const width = 96;
    const height = 64;
    const field = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        field[y * width + x] = ((x / (width - 1)) * 0.7 + (y / (height - 1)) * 0.3);
      }
    }
    const a = computeLightAndSlope(width, height, field);
    const b = computeLightAndSlope(width, height, field);
    expect(Array.from(a.light)).toEqual(Array.from(b.light));
    expect(Array.from(a.slope)).toEqual(Array.from(b.slope));
  });

  it('avoids angular wedge artifacts on a smooth radial hill', () => {
    const width = 180;
    const height = 180;
    const cx = (width - 1) * 0.5;
    const cy = (height - 1) * 0.5;
    const maxR = Math.min(width, height) * 0.45;
    const field = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.hypot(dx, dy) / maxR;
        const value = Math.max(0, 1 - r);
        field[y * width + x] = value * value;
      }
    }

    const { light } = computeLightAndSlope(width, height, field);
    const ring = maxR * 0.52;
    const samples: number[] = [];
    for (let d = 0; d < 360; d += 1) {
      const angle = (d * Math.PI) / 180;
      const sx = Math.round(cx + Math.cos(angle) * ring);
      const sy = Math.round(cy + Math.sin(angle) * ring);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
        continue;
      }
      samples.push(light[sy * width + sx]);
    }

    const diffs: number[] = [];
    for (let i = 0; i < samples.length; i += 1) {
      const next = samples[(i + 1) % samples.length];
      diffs.push(Math.abs(next - samples[i]));
    }

    expect(p95(diffs)).toBeLessThan(0.085);
  });
});

import { describe, expect, it } from 'vitest';
import type { GeneratedContinent } from '../src/gen/continent';
import { computeLightAndSlope, defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import { computeWedgeMetrics } from '../src/gen/realismMetrics';

function fakeMap(width: number, height: number): GeneratedContinent {
  const total = width * height;
  return {
    controls: defaultControlsWithSeed('fake'),
    normalizedSeed: 'fake',
    width,
    height,
    fieldScale: 1,
    seaLevel: 0.5,
    elevation: new Float32Array(total),
    ridge: new Float32Array(total),
    slope: new Float32Array(total),
    temperature: new Float32Array(total),
    moisture: new Float32Array(total),
    light: new Float32Array(total),
    flow: new Float32Array(total),
    biome: new Uint8Array(total),
    land: new Uint8Array(total),
    ocean: new Uint8Array(total),
    lake: new Uint8Array(total),
    river: new Uint8Array(total),
    distanceToOcean: new Uint16Array(total),
    distanceToLand: new Uint16Array(total),
    landArea: 0,
    coastPerimeter: 0,
    identityHash: 'fake',
    controlsHash: 'fake',
  };
}

describe('ms18 hillshade wedge detector', () => {
  it('flags synthetic sector wedge lighting', () => {
    const width = 192;
    const height = 192;
    const map = fakeMap(width, height);
    const cx = (width - 1) * 0.5;
    const cy = (height - 1) * 0.5;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const angle = (Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2);
        const sector = Math.floor(angle * 10);
        map.light[index] = sector % 2 === 0 ? 0.15 : 0.9;
      }
    }
    const wedge = computeWedgeMetrics(map);
    expect(wedge.dominantShare).toBeGreaterThan(0.12);
    expect(wedge.tangentialConvergence).toBeGreaterThan(0.85);
    expect(wedge.p95GradientJump).toBeGreaterThan(0.2);
  });

  it('keeps generated hillshade under wedge thresholds', () => {
    const controls = defaultControlsWithSeed('ms18-hillshade');
    controls.size = 'region';
    controls.relief = 8;
    controls.landFraction = 6;
    const map = generateContinent(controls);
    const wedge = computeWedgeMetrics(map);
    expect(wedge.dominantShare).toBeLessThan(0.14);
    expect(wedge.tangentialConvergence).toBeLessThan(0.8);
    expect(wedge.p95GradientJump).toBeLessThan(0.1);
  }, 20_000);

  it('retains NW contrast under smooth radial elevation', () => {
    const width = 180;
    const height = 180;
    const field = new Float32Array(width * height);
    const cx = (width - 1) * 0.5;
    const cy = (height - 1) * 0.5;
    const maxR = Math.min(width, height) * 0.45;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.hypot(dx, dy) / maxR;
        field[y * width + x] = Math.max(0, 1 - r * r);
      }
    }
    const { light } = computeLightAndSlope(width, height, field);
    const nw = light[Math.round(height * 0.35) * width + Math.round(width * 0.35)];
    const se = light[Math.round(height * 0.65) * width + Math.round(width * 0.65)];
    expect(nw).toBeGreaterThan(se);
  });
});

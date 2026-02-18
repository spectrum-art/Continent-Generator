import { describe, expect, it } from 'vitest';
import type { GeneratedContinent } from '../src/gen/continent';
import { computeWedgeMetrics } from '../src/gen/realismMetrics';

function fakeMap(width: number, height: number): GeneratedContinent {
  const total = width * height;
  return {
    controls: {
      seed: 'fake',
      size: 'isle',
      aspectRatio: 'square',
      landFraction: 5,
      relief: 5,
      fragmentation: 5,
      coastalSmoothing: 5,
      latitudeCenter: 0,
      latitudeSpan: 60,
      plateCount: 0,
      mountainPeakiness: 5,
      climateBias: 0,
      islandDensity: 4,
      biomeMix: {
        rivers: 0.6,
        grassland: 1,
        temperateForest: 1,
        rainforest: 0.5,
        desert: 0.5,
        mountains: 0.7,
        tundra: 0.3,
      },
    },
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

describe('ms17 wedge detector', () => {
  it('flags synthetic sector-wedge lighting', () => {
    const width = 180;
    const height = 180;
    const map = fakeMap(width, height);
    const cx = (width - 1) * 0.5;
    const cy = (height - 1) * 0.5;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const angle = (Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2);
        const sector = Math.floor(angle * 8);
        map.light[index] = (sector % 2 === 0 ? 0.25 : 0.85);
      }
    }
    const m = computeWedgeMetrics(map);
    expect(m.dominantShare).toBeGreaterThan(0.25);
    expect(m.tangentialConvergence).toBeGreaterThan(0.9);
  });

  it('keeps smooth lighting under wedge thresholds', () => {
    const width = 180;
    const height = 180;
    const map = fakeMap(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        map.light[index] = x / (width - 1) * 0.8 + y / (height - 1) * 0.2;
      }
    }
    const m = computeWedgeMetrics(map);
    expect(m.dominantShare).toBeGreaterThan(0.9);
    expect(m.tangentialConvergence).toBeLessThan(0.8);
    expect(m.p95GradientJump).toBeLessThan(0.08);
  });
});

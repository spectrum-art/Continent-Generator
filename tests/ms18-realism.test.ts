import { describe, expect, it } from 'vitest';
import type { GeneratedContinent } from '../src/gen/continent';
import { computeLightAndSlope, defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import { computeRectangleMetrics, evaluateDemRealism } from '../src/gen/realismMetrics';

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

describe('ms18 realism gates', () => {
  it('is deterministic for identical controls and seeds', () => {
    const controls = defaultControlsWithSeed('ms18determinism');
    controls.size = 'region';
    controls.relief = 8;
    controls.fragmentation = 7;
    controls.landFraction = 6;
    const a = evaluateDemRealism(generateContinent(controls));
    const b = evaluateDemRealism(generateContinent(controls));
    expect(a).toEqual(b);
  }, 25_000);

  it('passes all DEM realism gates for default region cases', () => {
    const seeds = ['default', 'GreenChair', 'SilentHarbor'];
    for (const seed of seeds) {
      const controls = defaultControlsWithSeed(seed);
      controls.size = 'region';
      controls.aspectRatio = 'landscape';
      controls.relief = 7;
      controls.landFraction = 6;
      const result = evaluateDemRealism(generateContinent(controls));
      expect(result.gates.pass, `${seed} failed: ${result.gates.reasons.join(',')}`).toBe(true);
    }
  }, 35_000);

  it('rejects rectangular silhouette masks via angular bias metric', () => {
    const width = 180;
    const height = 120;
    const map = fakeMap(width, height);
    for (let y = 10; y < height - 10; y += 1) {
      for (let x = 12; x < width - 12; x += 1) {
        const index = y * width + x;
        map.land[index] = 1;
        map.elevation[index] = 0.8;
        map.landArea += 1;
      }
    }
    for (let i = 0; i < map.ocean.length; i += 1) {
      map.ocean[i] = map.land[i] === 1 ? 0 : 1;
      if (map.land[i] === 0) {
        map.elevation[i] = 0.15;
      }
    }
    const { light, slope } = computeLightAndSlope(width, height, map.elevation);
    map.light = light;
    map.slope = slope;

    const rect = computeRectangleMetrics(map);
    expect(rect.bboxFillRatio).toBeGreaterThan(0.85);
    expect(rect.axisAlignedNormalScore).toBeGreaterThan(0.72);
  });

  it('rejects seam-discontinuous synthetic fields', () => {
    const width = 192;
    const height = 192;
    const map = fakeMap(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        map.land[index] = 1;
        map.ocean[index] = 0;
        map.elevation[index] = x < width / 2 ? 0.25 : 0.8;
      }
    }
    for (let x = 0; x < width; x += 1) {
      map.land[x] = 0;
      map.land[(height - 1) * width + x] = 0;
    }
    for (let y = 0; y < height; y += 1) {
      map.land[y * width] = 0;
      map.land[y * width + width - 1] = 0;
    }
    const { light, slope } = computeLightAndSlope(width, height, map.elevation);
    map.light = light;
    map.slope = slope;

    const result = evaluateDemRealism(map);
    expect(result.metrics.seamDiscontinuity).toBeGreaterThan(0.2);
  });
});

import { describe, expect, it } from 'vitest';
import type { GeneratedContinent } from '../src/gen/continent';
import { defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import {
  computeRectangleMetrics,
  computeRiverHierarchyMetrics,
  evaluateRealismMetrics,
} from '../src/gen/realismMetrics';

function fakeMap(width: number, height: number): GeneratedContinent {
  const total = width * height;
  return {
    controls: {
      seed: 'fake',
      size: 'region',
      aspectRatio: 'square',
      landFraction: 8,
      relief: 6,
      fragmentation: 4,
      coastalSmoothing: 6,
      latitudeCenter: 20,
      latitudeSpan: 50,
      plateCount: 0,
      mountainPeakiness: 6,
      climateBias: 0,
      islandDensity: 4,
      biomeMix: {
        rivers: 0.75,
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

describe('ms17 realism gates', () => {
  it('provides deterministic gate evaluation for generated maps', () => {
    const controls = defaultControlsWithSeed('ms17deterministic');
    controls.size = 'region';
    controls.biomeMix.rivers = 0.75;
    const a = evaluateRealismMetrics(generateContinent(controls));
    const b = evaluateRealismMetrics(generateContinent(controls));
    expect(a).toEqual(b);
  }, 20_000);

  it('detects overly rectangular synthetic coastline masks', () => {
    const width = 160;
    const height = 120;
    const map = fakeMap(width, height);
    for (let y = 12; y < height - 12; y += 1) {
      for (let x = 12; x < width - 12; x += 1) {
        const index = y * width + x;
        map.land[index] = 1;
        map.landArea += 1;
      }
    }
    const rect = computeRectangleMetrics(map);
    expect(rect.bboxFillRatio).toBeGreaterThan(0.9);
    expect(rect.axisAlignedNormalScore).toBeGreaterThan(0.9);
  });

  it('keeps inland river hierarchy for region defaults', () => {
    const controls = defaultControlsWithSeed('default');
    controls.size = 'region';
    controls.landFraction = 6;
    controls.biomeMix.rivers = 0.75;
    const map = generateContinent(controls);
    const river = computeRiverHierarchyMetrics(map);
    expect(river.inlandRatio).toBeGreaterThan(0.45);
    expect(river.maxComponent).toBeGreaterThanOrEqual(Math.max(20, Math.floor(map.width * 0.02)));
  }, 25_000);
});

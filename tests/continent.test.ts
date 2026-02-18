import { describe, expect, it } from 'vitest';
import {
  defaultControlsWithSeed,
  exportContinentControls,
  generateContinent,
  importContinentControls,
} from '../src/gen/continent';

function testControls(seed: string): ReturnType<typeof defaultControlsWithSeed> {
  const controls = defaultControlsWithSeed(seed);
  controls.size = 'isle';
  return controls;
}

function oceanEdgeRatio(map: ReturnType<typeof generateContinent>): number {
  let edge = 0;
  let ocean = 0;
  for (let x = 0; x < map.width; x += 1) {
    const top = x;
    const bottom = (map.height - 1) * map.width + x;
    edge += 2;
    ocean += map.ocean[top] + map.ocean[bottom];
  }
  for (let y = 1; y < map.height - 1; y += 1) {
    const left = y * map.width;
    const right = y * map.width + map.width - 1;
    edge += 2;
    ocean += map.ocean[left] + map.ocean[right];
  }
  return ocean / Math.max(1, edge);
}

function landRatio(map: ReturnType<typeof generateContinent>): number {
  let land = 0;
  for (let i = 0; i < map.land.length; i += 1) {
    land += map.land[i];
  }
  return land / Math.max(1, map.land.length);
}

describe('continent generator artifact pivot', () => {
  it('is deterministic for same seed and controls', () => {
    const controls = testControls('GreenChair');
    const a = generateContinent(controls);
    const b = generateContinent(controls);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it('treats seed case-insensitively', () => {
    const lower = generateContinent(testControls('silentharbor'));
    const upper = generateContinent(testControls('SilentHarbor'));
    expect(lower.identityHash).toBe(upper.identityHash);
  });

  it('keeps all map edges ocean for bounded continent output', () => {
    const controls = testControls('RedComet');
    controls.size = 'subcontinent';
    controls.aspectRatio = 'wide';
    const map = generateContinent(controls);
    expect(oceanEdgeRatio(map)).toBe(1);
  });

  it('responds to Land Fraction control', () => {
    const low = testControls('LandProbe');
    low.landFraction = 2;
    const high = testControls('LandProbe');
    high.landFraction = 9;
    const lowMap = generateContinent(low);
    const highMap = generateContinent(high);
    expect(landRatio(highMap)).toBeGreaterThan(landRatio(lowMap));
  });

  it('changes coastline perimeter with Coastal Smoothing', () => {
    const rough = testControls('SmoothingProbe');
    rough.coastalSmoothing = 2;
    const smooth = testControls('SmoothingProbe');
    smooth.coastalSmoothing = 9;

    const roughMap = generateContinent(rough);
    const smoothMap = generateContinent(smooth);
    expect(smoothMap.coastPerimeter).toBeLessThanOrEqual(roughMap.coastPerimeter);
  });

  it('changes identity hash when Aspect Ratio changes', () => {
    const wide = testControls('AspectProbe');
    wide.aspectRatio = 'wide';
    const portrait = testControls('AspectProbe');
    portrait.aspectRatio = 'portrait';

    const wideMap = generateContinent(wide);
    const portraitMap = generateContinent(portrait);
    expect(wideMap.identityHash).not.toBe(portraitMap.identityHash);
  });

  it('supports compact export/import strings that round-trip map identity', () => {
    const controls = testControls('AmberDelta');
    controls.fragmentation = 7;
    controls.biomeMix.rivers = 0.9;
    const code = exportContinentControls(controls).code;
    const imported = importContinentControls(code);
    expect(imported).not.toBeNull();
    const originalMap = generateContinent(controls);
    const restoredMap = generateContinent(imported as typeof controls);
    expect(originalMap.identityHash).toBe(restoredMap.identityHash);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates distinct continents for five default seeds', () => {
    const seeds = ['GreenChair', 'SilentHarbor', 'RedComet', 'MistyCove', 'StoneField'];
    const hashes = new Set<string>();
    for (const seed of seeds) {
      hashes.add(generateContinent(testControls(seed)).identityHash);
    }
    expect(hashes.size).toBe(seeds.length);
  }, 20_000);
});

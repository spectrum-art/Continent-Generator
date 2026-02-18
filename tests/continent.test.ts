import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  defaultControlsWithSeed,
  exportContinentControls,
  generateContinent,
  importContinentControls,
  type PresetOption,
} from '../src/gen/continent';

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
    const controls = defaultControlsWithSeed('GreenChair');
    const a = generateContinent(controls);
    const b = generateContinent(controls);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it('treats seed case-insensitively', () => {
    const lower = generateContinent(defaultControlsWithSeed('silentharbor'));
    const upper = generateContinent(defaultControlsWithSeed('SilentHarbor'));
    expect(lower.identityHash).toBe(upper.identityHash);
  });

  it('keeps all map edges ocean for bounded continent output', () => {
    const controls = defaultControlsWithSeed('RedComet');
    controls.size = 'subcontinent';
    controls.aspectRatio = 'wide';
    const map = generateContinent(controls);
    expect(oceanEdgeRatio(map)).toBe(1);
  });

  it('responds to Land Fraction control', () => {
    const low = defaultControlsWithSeed('LandProbe');
    low.landFraction = 2;
    const high = defaultControlsWithSeed('LandProbe');
    high.landFraction = 9;
    const lowMap = generateContinent(low);
    const highMap = generateContinent(high);
    expect(landRatio(highMap)).toBeGreaterThan(landRatio(lowMap));
  });

  it('supports compact export/import strings that round-trip map identity', () => {
    const controls = defaultControlsWithSeed('AmberDelta');
    controls.preset = 'riverlands';
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
      hashes.add(generateContinent(defaultControlsWithSeed(seed)).identityHash);
    }
    expect(hashes.size).toBe(seeds.length);
  });

  it('builds all presets successfully with deterministic output', () => {
    const presets: PresetOption[] = [
      'earth-like',
      'archipelago',
      'mountain-kingdoms',
      'riverlands',
      'dune-world',
      'rain-world',
      'broken-coast',
    ];

    for (const preset of presets) {
      const base = defaultControlsWithSeed('PresetProbe');
      const controls = applyPreset(base, preset);
      const a = generateContinent(controls);
      const b = generateContinent(controls);
      expect(a.identityHash, `${preset} should be deterministic`).toBe(b.identityHash);
      expect(oceanEdgeRatio(a), `${preset} should keep ocean edges`).toBe(1);
    }
  });
});

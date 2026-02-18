import { describe, expect, it } from 'vitest';
import {
  defaultControlsWithSeed,
  exportContinentControls,
  generateContinent,
  importContinentControls,
  measureContinentFeatures,
  runPresetDistinctnessSuite,
} from '../src/gen/continent';

function baseControls(seed: string) {
  const controls = defaultControlsWithSeed(seed);
  controls.size = 'isle';
  return controls;
}

describe('milestone13 verification suites', () => {
  it('changes identity hash when aspect ratio changes', () => {
    const wide = baseControls('AspectProbe');
    wide.aspectRatio = 'landscape';
    const portrait = baseControls('AspectProbe');
    portrait.aspectRatio = 'portrait';

    const mapWide = generateContinent(wide);
    const mapPortrait = generateContinent(portrait);

    expect(mapWide.identityHash).not.toBe(mapPortrait.identityHash);
    expect(mapWide.width).not.toBe(mapPortrait.width);
    expect(mapWide.height).not.toBe(mapPortrait.height);
  });

  it('preserves map identity across export/import with aspect ratio in payload', () => {
    const controls = baseControls('RoundTripAspect');
    controls.aspectRatio = 'wide';
    controls.preset = 'broken-coast';
    controls.fragmentation = 8;

    const encoded = exportContinentControls(controls).code;
    const decoded = importContinentControls(encoded);

    expect(decoded).not.toBeNull();
    const original = generateContinent(controls);
    const restored = generateContinent(decoded as typeof controls);
    expect(original.identityHash).toBe(restored.identityHash);
  });

  it('applies coastal smoothing monotonically to coastline perimeter', () => {
    const rough = baseControls('SmoothingProbe');
    rough.preset = 'broken-coast';
    rough.coastalSmoothing = 2;

    const smooth = baseControls('SmoothingProbe');
    smooth.preset = 'broken-coast';
    smooth.coastalSmoothing = 9;

    const roughMap = generateContinent(rough);
    const smoothMap = generateContinent(smooth);
    const roughFeatures = measureContinentFeatures(roughMap);
    const smoothFeatures = measureContinentFeatures(smoothMap);

    expect(smoothMap.coastPerimeter).toBeLessThan(roughMap.coastPerimeter);
    expect(smoothFeatures.islandCount).toBeLessThanOrEqual(roughFeatures.islandCount);
  });

  it('keeps preset signatures distinct on multiple seeds', () => {
    const suite = runPresetDistinctnessSuite(['GreenChair', 'SilentHarbor', 'RedComet']);
    expect(suite.pass).toBe(true);
    for (const seedResult of suite.seedResults) {
      for (const pairResult of seedResult.pairResults) {
        expect(pairResult.pass, `${seedResult.seed} ${pairResult.pair}`).toBe(true);
      }
    }
  }, 30_000);
});

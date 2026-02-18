import { describe, expect, it } from 'vitest';
import { defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import { computeContinentDiagnostics } from '../src/gen/diagnostics';

describe('milestone 16 realism gates', () => {
  it('keeps rivers inland with hierarchical continuity', () => {
    const controls = defaultControlsWithSeed('default');
    controls.size = 'region';
    controls.biomeMix.rivers = 0.75;
    const map = generateContinent(controls);
    const d = computeContinentDiagnostics(map, 10);

    expect(d.riverPixels).toBeGreaterThan(120);
    expect(d.inlandRiverRatio).toBeGreaterThan(0.55);
    expect(d.riverComponents).toBeGreaterThanOrEqual(2);
    expect(d.maxRiverComponent).toBeGreaterThanOrEqual(20);
  }, 20_000);

  it('maintains ridge/valley energy for high-relief mountain fields', () => {
    const seeds = ['RidgeA', 'RidgeB', 'RidgeC'];
    let sumEnergy = 0;
    let sumCoverage = 0;

    for (const seed of seeds) {
      const controls = defaultControlsWithSeed(seed);
      controls.size = 'region';
      controls.relief = 8;
      controls.mountainPeakiness = 8;
      controls.landFraction = 6;
      const map = generateContinent(controls);
      const d = computeContinentDiagnostics(map, 10);
      sumEnergy += d.ridgeEnergy;
      sumCoverage += d.mountainCoverage;
    }

    const avgEnergy = sumEnergy / seeds.length;
    const avgCoverage = sumCoverage / seeds.length;
    expect(avgEnergy).toBeGreaterThan(0.01);
    expect(avgCoverage).toBeGreaterThan(0.04);
  }, 30_000);

  it('avoids rectangular continent silhouettes at high land fraction', () => {
    const seeds = ['RectA', 'RectB', 'RectC'];
    for (const seed of seeds) {
      const controls = defaultControlsWithSeed(seed);
      controls.size = 'region';
      controls.aspectRatio = 'square';
      controls.landFraction = 9;
      const map = generateContinent(controls);
      const d = computeContinentDiagnostics(map, 10);
      expect(d.landRatio).toBeGreaterThan(0.58);
      expect(d.bboxFillRatio).toBeLessThan(0.9);
      expect(map.coastPerimeter).toBeGreaterThan(2200);
    }
  }, 25_000);
});

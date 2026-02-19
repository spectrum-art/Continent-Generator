import { describe, expect, it } from 'vitest';
import { defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import { evaluateMs21Realism } from '../src/gen/ms21Metrics';

function regionControls(seed: string) {
  const controls = defaultControlsWithSeed(seed);
  controls.size = 'region';
  controls.aspectRatio = 'landscape';
  controls.landFraction = 6;
  controls.relief = 8;
  controls.fragmentation = 6;
  return controls;
}

describe('ms21 realism gates', () => {
  it('drains almost all land cells to ocean in drain-mostly mode', () => {
    const result = evaluateMs21Realism(generateContinent(regionControls('ms21-drainage')));
    expect(result.metrics.drain_to_ocean_fraction).toBeGreaterThanOrEqual(0.985);
    expect(result.metrics.sink_fraction).toBeLessThanOrEqual(0.015);
  }, 25_000);

  it('produces trunk rivers tied to top flow accumulation paths', () => {
    const result = evaluateMs21Realism(generateContinent(regionControls('ms21-trunks')));
    const reachCount = result.metrics.max_flow_acc_reach_ocean.filter(Boolean).length;
    const maxTrunk = Math.max(...result.metrics.trunk_river_lengths);
    expect(reachCount).toBeGreaterThanOrEqual(2);
    expect(maxTrunk).toBeGreaterThanOrEqual(30);
  }, 25_000);

  it('keeps above-sea dynamic range from collapsing', () => {
    const result = evaluateMs21Realism(generateContinent(regionControls('ms21-range')));
    expect(result.metrics.elevation_spread_above_sea).toBeGreaterThanOrEqual(0.08);
    expect(result.metrics.stddev_above_sea).toBeGreaterThanOrEqual(0.03);
  }, 25_000);

  it('retains ridge/valley separation via curvature balance', () => {
    const result = evaluateMs21Realism(generateContinent(regionControls('ms21-curvature')));
    expect(result.metrics.curvature_stats.concave_count).toBeGreaterThanOrEqual(120);
    expect(result.metrics.curvature_stats.convex_count).toBeGreaterThanOrEqual(120);
    expect(result.metrics.curvature_stats.ratio).toBeGreaterThanOrEqual(0.35);
    expect(result.metrics.curvature_stats.ratio).toBeLessThanOrEqual(2.8);
    expect(result.metrics.ridge_valley_relief_mean).toBeGreaterThanOrEqual(result.metrics.stddev_above_sea * 0.42);
    expect(result.gates.ridgeValleyContrastPass).toBe(true);
  }, 25_000);

  it('keeps hillshade edge discontinuity below seam threshold', () => {
    const result = evaluateMs21Realism(generateContinent(regionControls('ms21-shade')));
    expect(result.metrics.hillshade_edge_discontinuity_score).toBeLessThanOrEqual(2.2);
  }, 25_000);
});

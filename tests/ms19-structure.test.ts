import { describe, expect, it } from 'vitest';
import type { GeneratedContinent } from '../src/gen/continent';
import { defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import { evaluateDemRealism } from '../src/gen/realismMetrics';

function fakeDomeMap(width: number, height: number): GeneratedContinent {
  const total = width * height;
  const controls = defaultControlsWithSeed('fake');
  const elevation = new Float32Array(total);
  const ridge = new Float32Array(total);
  const slope = new Float32Array(total);
  const light = new Float32Array(total);
  const flow = new Float32Array(total);
  const biome = new Uint8Array(total);
  const land = new Uint8Array(total);
  const ocean = new Uint8Array(total);
  const lake = new Uint8Array(total);
  const river = new Uint8Array(total);
  const distanceToOcean = new Uint16Array(total);
  const distanceToLand = new Uint16Array(total);
  const temperature = new Float32Array(total);
  const moisture = new Float32Array(total);

  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const maxR = Math.min(width, height) * 0.45;
  let landArea = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const r = Math.hypot(x - cx, y - cy) / maxR;
      const h = Math.max(0, 1 - r * r);
      elevation[index] = h;
      const isLand = h > 0.25 ? 1 : 0;
      land[index] = isLand;
      ocean[index] = isLand ? 0 : 1;
      if (isLand) {
        landArea += 1;
      }
    }
  }

  return {
    controls,
    normalizedSeed: 'fake',
    width,
    height,
    fieldScale: 1,
    seaLevel: 0.25,
    elevation,
    ridge,
    slope,
    temperature,
    moisture,
    light,
    flow,
    biome,
    land,
    ocean,
    lake,
    river,
    distanceToOcean,
    distanceToLand,
    landArea,
    coastPerimeter: 0,
    identityHash: 'fake',
    controlsHash: 'fake',
  };
}

describe('ms19 structural realism gates', () => {
  it('keeps gate evaluation deterministic', () => {
    const controls = defaultControlsWithSeed('ms19deterministic');
    controls.size = 'region';
    controls.relief = 8;
    controls.landFraction = 6;
    const a = evaluateDemRealism(generateContinent(controls));
    const b = evaluateDemRealism(generateContinent(controls));
    expect(a).toEqual(b);
  }, 25_000);

  it('produces long crestline continuity and anisotropy on region-scale terrain', () => {
    const controls = defaultControlsWithSeed('ms19crest');
    controls.size = 'region';
    controls.aspectRatio = 'landscape';
    controls.relief = 8;
    controls.fragmentation = 5;
    controls.landFraction = 6;
    const metrics = evaluateDemRealism(generateContinent(controls));
    expect(metrics.metrics.crestlineContinuity).toBeGreaterThan(0.3);
    expect(metrics.metrics.ridgeAnisotropy).toBeGreaterThan(0.2);
  }, 25_000);

  it('keeps basin depth separation above minimum threshold', () => {
    const controls = defaultControlsWithSeed('ms19basin');
    controls.size = 'region';
    controls.aspectRatio = 'landscape';
    controls.relief = 8;
    controls.landFraction = 6;
    const metrics = evaluateDemRealism(generateContinent(controls));
    expect(metrics.metrics.basinDepthSeparation).toBeGreaterThan(0.16);
  }, 25_000);

  it('rejects smooth dome-like elevation fields', () => {
    const dome = fakeDomeMap(220, 220);
    const metrics = evaluateDemRealism(dome);
    expect(metrics.metrics.noBlobScore).toBeLessThan(0.3);
    expect(metrics.gates.noBlobPass).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { GeneratedContinent } from '../src/gen/continent';
import { defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import { evaluateDemRealism } from '../src/gen/realismMetrics';

function syntheticMapFromLand(
  width: number,
  height: number,
  land: Uint8Array,
  diagnostics?: GeneratedContinent['structuralDiagnostics'],
): GeneratedContinent {
  const controls = defaultControlsWithSeed('synthetic');
  const total = width * height;
  const ocean = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    ocean[i] = land[i] === 1 ? 0 : 1;
  }

  return {
    controls,
    normalizedSeed: 'synthetic',
    width,
    height,
    fieldScale: 1,
    seaLevel: 0,
    elevation: new Float32Array(total),
    ridge: new Float32Array(total),
    slope: new Float32Array(total),
    temperature: new Float32Array(total),
    moisture: new Float32Array(total),
    light: new Float32Array(total),
    flow: new Float32Array(total),
    biome: new Uint8Array(total),
    land,
    ocean,
    lake: new Uint8Array(total),
    river: new Uint8Array(total),
    distanceToOcean: new Uint16Array(total),
    distanceToLand: new Uint16Array(total),
    landArea: 0,
    coastPerimeter: 0,
    identityHash: 'synthetic',
    controlsHash: 'synthetic',
    structuralDiagnostics: diagnostics,
  };
}

describe('ms20 structural realism gates', () => {
  it('keeps gate evaluation deterministic', () => {
    const controls = defaultControlsWithSeed('ms20deterministic');
    controls.size = 'region';
    controls.relief = 8;
    controls.landFraction = 7;
    const a = evaluateDemRealism(generateContinent(controls));
    const b = evaluateDemRealism(generateContinent(controls));
    expect(a).toEqual(b);
  }, 25_000);

  it('rejects axis-aligned blocky coastlines', () => {
    const width = 160;
    const height = 112;
    const land = new Uint8Array(width * height);

    for (let y = 12; y < height - 12; y += 1) {
      for (let x = 18; x < width - 18; x += 1) {
        land[y * width + x] = 1;
      }
    }
    for (let y = 38; y < 78; y += 1) {
      for (let x = 56; x < 104; x += 1) {
        land[y * width + x] = 0;
      }
    }

    const map = syntheticMapFromLand(width, height, land, {
      ridgeWidthCv: 0.33,
      ridgeAmplitudeCv: 0.36,
      junctionSymmetryScore: 0.2,
      highDegreeNodes: 0,
      resolutionValid: true,
    });
    const result = evaluateDemRealism(map);

    expect(result.gates.coastlineOrthogonalityPass).toBe(false);
    expect(result.metrics.coastlineAxisAlignedRatio).toBeGreaterThan(0.8);
    expect(result.metrics.coastlineLongestAxisRunRatio).toBeGreaterThan(0.4);
  });

  it('rejects uniform tube-like ridge diagnostics', () => {
    const controls = defaultControlsWithSeed('ms20tube');
    controls.size = 'region';
    controls.aspectRatio = 'landscape';
    controls.relief = 7;
    controls.landFraction = 6;

    const map = generateContinent(controls);
    const forced: GeneratedContinent = {
      ...map,
      structuralDiagnostics: {
        ridgeWidthCv: 0.03,
        ridgeAmplitudeCv: 0.04,
        junctionSymmetryScore: 0.2,
        highDegreeNodes: 0,
        resolutionValid: true,
      },
    };

    const result = evaluateDemRealism(forced);
    expect(result.gates.ridgeTubeNessPass).toBe(false);
    expect(result.metrics.ridgeTubeNessScore).toBeLessThan(0.1);
  }, 25_000);

  it('rejects symmetric hub-style junctions', () => {
    const controls = defaultControlsWithSeed('ms20junction');
    controls.size = 'region';
    controls.aspectRatio = 'landscape';
    const map = generateContinent(controls);

    const forced: GeneratedContinent = {
      ...map,
      structuralDiagnostics: {
        ridgeWidthCv: 0.22,
        ridgeAmplitudeCv: 0.23,
        junctionSymmetryScore: 0.94,
        highDegreeNodes: 8,
        resolutionValid: true,
      },
    };

    const result = evaluateDemRealism(forced);
    expect(result.gates.junctionSymmetryPass).toBe(false);
    expect(result.metrics.highDegreeNodes).toBeGreaterThan(2);
  }, 25_000);

  it('passes the full ms20 gate set on generator output', () => {
    const controls = defaultControlsWithSeed('MistyCove');
    controls.size = 'region';
    controls.aspectRatio = 'landscape';
    controls.relief = 8;
    controls.fragmentation = 6;
    controls.landFraction = 6;
    const result = evaluateDemRealism(generateContinent(controls));

    expect(result.gates.pass).toBe(true);
    expect(result.metrics.coastlineAxisAlignedRatio).toBeLessThanOrEqual(0.76);
    expect(result.metrics.ridgeWidthCv).toBeGreaterThanOrEqual(0.12);
    expect(result.metrics.ridgeAmplitudeCv).toBeGreaterThanOrEqual(0.12);
    expect(result.metrics.junctionSymmetryScore).toBeLessThanOrEqual(0.72);
  }, 25_000);
});

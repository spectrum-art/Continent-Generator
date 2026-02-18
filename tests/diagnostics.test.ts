import { describe, expect, it } from 'vitest';
import { defaultControlsWithSeed, generateContinent } from '../src/gen/continent';
import { buildDiagnosticSnapshot, computeContinentDiagnostics } from '../src/gen/diagnostics';

describe('continent diagnostics harness', () => {
  it('produces deterministic diagnostics and snapshot fingerprints', () => {
    const controls = defaultControlsWithSeed('AtlasProbe');
    controls.size = 'isle';
    const a = generateContinent(controls);
    const b = generateContinent(controls);

    expect(computeContinentDiagnostics(a)).toEqual(computeContinentDiagnostics(b));
    expect(buildDiagnosticSnapshot(a)).toBe(buildDiagnosticSnapshot(b));
  });

  it('detects meaningful seed differences in fingerprints', () => {
    const a = defaultControlsWithSeed('AtlasProbeA');
    const b = defaultControlsWithSeed('AtlasProbeB');
    a.size = 'isle';
    b.size = 'isle';
    const mapA = generateContinent(a);
    const mapB = generateContinent(b);
    expect(buildDiagnosticSnapshot(mapA)).not.toBe(buildDiagnosticSnapshot(mapB));
  });
}, 20_000);

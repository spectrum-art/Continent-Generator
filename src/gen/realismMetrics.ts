import type { GeneratedContinent } from './continent';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

function coastlineMetrics(map: GeneratedContinent): {
  axisAlignedRatio: number;
  longestAxisRunRatio: number;
  samples: number;
} {
  const { width, height, land } = map;
  const boundary = new Uint8Array(width * height);

  const landAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return 0;
    }
    return land[y * width + x] === 1 ? 1 : 0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const center = landAt(x, y);
      const hasDiff =
        landAt(x + 1, y) !== center ||
        landAt(x - 1, y) !== center ||
        landAt(x, y + 1) !== center ||
        landAt(x, y - 1) !== center;
      boundary[index] = hasDiff ? 1 : 0;
    }
  }

  const axisTolerance = (15 * Math.PI) / 180;
  let axisAligned = 0;
  let samples = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (boundary[index] === 0) {
        continue;
      }
      const gx = landAt(x + 1, y) - landAt(x - 1, y);
      const gy = landAt(x, y + 1) - landAt(x, y - 1);
      const mag = Math.hypot(gx, gy);
      if (mag < 1e-6) {
        continue;
      }
      const theta = Math.abs(Math.atan2(gy, gx));
      const dist = Math.min(theta, Math.abs(theta - Math.PI * 0.5), Math.abs(theta - Math.PI));
      if (dist <= axisTolerance) {
        axisAligned += 1;
      }
      samples += 1;
    }
  }

  let longestRun = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x < width; x += 1) {
      if (boundary[y * width + x] === 1) {
        run += 1;
        longestRun = Math.max(longestRun, run);
      } else {
        run = 0;
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    let run = 0;
    for (let y = 0; y < height; y += 1) {
      if (boundary[y * width + x] === 1) {
        run += 1;
        longestRun = Math.max(longestRun, run);
      } else {
        run = 0;
      }
    }
  }

  return {
    axisAlignedRatio: samples > 0 ? axisAligned / samples : 1,
    longestAxisRunRatio: longestRun / Math.max(1, Math.max(width, height)),
    samples,
  };
}

export type DemRealismMetrics = {
  coastlineAxisAlignedRatio: number;
  coastlineLongestAxisRunRatio: number;
  coastlineSampleCount: number;
  ridgeWidthCv: number;
  ridgeAmplitudeCv: number;
  ridgeTubeNessScore: number;
  junctionSymmetryScore: number;
  highDegreeNodes: number;
  resolutionValid: number;
};

export type DemRealismGates = {
  coastlineOrthogonalityPass: boolean;
  ridgeTubeNessPass: boolean;
  junctionSymmetryPass: boolean;
  resolutionConsistencyPass: boolean;
  pass: boolean;
  reasons: string[];
};

export type DemRealismResult = {
  metrics: DemRealismMetrics;
  gates: DemRealismGates;
};

export function evaluateDemRealism(map: GeneratedContinent): DemRealismResult {
  const coast = coastlineMetrics(map);
  const diagnostics = map.structuralDiagnostics ?? {
    ridgeWidthCv: 0,
    ridgeAmplitudeCv: 0,
    junctionSymmetryScore: 1,
    highDegreeNodes: 999,
    resolutionValid: false,
  };

  const ridgeTubeNessScore = Math.min(diagnostics.ridgeWidthCv, diagnostics.ridgeAmplitudeCv);
  const metrics: DemRealismMetrics = {
    coastlineAxisAlignedRatio: coast.axisAlignedRatio,
    coastlineLongestAxisRunRatio: coast.longestAxisRunRatio,
    coastlineSampleCount: coast.samples,
    ridgeWidthCv: diagnostics.ridgeWidthCv,
    ridgeAmplitudeCv: diagnostics.ridgeAmplitudeCv,
    ridgeTubeNessScore,
    junctionSymmetryScore: diagnostics.junctionSymmetryScore,
    highDegreeNodes: diagnostics.highDegreeNodes,
    resolutionValid: diagnostics.resolutionValid ? 1 : 0,
  };

  const reasons: string[] = [];

  const coastlineOrthogonalityPass =
    metrics.coastlineSampleCount > 128 &&
    metrics.coastlineAxisAlignedRatio <= 0.76 &&
    metrics.coastlineLongestAxisRunRatio <= 0.34;
  if (!coastlineOrthogonalityPass) {
    reasons.push('coast-orthogonality');
  }

  const ridgeTubeNessPass = metrics.ridgeWidthCv >= 0.12 && metrics.ridgeAmplitudeCv >= 0.12;
  if (!ridgeTubeNessPass) {
    reasons.push('ridge-tube-ness');
  }

  const junctionSymmetryPass = metrics.highDegreeNodes <= 2 && metrics.junctionSymmetryScore <= 0.72;
  if (!junctionSymmetryPass) {
    reasons.push('junction-symmetry');
  }

  const resolutionConsistencyPass = diagnostics.resolutionValid;
  if (!resolutionConsistencyPass) {
    reasons.push('resolution-consistency');
  }

  return {
    metrics,
    gates: {
      coastlineOrthogonalityPass,
      ridgeTubeNessPass,
      junctionSymmetryPass,
      resolutionConsistencyPass,
      pass: coastlineOrthogonalityPass && ridgeTubeNessPass && junctionSymmetryPass && resolutionConsistencyPass,
      reasons,
    },
  };
}

export function evaluateRealismMetrics(map: GeneratedContinent): { metrics: DemRealismMetrics; gates: DemRealismGates } {
  return evaluateDemRealism(map);
}

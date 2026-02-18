import type { GeneratedContinent } from './continent';
import { computeContinentDiagnostics } from './diagnostics';

const NEIGHBORS_8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeHypot(x: number, y: number): number {
  const len = Math.hypot(x, y);
  return len > 1e-8 ? len : 1;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.floor(sorted.length * p), 0, sorted.length - 1);
  return sorted[index];
}

export type WedgeMetrics = {
  dominantShare: number;
  lowFrequencyShare: number;
  radialConvergence: number;
  tangentialConvergence: number;
  p95GradientJump: number;
};

export function computeWedgeMetrics(map: GeneratedContinent): WedgeMetrics {
  const bins = new Float64Array(36);
  const lowFreq = new Float64Array(8);
  const ringSamples: number[] = [];
  let total = 0;
  let radialDotSum = 0;
  let radialDotCount = 0;
  let tangentialDotSum = 0;
  let tangentialDotCount = 0;

  const cx = (map.width - 1) * 0.5;
  const cy = (map.height - 1) * 0.5;
  const minR = Math.min(map.width, map.height) * 0.18;
  const maxR = Math.min(map.width, map.height) * 0.46;

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      const gx = (map.light[index + 1] - map.light[index - 1]) * 0.5;
      const gy = (map.light[(y + 1) * map.width + x] - map.light[(y - 1) * map.width + x]) * 0.5;
      const mag = Math.hypot(gx, gy);
      if (mag < 1e-4) {
        continue;
      }

      const theta = (Math.atan2(gy, gx) + Math.PI) % Math.PI;
      const bin = clamp(Math.floor((theta / Math.PI) * bins.length), 0, bins.length - 1);
      bins[bin] += mag;
      const lowBin = clamp(Math.floor((theta / Math.PI) * lowFreq.length), 0, lowFreq.length - 1);
      lowFreq[lowBin] += mag;
      total += mag;

      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r >= minR && r <= maxR) {
        const rLen = safeHypot(dx, dy);
        const radial = Math.abs((gx / mag) * (dx / rLen) + (gy / mag) * (dy / rLen));
        const tx = -dy / rLen;
        const ty = dx / rLen;
        const tangential = Math.abs((gx / mag) * tx + (gy / mag) * ty);
        radialDotSum += radial;
        radialDotCount += 1;
        tangentialDotSum += tangential;
        tangentialDotCount += 1;
      }
    }
  }

  for (let d = 0; d < 360; d += 1) {
    const angle = (d * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(angle) * ((minR + maxR) * 0.5));
    const y = Math.round(cy + Math.sin(angle) * ((minR + maxR) * 0.5));
    if (x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) {
      continue;
    }
    ringSamples.push(map.light[y * map.width + x]);
  }
  const jumps: number[] = [];
  for (let i = 0; i < ringSamples.length; i += 1) {
    const next = ringSamples[(i + 1) % ringSamples.length];
    jumps.push(Math.abs(next - ringSamples[i]));
  }

  const dominantShare = total > 0 ? Math.max(...bins) / total : 0;
  const lowFrequencyShare = total > 0 ? Math.max(...lowFreq) / total : 0;
  const radialConvergence = radialDotCount > 0 ? radialDotSum / radialDotCount : 0;
  const tangentialConvergence = tangentialDotCount > 0 ? tangentialDotSum / tangentialDotCount : 0;
  const p95GradientJump = percentile(jumps, 0.95);

  return {
    dominantShare,
    lowFrequencyShare,
    radialConvergence,
    tangentialConvergence,
    p95GradientJump,
  };
}

export type RadialRidgeMetrics = {
  radialAlignment: number;
  periodicPeakShare: number;
  mountainPixels: number;
};

export function computeRadialRidgeMetrics(map: GeneratedContinent): RadialRidgeMetrics {
  const bins = new Float64Array(24);
  let total = 0;
  let radialAlignment = 0;
  let mountainPixels = 0;
  const cx = (map.width - 1) * 0.5;
  const cy = (map.height - 1) * 0.5;

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      const isMountain = map.ridge[index] > 0.42 && map.land[index] === 1;
      if (!isMountain) {
        continue;
      }
      mountainPixels += 1;
      const gx = (map.elevation[index + 1] - map.elevation[index - 1]) * 0.5;
      const gy = (map.elevation[(y + 1) * map.width + x] - map.elevation[(y - 1) * map.width + x]) * 0.5;
      const mag = Math.hypot(gx, gy);
      if (mag < 1e-5) {
        continue;
      }
      const tangentAngle = (Math.atan2(-gx, gy) + Math.PI) % Math.PI;
      const bin = clamp(Math.floor((tangentAngle / Math.PI) * bins.length), 0, bins.length - 1);
      bins[bin] += mag;
      total += mag;

      const dx = x - cx;
      const dy = y - cy;
      const rLen = safeHypot(dx, dy);
      const radial = Math.abs((gx / mag) * (dx / rLen) + (gy / mag) * (dy / rLen));
      radialAlignment += radial;
    }
  }

  const periodicPeakShare = total > 0 ? Math.max(...bins) / total : 0;
  const normalizedRadial = mountainPixels > 0 ? radialAlignment / mountainPixels : 0;

  return {
    radialAlignment: normalizedRadial,
    periodicPeakShare,
    mountainPixels,
  };
}

export type RectangleMetrics = {
  axisAlignedNormalScore: number;
  bboxFillRatio: number;
  coastCardinalBias: number;
};

export function computeRectangleMetrics(map: GeneratedContinent): RectangleMetrics {
  let axisAlignedNormalScore = 0;
  let coastCardinalBias = 0;
  let coastCount = 0;
  const d = computeContinentDiagnostics(map, 10);

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      if (map.land[index] !== 1) {
        continue;
      }

      let coast = false;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = (y + dy) * map.width + (x + dx);
        if (map.land[ni] === 0) {
          coast = true;
          break;
        }
      }
      if (!coast) {
        continue;
      }
      coastCount += 1;

      const gx = (map.land[index + 1] - map.land[index - 1]) * 0.5;
      const gy = (map.land[(y + 1) * map.width + x] - map.land[(y - 1) * map.width + x]) * 0.5;
      const len = safeHypot(gx, gy);
      const nx = gx / len;
      const ny = gy / len;
      axisAlignedNormalScore += Math.max(Math.abs(nx), Math.abs(ny));

      const cardinal = Math.abs(Math.abs(nx) - Math.abs(ny));
      coastCardinalBias += cardinal;
    }
  }

  return {
    axisAlignedNormalScore: coastCount > 0 ? axisAlignedNormalScore / coastCount : 0,
    bboxFillRatio: d.bboxFillRatio,
    coastCardinalBias: coastCount > 0 ? coastCardinalBias / coastCount : 0,
  };
}

export type RiverHierarchyMetrics = {
  inlandRatio: number;
  coastalClusterRatio: number;
  maxComponent: number;
  inlandSourceCount: number;
};

export function computeRiverHierarchyMetrics(map: GeneratedContinent): RiverHierarchyMetrics {
  const d = computeContinentDiagnostics(map, 10);
  let coastalRiver = 0;
  let inlandSourceCount = 0;

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      if (map.river[index] !== 1) {
        continue;
      }
      if (map.distanceToOcean[index] <= 4) {
        coastalRiver += 1;
      }

      let upstreamNeighbors = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = (y + dy) * map.width + (x + dx);
        if (map.river[ni] === 1 && map.elevation[ni] > map.elevation[index]) {
          upstreamNeighbors += 1;
        }
      }
      if (upstreamNeighbors === 0 && map.distanceToOcean[index] >= 10 && map.elevation[index] > map.seaLevel + 0.05) {
        inlandSourceCount += 1;
      }
    }
  }

  return {
    inlandRatio: d.inlandRiverRatio,
    coastalClusterRatio: d.riverPixels > 0 ? coastalRiver / d.riverPixels : 1,
    maxComponent: d.maxRiverComponent,
    inlandSourceCount,
  };
}

export type RealismGates = {
  wedgesPass: boolean;
  radialPass: boolean;
  rectanglePass: boolean;
  riverPass: boolean;
  pass: boolean;
  reasons: string[];
};

export type RealismMetrics = {
  wedge: WedgeMetrics;
  radial: RadialRidgeMetrics;
  rectangle: RectangleMetrics;
  river: RiverHierarchyMetrics;
  gates: RealismGates;
};

export function evaluateRealismMetrics(map: GeneratedContinent): RealismMetrics {
  const wedge = computeWedgeMetrics(map);
  const radial = computeRadialRidgeMetrics(map);
  const rectangle = computeRectangleMetrics(map);
  const river = computeRiverHierarchyMetrics(map);
  const reasons: string[] = [];

  const wedgesPass =
    wedge.dominantShare < 0.18 &&
    wedge.lowFrequencyShare < 0.31 &&
    wedge.radialConvergence < 0.74 &&
    wedge.tangentialConvergence < 0.88 &&
    wedge.p95GradientJump < 0.15;
  if (!wedgesPass) {
    reasons.push('wedge-artifact-metric');
  }

  const radialPass =
    radial.radialAlignment < 0.73 &&
    radial.periodicPeakShare < 0.19 &&
    radial.mountainPixels > 300;
  if (!radialPass) {
    reasons.push('radial-ridge-pattern');
  }

  const rectanglePass =
    rectangle.bboxFillRatio < 0.9 &&
    rectangle.axisAlignedNormalScore < 0.89 &&
    rectangle.coastCardinalBias < 0.66;
  if (!rectanglePass) {
    reasons.push('rectangular-silhouette');
  }

  const needsTrunk = map.controls.size !== 'isle' && map.controls.landFraction >= 4;
  const trunkLengthThreshold = Math.max(18, Math.floor(map.width * 0.028));
  const riverPass =
    river.inlandRatio > 0.45 &&
    river.coastalClusterRatio < 0.55 &&
    (!needsTrunk || (river.maxComponent >= trunkLengthThreshold && river.inlandSourceCount >= 1));
  if (!riverPass) {
    reasons.push('river-hierarchy');
  }

  return {
    wedge,
    radial,
    rectangle,
    river,
    gates: {
      wedgesPass,
      radialPass,
      rectanglePass,
      riverPass,
      pass: wedgesPass && radialPass && rectanglePass && riverPass,
      reasons,
    },
  };
}

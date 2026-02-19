import type { GeneratedContinent } from './continent';

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

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.floor(sorted.length * p), 0, sorted.length - 1);
  return sorted[index];
}

function largestComponentSpanRatio(mask: Uint8Array, width: number, height: number): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let bestRatio = 0;

  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0 || visited[i] === 1) {
      continue;
    }
    let minX = width;
    let maxX = -1;
    visited[i] = 1;
    queue[0] = i;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const current = queue[head];
      head += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (mask[ni] === 0 || visited[ni] === 1) {
          continue;
        }
        visited[ni] = 1;
        queue[tail] = ni;
        tail += 1;
      }
    }
    if (maxX >= minX) {
      bestRatio = Math.max(bestRatio, (maxX - minX + 1) / Math.max(1, width));
    }
  }

  return bestRatio;
}

function ridgeAnisotropyFromMask(mask: Uint8Array, width: number, height: number): number {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) {
        continue;
      }
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  if (count < 20) {
    return 0;
  }
  const mx = sumX / count;
  const my = sumY / count;

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) {
        continue;
      }
      const dx = x - mx;
      const dy = y - my;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
  }
  cxx /= count;
  cyy /= count;
  cxy /= count;
  const trace = cxx + cyy;
  const detTerm = Math.sqrt(Math.max(0, (cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy));
  const l1 = (trace + detTerm) * 0.5;
  const l2 = (trace - detTerm) * 0.5;
  return l1 > 1e-8 ? clamp((l1 - l2) / l1, 0, 1) : 0;
}

function basinDepthSeparation(map: GeneratedContinent): number {
  const landElev: number[] = [];
  const landRidge: number[] = [];
  const landFlow: number[] = [];
  for (let i = 0; i < map.elevation.length; i += 1) {
    if (map.land[i] === 0) continue;
    landElev.push(map.elevation[i]);
    landRidge.push(map.ridge[i]);
    landFlow.push(map.flow[i]);
  }

  if (landElev.length < 30) {
    return 0;
  }

  const ridgeCut = percentile(landRidge, 0.86);
  const valleyCut = percentile(landFlow, 0.78);

  const ridges: number[] = [];
  const valleys: number[] = [];
  for (let i = 0; i < map.elevation.length; i += 1) {
    if (map.land[i] === 0) continue;
    if (map.ridge[i] >= ridgeCut) ridges.push(map.elevation[i]);
    if (map.flow[i] >= valleyCut) valleys.push(map.elevation[i]);
  }

  if (ridges.length < 12) {
    return 0;
  }
  if (valleys.length < 12) {
    valleys.push(...landElev);
  }
  const ridgeHigh = percentile(ridges, 0.7);
  const valleyLow = percentile(valleys, valleys.length === landElev.length ? 0.12 : 0.28);
  return ridgeHigh - valleyLow;
}

function noBlobScore(map: GeneratedContinent): number {
  const cx = (map.width - 1) * 0.5;
  const cy = (map.height - 1) * 0.5;
  const samplesR: number[] = [];
  const samplesE: number[] = [];

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      if (map.land[index] === 0) {
        continue;
      }
      const r = Math.hypot(x - cx, y - cy) / Math.max(1, Math.min(map.width, map.height));
      samplesR.push(r);
      samplesE.push(map.elevation[index]);
    }
  }
  if (samplesR.length < 20) {
    return 0;
  }

  let meanR = 0;
  let meanE = 0;
  for (let i = 0; i < samplesR.length; i += 1) {
    meanR += samplesR[i];
    meanE += samplesE[i];
  }
  meanR /= samplesR.length;
  meanE /= samplesE.length;

  let num = 0;
  let denR = 0;
  let denE = 0;
  for (let i = 0; i < samplesR.length; i += 1) {
    const dr = samplesR[i] - meanR;
    const de = samplesE[i] - meanE;
    num += dr * de;
    denR += dr * dr;
    denE += de * de;
  }
  const corr = num / Math.max(1e-6, Math.sqrt(denR * denE));
  return 1 - Math.abs(corr);
}

export type DemRealismMetrics = {
  crestlineContinuity: number;
  ridgeAnisotropy: number;
  basinDepthSeparation: number;
  noBlobScore: number;
};

export type DemRealismGates = {
  crestlineContinuityPass: boolean;
  ridgeAnisotropyPass: boolean;
  basinDepthSeparationPass: boolean;
  noBlobPass: boolean;
  pass: boolean;
  reasons: string[];
};

export type DemRealismResult = {
  metrics: DemRealismMetrics;
  gates: DemRealismGates;
};

export function evaluateDemRealism(map: GeneratedContinent): DemRealismResult {
  const ridgeMask = new Uint8Array(map.ridge.length);
  const ridgeLandValues: number[] = [];
  for (let i = 0; i < map.ridge.length; i += 1) {
    if (map.land[i] === 1) ridgeLandValues.push(map.ridge[i]);
  }
  const ridgeCut = ridgeLandValues.length > 0 ? percentile(ridgeLandValues, 0.86) : 1;
  for (let i = 0; i < map.ridge.length; i += 1) {
    ridgeMask[i] = map.land[i] === 1 && map.ridge[i] >= ridgeCut ? 1 : 0;
  }

  const metrics: DemRealismMetrics = {
    crestlineContinuity: largestComponentSpanRatio(ridgeMask, map.width, map.height),
    ridgeAnisotropy: ridgeAnisotropyFromMask(ridgeMask, map.width, map.height),
    basinDepthSeparation: basinDepthSeparation(map),
    noBlobScore: noBlobScore(map),
  };

  const reasons: string[] = [];
  const crestlineContinuityPass = metrics.crestlineContinuity > 0.15;
  if (!crestlineContinuityPass) reasons.push('crestline-continuity');
  const ridgeAnisotropyPass = metrics.ridgeAnisotropy > 0.2;
  if (!ridgeAnisotropyPass) reasons.push('ridge-anisotropy');
  const basinDepthSeparationPass = metrics.basinDepthSeparation > 0.16;
  if (!basinDepthSeparationPass) reasons.push('basin-depth-separation');
  const noBlobPass = metrics.noBlobScore > 0.35;
  if (!noBlobPass) reasons.push('no-blob');

  return {
    metrics,
    gates: {
      crestlineContinuityPass,
      ridgeAnisotropyPass,
      basinDepthSeparationPass,
      noBlobPass,
      pass: crestlineContinuityPass && ridgeAnisotropyPass && basinDepthSeparationPass && noBlobPass,
      reasons,
    },
  };
}

export function evaluateRealismMetrics(map: GeneratedContinent): { metrics: DemRealismMetrics; gates: DemRealismGates } {
  return evaluateDemRealism(map);
}

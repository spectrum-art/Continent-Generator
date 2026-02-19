import type { GeneratedContinent } from './continent';

const NEIGHBORS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

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

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length * 0.5);
  return sorted[mid];
}

function gradientAt(map: GeneratedContinent, x: number, y: number): { gx: number; gy: number; mag: number } {
  const xl = Math.max(0, x - 1);
  const xr = Math.min(map.width - 1, x + 1);
  const yu = Math.max(0, y - 1);
  const yd = Math.min(map.height - 1, y + 1);
  const gx = (map.elevation[y * map.width + xr] - map.elevation[y * map.width + xl]) * 0.5;
  const gy = (map.elevation[yd * map.width + x] - map.elevation[yu * map.width + x]) * 0.5;
  return { gx, gy, mag: Math.hypot(gx, gy) };
}

function sampleLocalMaxima(map: GeneratedContinent, maxCount = 20): Array<{ x: number; y: number; value: number }> {
  const peaks: Array<{ x: number; y: number; value: number }> = [];
  for (let y = 2; y < map.height - 2; y += 1) {
    for (let x = 2; x < map.width - 2; x += 1) {
      const index = y * map.width + x;
      const value = map.elevation[index];
      if (value < map.seaLevel + 0.2) {
        continue;
      }
      let isPeak = true;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = (y + dy) * map.width + (x + dx);
        if (map.elevation[ni] > value) {
          isPeak = false;
          break;
        }
      }
      if (isPeak) {
        peaks.push({ x, y, value });
      }
    }
  }
  peaks.sort((a, b) => b.value - a.value);
  return peaks.slice(0, maxCount);
}

function computeRadialSymmetry(map: GeneratedContinent): number {
  const peaks = sampleLocalMaxima(map, 18);
  if (peaks.length === 0) {
    return 0;
  }
  const scores: number[] = [];
  for (const peak of peaks) {
    const energies: number[] = [];
    const radius = Math.max(10, Math.floor(Math.min(map.width, map.height) * 0.035));
    for (let direction = 0; direction < 16; direction += 1) {
      const angle = (direction / 16) * Math.PI * 2;
      const x = Math.round(peak.x + Math.cos(angle) * radius);
      const y = Math.round(peak.y + Math.sin(angle) * radius);
      if (x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) {
        energies.push(0);
        continue;
      }
      energies.push(gradientAt(map, x, y).mag);
    }
    const mean = energies.reduce((sum, value) => sum + value, 0) / Math.max(1, energies.length);
    const variance =
      energies.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / Math.max(1, energies.length);
    const std = Math.sqrt(Math.max(0, variance));
    scores.push(mean > 1e-5 ? 1 - std / mean : 1);
  }
  return scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
}

function computeRidgeAnisotropy(map: GeneratedContinent): { anisotropy: number; sampleRatio: number } {
  let gxx = 0;
  let gyy = 0;
  let gxy = 0;
  let samples = 0;
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      if (map.elevation[index] < map.seaLevel + 0.14) {
        continue;
      }
      const g = gradientAt(map, x, y);
      if (g.mag < 0.003) {
        continue;
      }
      gxx += g.gx * g.gx;
      gyy += g.gy * g.gy;
      gxy += g.gx * g.gy;
      samples += 1;
    }
  }
  if (samples < 32) {
    return { anisotropy: 0, sampleRatio: samples / Math.max(1, (map.width - 2) * (map.height - 2)) };
  }
  gxx /= samples;
  gyy /= samples;
  gxy /= samples;
  const trace = gxx + gyy;
  const detTerm = Math.sqrt(Math.max(0, (gxx - gyy) * (gxx - gyy) + 4 * gxy * gxy));
  const lambda1 = (trace + detTerm) * 0.5;
  const lambda2 = (trace - detTerm) * 0.5;
  return {
    anisotropy: lambda1 > 1e-8 ? clamp((lambda1 - lambda2) / lambda1, 0, 1) : 0,
    sampleRatio: samples / Math.max(1, (map.width - 2) * (map.height - 2)),
  };
}

function computeCurvature(map: GeneratedContinent): Float32Array {
  const curvature = new Float32Array(map.width * map.height);
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      const c = map.elevation[index];
      const l = map.elevation[index - 1];
      const r = map.elevation[index + 1];
      const u = map.elevation[index - map.width];
      const d = map.elevation[index + map.width];
      curvature[index] = (l + r + u + d) - c * 4;
    }
  }
  return curvature;
}

function computeValleyMetrics(map: GeneratedContinent): { depthVariance: number; curvatureSeparation: number } {
  const curvature = computeCurvature(map);
  const valleyCurvature: number[] = [];
  const ridgeCurvature: number[] = [];
  const valleyElevation: number[] = [];

  for (let i = 0; i < curvature.length; i += 1) {
    if (map.land[i] === 0) {
      continue;
    }
    const elevation = map.elevation[i];
    if (map.flow[i] > 0.06 && elevation > map.seaLevel + 0.01) {
      valleyCurvature.push(curvature[i]);
      valleyElevation.push(elevation);
    }
    if (map.ridge[i] > 0.5 && elevation > map.seaLevel + 0.12) {
      ridgeCurvature.push(curvature[i]);
    }
  }

  const vMedian = median(valleyCurvature);
  const rMedian = median(ridgeCurvature);
  const depthVariance =
    valleyElevation.length > 4 ? percentile(valleyElevation, 0.9) - percentile(valleyElevation, 0.1) : 0;

  return {
    depthVariance,
    curvatureSeparation: Math.abs(rMedian - vMedian),
  };
}

export function computeRectangleMetrics(map: GeneratedContinent): { bboxFillRatio: number; axisAlignedNormalScore: number } {
  let minX = map.width;
  let minY = map.height;
  let maxX = -1;
  let maxY = -1;
  const bins = new Float64Array(36);
  let total = 0;

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      if (map.land[index] === 1) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (map.land[index] === 0) {
        continue;
      }
      let coastal = false;
      for (const [dx, dy] of NEIGHBORS_4) {
        const ni = (y + dy) * map.width + (x + dx);
        if (map.land[ni] === 0) {
          coastal = true;
          break;
        }
      }
      if (!coastal) {
        continue;
      }

      const left = map.elevation[y * map.width + (x - 1)];
      const right = map.elevation[y * map.width + (x + 1)];
      const up = map.elevation[(y - 1) * map.width + x];
      const down = map.elevation[(y + 1) * map.width + x];
      const gx = (right - left) * 0.5;
      const gy = (down - up) * 0.5;
      const mag = Math.hypot(gx, gy);
      if (mag < 1e-5) {
        continue;
      }
      const theta = (Math.atan2(gy, gx) + Math.PI) % Math.PI;
      const bin = clamp(Math.floor((theta / Math.PI) * bins.length), 0, bins.length - 1);
      bins[bin] += mag;
      total += mag;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { bboxFillRatio: 0, axisAlignedNormalScore: 1 };
  }

  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  const axisCenter0 = 0;
  const axisCenter90 = bins.length / 2;
  let axisEnergy = 0;
  for (let offset = -1; offset <= 1; offset += 1) {
    axisEnergy += bins[(axisCenter0 + offset + bins.length) % bins.length];
    axisEnergy += bins[(axisCenter90 + offset + bins.length) % bins.length];
  }

  return {
    bboxFillRatio: map.landArea / Math.max(1, bboxArea),
    axisAlignedNormalScore: total > 1e-8 ? axisEnergy / total : 1,
  };
}

function computeSilhouetteAngularBias(map: GeneratedContinent): number {
  return computeRectangleMetrics(map).axisAlignedNormalScore;
}

function computeSeamDiscontinuity(map: GeneratedContinent): number {
  const meanJumpsX: number[] = [];
  const meanJumpsY: number[] = [];

  for (let x = 1; x < map.width; x += 1) {
    let sum = 0;
    for (let y = 0; y < map.height; y += 1) {
      const a = map.elevation[y * map.width + (x - 1)];
      const b = map.elevation[y * map.width + x];
      sum += Math.abs(a - b);
    }
    meanJumpsX.push(sum / map.height);
  }

  for (let y = 1; y < map.height; y += 1) {
    let sum = 0;
    for (let x = 0; x < map.width; x += 1) {
      const a = map.elevation[(y - 1) * map.width + x];
      const b = map.elevation[y * map.width + x];
      sum += Math.abs(a - b);
    }
    meanJumpsY.push(sum / map.width);
  }

  return Math.max(percentile(meanJumpsX, 0.995), percentile(meanJumpsY, 0.995));
}

export type WedgeMetrics = {
  dominantShare: number;
  tangentialConvergence: number;
  p95GradientJump: number;
};

export function computeWedgeMetrics(map: GeneratedContinent): WedgeMetrics {
  const bins = new Float64Array(36);
  let total = 0;
  const centerX = (map.width - 1) * 0.5;
  const centerY = (map.height - 1) * 0.5;
  let tangentialSum = 0;
  let tangentialSamples = 0;

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      const gx = (map.light[index + 1] - map.light[index - 1]) * 0.5;
      const gy = (map.light[index + map.width] - map.light[index - map.width]) * 0.5;
      const mag = Math.hypot(gx, gy);
      if (mag < 1e-5) {
        continue;
      }

      const theta = (Math.atan2(gy, gx) + Math.PI) % Math.PI;
      const bin = clamp(Math.floor((theta / Math.PI) * bins.length), 0, bins.length - 1);
      bins[bin] += mag;
      total += mag;

      const rx = x - centerX;
      const ry = y - centerY;
      const rLen = Math.hypot(rx, ry);
      if (rLen < Math.min(map.width, map.height) * 0.12) {
        continue;
      }
      const ux = rx / rLen;
      const uy = ry / rLen;
      const tx = -uy;
      const ty = ux;
      const gxNorm = gx / mag;
      const gyNorm = gy / mag;
      tangentialSum += Math.abs(gxNorm * tx + gyNorm * ty);
      tangentialSamples += 1;
    }
  }

  const ringDiffs: number[] = [];
  const ringRadius = Math.min(map.width, map.height) * 0.32;
  for (let i = 0; i < 180; i += 1) {
    const a0 = (i / 180) * Math.PI * 2;
    const a1 = ((i + 1) / 180) * Math.PI * 2;
    const x0 = Math.round(centerX + Math.cos(a0) * ringRadius);
    const y0 = Math.round(centerY + Math.sin(a0) * ringRadius);
    const x1 = Math.round(centerX + Math.cos(a1) * ringRadius);
    const y1 = Math.round(centerY + Math.sin(a1) * ringRadius);
    if (x0 < 0 || y0 < 0 || x0 >= map.width || y0 >= map.height) {
      continue;
    }
    if (x1 < 0 || y1 < 0 || x1 >= map.width || y1 >= map.height) {
      continue;
    }
    const i0 = y0 * map.width + x0;
    const i1 = y1 * map.width + x1;
    ringDiffs.push(Math.abs(map.light[i1] - map.light[i0]));
  }

  return {
    dominantShare: total > 1e-8 ? Math.max(...bins) / total : 1,
    tangentialConvergence: tangentialSamples > 0 ? tangentialSum / tangentialSamples : 1,
    p95GradientJump: percentile(ringDiffs, 0.95),
  };
}

export type RiverHierarchyMetrics = {
  inlandRatio: number;
  maxComponent: number;
};

export function computeRiverHierarchyMetrics(map: GeneratedContinent): RiverHierarchyMetrics {
  let inland = 0;
  let total = 0;
  for (let i = 0; i < map.river.length; i += 1) {
    if (map.river[i] === 0) {
      continue;
    }
    total += 1;
    if (map.distanceToOcean[i] >= 10) {
      inland += 1;
    }
  }

  const visited = new Uint8Array(map.river.length);
  let maxComponent = 0;
  const queue = new Int32Array(map.river.length);

  for (let i = 0; i < map.river.length; i += 1) {
    if (map.river[i] === 0 || visited[i] === 1) {
      continue;
    }
    visited[i] = 1;
    queue[0] = i;
    let head = 0;
    let tail = 1;
    let size = 0;
    while (head < tail) {
      const cur = queue[head];
      head += 1;
      size += 1;
      const x = cur % map.width;
      const y = Math.floor(cur / map.width);
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) {
          continue;
        }
        const ni = ny * map.width + nx;
        if (map.river[ni] === 0 || visited[ni] === 1) {
          continue;
        }
        visited[ni] = 1;
        queue[tail] = ni;
        tail += 1;
      }
    }
    maxComponent = Math.max(maxComponent, size);
  }

  return {
    inlandRatio: total > 0 ? inland / total : 0,
    maxComponent,
  };
}

export type DemRealismMetrics = {
  radialSymmetry: number;
  ridgeAnisotropy: number;
  valleyDepthVariance: number;
  curvatureSeparation: number;
  silhouetteAngularBias: number;
  seamDiscontinuity: number;
  hillshadeWedge: number;
};

export type DemRealismGates = {
  radialSymmetryPass: boolean;
  ridgeAnisotropyPass: boolean;
  valleyDepthVariancePass: boolean;
  curvatureSeparationPass: boolean;
  silhouetteAngularBiasPass: boolean;
  seamDiscontinuityPass: boolean;
  hillshadeWedgePass: boolean;
  pass: boolean;
  reasons: string[];
};

export type DemRealismResult = {
  metrics: DemRealismMetrics;
  gates: DemRealismGates;
};

export function evaluateDemRealism(map: GeneratedContinent): DemRealismResult {
  const radialSymmetry = computeRadialSymmetry(map);
  const ridge = computeRidgeAnisotropy(map);
  const valley = computeValleyMetrics(map);
  const silhouetteAngularBias = computeSilhouetteAngularBias(map);
  const seamDiscontinuity = computeSeamDiscontinuity(map);
  const wedge = computeWedgeMetrics(map);
  const hillshadeWedge = wedge.dominantShare * 0.6 + wedge.tangentialConvergence * 0.25 + wedge.p95GradientJump * 1.5;

  const metrics: DemRealismMetrics = {
    radialSymmetry,
    ridgeAnisotropy: ridge.anisotropy,
    valleyDepthVariance: valley.depthVariance,
    curvatureSeparation: valley.curvatureSeparation,
    silhouetteAngularBias,
    seamDiscontinuity,
    hillshadeWedge,
  };

  const reasons: string[] = [];
  const radialSymmetryPass = radialSymmetry < 0.78;
  if (!radialSymmetryPass) reasons.push('radial-symmetry');
  const ridgeAnisotropyPass = ridge.sampleRatio < 0.012 || ridge.anisotropy > 0.085;
  if (!ridgeAnisotropyPass) reasons.push('ridge-anisotropy');
  const valleyDepthVariancePass = valley.depthVariance > 0.045;
  if (!valleyDepthVariancePass) reasons.push('valley-depth-variance');
  const curvatureSeparationPass = valley.curvatureSeparation > 0.0015;
  if (!curvatureSeparationPass) reasons.push('curvature-separation');
  const silhouetteAngularBiasPass = silhouetteAngularBias < 0.72;
  if (!silhouetteAngularBiasPass) reasons.push('silhouette-angular-bias');
  const seamDiscontinuityPass = seamDiscontinuity < 0.78;
  if (!seamDiscontinuityPass) reasons.push('seam-discontinuity');
  const hillshadeWedgePass = hillshadeWedge < 0.36;
  if (!hillshadeWedgePass) reasons.push('hillshade-wedge');

  return {
    metrics,
    gates: {
      radialSymmetryPass,
      ridgeAnisotropyPass,
      valleyDepthVariancePass,
      curvatureSeparationPass,
      silhouetteAngularBiasPass,
      seamDiscontinuityPass,
      hillshadeWedgePass,
      pass:
        radialSymmetryPass &&
        ridgeAnisotropyPass &&
        valleyDepthVariancePass &&
        curvatureSeparationPass &&
        silhouetteAngularBiasPass &&
        seamDiscontinuityPass &&
        hillshadeWedgePass,
      reasons,
    },
  };
}

export function evaluateRealismMetrics(map: GeneratedContinent): { metrics: DemRealismMetrics; gates: DemRealismGates } {
  return evaluateDemRealism(map);
}

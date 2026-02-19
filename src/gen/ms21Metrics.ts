import type { GeneratedContinent } from './continent';

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

function computeDrainage(map: GeneratedContinent): {
  sinkCount: number;
  sinkFraction: number;
  drainToOceanFraction: number;
  topIndices: number[];
  topValues: number[];
  topReachOcean: boolean[];
  trunkLengths: number[];
} {
  const total = map.width * map.height;
  const state = new Uint8Array(total); // 0 unknown, 1 visiting, 2 no, 3 yes

  const reachesOcean = (start: number): boolean => {
    if (start < 0 || start >= total) {
      return false;
    }
    if (map.ocean[start] === 1) {
      state[start] = 3;
      return true;
    }
    if (state[start] === 3) {
      return true;
    }
    if (state[start] === 2) {
      return false;
    }
    if (state[start] === 1) {
      state[start] = 2;
      return false;
    }

    state[start] = 1;
    const next = map.flowDirection[start];
    const ok = next >= 0 && next !== start && reachesOcean(next);
    state[start] = ok ? 3 : 2;
    return ok;
  };

  let landCells = 0;
  let drained = 0;
  let sinkCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (map.land[i] === 0) {
      continue;
    }
    landCells += 1;
    const out = map.flowDirection[i];
    if (out < 0 || out === i) {
      sinkCount += 1;
      continue;
    }
    if (reachesOcean(i)) {
      drained += 1;
    }
  }

  const topIndices = [-1, -1, -1];
  const topValues = [-Infinity, -Infinity, -Infinity];
  const inlandThreshold = Math.max(10, Math.round(Math.min(map.width, map.height) * 0.12));
  for (let i = 0; i < total; i += 1) {
    if (map.land[i] === 0) {
      continue;
    }
    if (map.distanceToOcean[i] < inlandThreshold) {
      continue;
    }
    const v = map.flowAccumulation[i];
    if (v > topValues[0]) {
      topValues[2] = topValues[1];
      topIndices[2] = topIndices[1];
      topValues[1] = topValues[0];
      topIndices[1] = topIndices[0];
      topValues[0] = v;
      topIndices[0] = i;
    } else if (v > topValues[1]) {
      topValues[2] = topValues[1];
      topIndices[2] = topIndices[1];
      topValues[1] = v;
      topIndices[1] = i;
    } else if (v > topValues[2]) {
      topValues[2] = v;
      topIndices[2] = i;
    }
  }

  const pathLength = (start: number): number => {
    if (start < 0) {
      return 0;
    }
    const seen = new Set<number>();
    let current = start;
    let length = 0;
    while (current >= 0 && !seen.has(current) && length < total) {
      seen.add(current);
      if (map.land[current] === 1) {
        length += 1;
      }
      if (map.ocean[current] === 1) {
        break;
      }
      const next = map.flowDirection[current];
      if (next < 0 || next === current) {
        break;
      }
      current = next;
    }
    return length;
  };

  const topReachOcean = topIndices.map((i) => (i >= 0 ? reachesOcean(i) : false));
  const trunkLengths = topIndices.map((i) => pathLength(i));

  return {
    sinkCount,
    sinkFraction: sinkCount / Math.max(1, landCells),
    drainToOceanFraction: drained / Math.max(1, landCells),
    topIndices,
    topValues,
    topReachOcean,
    trunkLengths,
  };
}

function elevationStats(map: GeneratedContinent): {
  spreadAboveSea: number;
  stddevAboveSea: number;
} {
  const values: number[] = [];
  for (let i = 0; i < map.elevation.length; i += 1) {
    if (map.land[i] === 1) {
      values.push(map.elevation[i]);
    }
  }
  if (values.length === 0) {
    return { spreadAboveSea: 0, stddevAboveSea: 0 };
  }

  const p05 = percentile(values, 0.05);
  const p95 = percentile(values, 0.95);
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  const mean = sum / values.length;
  let variance = 0;
  for (const v of values) {
    const d = v - mean;
    variance += d * d;
  }
  variance /= values.length;

  return {
    spreadAboveSea: p95 - p05,
    stddevAboveSea: Math.sqrt(Math.max(0, variance)),
  };
}

function curvatureStats(map: GeneratedContinent): {
  concaveCount: number;
  convexCount: number;
  ratio: number;
  ridgeValleyReliefMean: number;
} {
  const laps: number[] = [];
  const elevs: number[] = [];
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      if (map.land[index] === 0) {
        continue;
      }
      const center = map.elevation[index];
      const avg = (
        map.elevation[index - 1] +
        map.elevation[index + 1] +
        map.elevation[index - map.width] +
        map.elevation[index + map.width]
      ) * 0.25;
      laps.push(avg - center);
      elevs.push(center);
    }
  }
  const absLaps = laps.map((v) => Math.abs(v));
  const threshold = Math.max(1e-6, percentile(absLaps, 0.7));
  const concaveTop = percentile(laps, 0.95);
  const convexTop = percentile(laps, 0.05);
  let concaveCount = 0;
  let convexCount = 0;
  let ridgeSum = 0;
  let ridgeCount = 0;
  let valleySum = 0;
  let valleyCount = 0;
  for (let i = 0; i < laps.length; i += 1) {
    const lap = laps[i];
    if (lap > threshold) {
      concaveCount += 1;
    } else if (lap < -threshold) {
      convexCount += 1;
    }
    if (lap >= concaveTop) {
      valleySum += elevs[i];
      valleyCount += 1;
    } else if (lap <= convexTop) {
      ridgeSum += elevs[i];
      ridgeCount += 1;
    }
  }
  const ridgeMean = ridgeCount > 0 ? ridgeSum / ridgeCount : 0;
  const valleyMean = valleyCount > 0 ? valleySum / valleyCount : 0;

  return {
    concaveCount,
    convexCount,
    ratio: concaveCount / Math.max(1, convexCount),
    ridgeValleyReliefMean: ridgeMean - valleyMean,
  };
}

function hillshadeEdgeDiscontinuity(map: GeneratedContinent): number {
  const { width, height, light } = map;
  let borderSum = 0;
  let borderCount = 0;

  for (let x = 0; x < width; x += 1) {
    borderSum += Math.abs(light[x] - light[Math.min(height - 1, 1) * width + x]);
    borderSum += Math.abs(light[(height - 1) * width + x] - light[Math.max(0, height - 2) * width + x]);
    borderCount += 2;
  }
  for (let y = 0; y < height; y += 1) {
    borderSum += Math.abs(light[y * width] - light[y * width + Math.min(width - 1, 1)]);
    borderSum += Math.abs(light[y * width + width - 1] - light[y * width + Math.max(0, width - 2)]);
    borderCount += 2;
  }

  let interiorSum = 0;
  let interiorCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      interiorSum += Math.abs(light[i] - light[i + 1]);
      interiorSum += Math.abs(light[i] - light[i + width]);
      interiorCount += 2;
    }
  }

  const borderMean = borderSum / Math.max(1, borderCount);
  const interiorMean = interiorSum / Math.max(1, interiorCount);
  return borderMean / Math.max(1e-6, interiorMean);
}

export type Ms21Metrics = {
  sink_count: number;
  sink_fraction: number;
  drain_to_ocean_fraction: number;
  max_flow_acc_values: number[];
  max_flow_acc_reach_ocean: boolean[];
  trunk_river_lengths: number[];
  elevation_spread_above_sea: number;
  stddev_above_sea: number;
  curvature_stats: {
    concave_count: number;
    convex_count: number;
    ratio: number;
  };
  ridge_valley_relief_mean: number;
  hillshade_edge_discontinuity_score: number;
};

export type Ms21Gates = {
  drainageCompletenessPass: boolean;
  trunkRiverPass: boolean;
  dynamicRangePass: boolean;
  curvaturePass: boolean;
  hillshadeSeamPass: boolean;
  pass: boolean;
  reasons: string[];
};

export type Ms21Result = {
  metrics: Ms21Metrics;
  gates: Ms21Gates;
};

export function evaluateMs21Realism(map: GeneratedContinent): Ms21Result {
  const drainage = computeDrainage(map);
  const elev = elevationStats(map);
  const curvature = curvatureStats(map);
  const seamScore = hillshadeEdgeDiscontinuity(map);

  const metrics: Ms21Metrics = {
    sink_count: drainage.sinkCount,
    sink_fraction: drainage.sinkFraction,
    drain_to_ocean_fraction: drainage.drainToOceanFraction,
    max_flow_acc_values: drainage.topValues.map((v) => (Number.isFinite(v) ? v : 0)),
    max_flow_acc_reach_ocean: drainage.topReachOcean,
    trunk_river_lengths: drainage.trunkLengths,
    elevation_spread_above_sea: elev.spreadAboveSea,
    stddev_above_sea: elev.stddevAboveSea,
    curvature_stats: {
      concave_count: curvature.concaveCount,
      convex_count: curvature.convexCount,
      ratio: curvature.ratio,
    },
    ridge_valley_relief_mean: curvature.ridgeValleyReliefMean,
    hillshade_edge_discontinuity_score: seamScore,
  };

  const reasons: string[] = [];
  const drainageCompletenessPass = metrics.drain_to_ocean_fraction >= 0.985 && metrics.sink_fraction <= 0.015;
  if (!drainageCompletenessPass) reasons.push('conditioning');

  const requiresTrunk =
    map.controls.size !== 'isle' &&
    map.controls.landFraction >= 4 &&
    map.controls.relief >= 5;
  const topReachCount = metrics.max_flow_acc_reach_ocean.filter(Boolean).length;
  const maxTrunkLength = Math.max(...metrics.trunk_river_lengths, 0);
  const trunkMin = Math.round(Math.max(map.width, map.height) * 0.06);
  const trunkRiverPass = !requiresTrunk || (topReachCount >= 2 && maxTrunkLength >= trunkMin);
  if (!trunkRiverPass) reasons.push('incision');

  const dynamicRangePass = metrics.elevation_spread_above_sea >= 0.08 && metrics.stddev_above_sea >= 0.03;
  if (!dynamicRangePass) reasons.push('sea-level');

  const curvaturePass =
    metrics.curvature_stats.concave_count >= 120 &&
    metrics.curvature_stats.convex_count >= 120 &&
    metrics.curvature_stats.ratio >= 0.35 &&
    metrics.curvature_stats.ratio <= 2.8;
  if (!curvaturePass) reasons.push('diffusion');

  const hillshadeSeamPass = metrics.hillshade_edge_discontinuity_score <= 2.2;
  if (!hillshadeSeamPass) reasons.push('hillshade');

  return {
    metrics,
    gates: {
      drainageCompletenessPass,
      trunkRiverPass,
      dynamicRangePass,
      curvaturePass,
      hillshadeSeamPass,
      pass: drainageCompletenessPass && trunkRiverPass && dynamicRangePass && curvaturePass && hillshadeSeamPass,
      reasons,
    },
  };
}

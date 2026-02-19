import type { ContinentControls } from './continent';
import { computeFlowFields, conditionHydrology } from './hydrology';
import { runIncisionDiffusion } from './erosion';

export type DemCoreInput = {
  width: number;
  height: number;
  seed: number;
  controls: ContinentControls;
};

export type DemCoreState = {
  demBase: Float32Array;
  demConditioned: Float32Array;
  demEroded: Float32Array;
  demFinal: Float32Array;
  seaLevel: number;
  land: Uint8Array;
  ocean: Uint8Array;
  lake: Uint8Array;
  river: Uint8Array;
  flowDirection: Int32Array;
  flowAccumulation: Float32Array;
  flowNormalized: Float32Array;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function hashInts(seed: number, x: number, y: number, salt: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function latticeValue(seed: number, x: number, y: number): number {
  const h = hashInts(seed, x, y, 0x9e3779b9);
  return (h & 0xfffffff) / 0xfffffff;
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = latticeValue(seed, x0, y0);
  const v10 = latticeValue(seed, x1, y0);
  const v01 = latticeValue(seed, x0, y1);
  const v11 = latticeValue(seed, x1, y1);
  const ix0 = lerp(v00, v10, tx);
  const ix1 = lerp(v01, v11, tx);
  return lerp(ix0, ix1, ty);
}

function fbm(seed: number, x: number, y: number, octaves: number, persistence: number, lacunarity: number): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let i = 0; i < octaves; i += 1) {
    const octaveSeed = (seed + Math.imul(i + 1, 0x85ebca6b)) >>> 0;
    total += valueNoise(octaveSeed, x * frequency, y * frequency) * amplitude;
    weight += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / Math.max(1e-6, weight);
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { distance: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = abx * abx + aby * aby;
  if (denom <= 1e-6) {
    return { distance: Math.hypot(px - ax, py - ay), t: 0 };
  }
  const t = clamp((apx * abx + apy * aby) / denom, 0, 1);
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return { distance: Math.hypot(px - qx, py - qy), t };
}

function edgeFalloff(nx: number, ny: number): number {
  const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
  return smoothstep(edgeDistance / 0.16);
}

type Belt = {
  points: Array<{ x: number; y: number }>;
  width: number;
  amplitude: number;
  compressionSide: -1 | 1;
  basinAmplitude: number;
  basinWidth: number;
};

function buildBelt(
  rng: () => number,
  width: number,
  height: number,
  reliefNorm: number,
  dominant: boolean,
): Belt {
  const side = Math.floor(rng() * 4);
  const opposite = (side + 2) % 4;

  const pointOnSide = (s: number): { x: number; y: number } => {
    const t = 0.1 + rng() * 0.8;
    if (s === 0) return { x: width * t, y: 0 };
    if (s === 1) return { x: width - 1, y: height * t };
    if (s === 2) return { x: width * t, y: height - 1 };
    return { x: 0, y: height * t };
  };

  const p0 = pointOnSide(side);
  const p3 = pointOnSide(opposite);
  const p1 = {
    x: lerp(p0.x, p3.x, 0.33) + (rng() - 0.5) * width * 0.22,
    y: lerp(p0.y, p3.y, 0.33) + (rng() - 0.5) * height * 0.22,
  };
  const p2 = {
    x: lerp(p0.x, p3.x, 0.66) + (rng() - 0.5) * width * 0.22,
    y: lerp(p0.y, p3.y, 0.66) + (rng() - 0.5) * height * 0.22,
  };

  const points: Array<{ x: number; y: number }> = [];
  const samples = 20;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const omt = 1 - t;
    const x = omt * omt * omt * p0.x + 3 * omt * omt * t * p1.x + 3 * omt * t * t * p2.x + t * t * t * p3.x;
    const y = omt * omt * omt * p0.y + 3 * omt * omt * t * p1.y + 3 * omt * t * t * p2.y + t * t * t * p3.y;
    points.push({ x, y });
  }

  return {
    points,
    width: Math.min(width, height) * (0.032 + rng() * 0.03),
    amplitude: (0.95 + reliefNorm * 0.9 + rng() * 0.6) * (dominant ? 1.8 : 1),
    compressionSide: rng() < 0.5 ? -1 : 1,
    basinAmplitude: 0, // assigned in builder to preserve dominant relationship
    basinWidth: 0, // assigned in builder to preserve dominant relationship
  };
}

function applyBelts(base: Float32Array, width: number, height: number, belts: Belt[]): void {
  for (const belt of belts) {
    const radius = Math.max(2, Math.max(belt.width, belt.basinWidth) * 2.8);
    for (let i = 0; i < belt.points.length - 1; i += 1) {
      const a = belt.points[i];
      const b = belt.points[i + 1];
      const minX = clamp(Math.floor(Math.min(a.x, b.x) - radius), 0, width - 1);
      const maxX = clamp(Math.ceil(Math.max(a.x, b.x) + radius), 0, width - 1);
      const minY = clamp(Math.floor(Math.min(a.y, b.y) - radius), 0, height - 1);
      const maxY = clamp(Math.ceil(Math.max(a.y, b.y) + radius), 0, height - 1);

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          const d = distanceToSegment(px, py, a.x, a.y, b.x, b.y);
          const nd = d.distance / Math.max(1e-6, belt.width);
          const basinNd = d.distance / Math.max(1e-6, belt.basinWidth);
          if (nd > 2.7 && basinNd > 2.8) {
            continue;
          }

          const tx = b.x - a.x;
          const ty = b.y - a.y;
          const tLen = Math.hypot(tx, ty) || 1;
          const nx = -ty / tLen;
          const ny = tx / tLen;
          const signed = (px - a.x) * nx + (py - a.y) * ny;
          const forelandWeight = belt.compressionSide * signed > 0 ? 1 : 0;

          const along = d.t;
          const massif = 0.58 + 0.42 * Math.sin((along + 0.07 * i) * Math.PI);
          const ridgeProfile = Math.exp(-Math.pow(nd, 1.35));
          const ridgeSharp = Math.max(0, 1 - nd * 0.95);
          const ridgeContribution = belt.amplitude * massif * (ridgeProfile * 0.68 + ridgeSharp * ridgeSharp * 0.32);

          const basinProfile = forelandWeight * Math.exp(-Math.pow(basinNd, 1.25));
          const basinContribution = belt.basinAmplitude * basinProfile;
          base[y * width + x] += ridgeContribution - basinContribution;
        }
      }
    }
  }
}

function applyGaussians(
  field: Float32Array,
  width: number,
  height: number,
  count: number,
  rng: () => number,
  amplitudeMin: number,
  amplitudeMax: number,
  sigmaMin: number,
  sigmaMax: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const cx = width * (0.15 + rng() * 0.7);
    const cy = height * (0.15 + rng() * 0.7);
    const sx = Math.min(width, height) * lerp(sigmaMin, sigmaMax, rng());
    const sy = Math.min(width, height) * lerp(sigmaMin, sigmaMax, rng());
    const amplitude = lerp(amplitudeMin, amplitudeMax, rng());
    const invX = 1 / Math.max(1e-6, sx * sx * 2);
    const invY = 1 / Math.max(1e-6, sy * sy * 2);

    const minX = clamp(Math.floor(cx - sx * 3), 0, width - 1);
    const maxX = clamp(Math.ceil(cx + sx * 3), 0, width - 1);
    const minY = clamp(Math.floor(cy - sy * 3), 0, height - 1);
    const maxY = clamp(Math.ceil(cy + sy * 3), 0, height - 1);

    for (let y = minY; y <= maxY; y += 1) {
      const dy = y + 0.5 - cy;
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x + 0.5 - cx;
        const weight = Math.exp(-(dx * dx * invX + dy * dy * invY));
        field[y * width + x] += amplitude * weight;
      }
    }
  }
}

function buildMacroDem(input: DemCoreInput): Float32Array {
  const { width, height, seed, controls } = input;
  const total = width * height;
  const dem = new Float32Array(total);
  const rng = mulberry32(seed ^ 0x6a09e667);
  const reliefNorm = (controls.relief - 1) / 9;
  const fragNorm = (controls.fragmentation - 1) / 9;

  const tiltAngle = rng() * Math.PI * 2;
  const tiltX = Math.cos(tiltAngle);
  const tiltY = Math.sin(tiltAngle);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const macroNoise = (fbm(seed ^ 0x5be0cd19, nx * 1.7, ny * 1.7, 4, 0.58, 2.02) - 0.5) * (0.28 + reliefNorm * 0.12);
      const regionalNoise = (fbm(seed ^ 0x1f83d9ab, nx * 4.2, ny * 4.2, 3, 0.56, 2.1) - 0.5) * (0.16 + fragNorm * 0.1);
      dem[index] = macroNoise + regionalNoise;
    }
  }

  const beltCount = clamp(2 + Math.round(reliefNorm * 2), 2, 4);
  const belts: Belt[] = [];
  const dominantBelt = Math.floor(rng() * beltCount);
  for (let i = 0; i < beltCount; i += 1) {
    const dominant = i === dominantBelt;
    const belt = buildBelt(rng, width, height, reliefNorm, dominant);
    belt.basinAmplitude = belt.amplitude * (0.3 + rng() * 0.3);
    belt.basinWidth = belt.width * (1.5 + rng() * 0.5);
    belts.push(belt);
  }
  applyBelts(dem, width, height, belts);

  let peakBelt = 1;
  for (const belt of belts) {
    peakBelt = Math.max(peakBelt, belt.amplitude);
  }
  const continentalTilt = peakBelt * (0.01 + rng() * 0.02);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      dem[y * width + x] += ((nx - 0.5) * tiltX + (ny - 0.5) * tiltY) * continentalTilt;
    }
  }

  const cratonCount = clamp(1 + Math.round((1 - fragNorm) * 2), 1, 3);
  applyGaussians(dem, width, height, cratonCount, rng, 0.22, 0.45, 0.14, 0.24);

  const basinCount = clamp(1 + Math.round(fragNorm * 2), 1, 3);
  applyGaussians(dem, width, height, basinCount, rng, -0.56, -0.24, 0.09, 0.18);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const edge = edgeFalloff(nx, ny);
      dem[index] = dem[index] * edge - (1 - edge) * 0.62;
    }
  }

  return dem;
}

function edgeOutletMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    mask[x] = 1;
    mask[(height - 1) * width + x] = 1;
  }
  for (let y = 0; y < height; y += 1) {
    mask[y * width] = 1;
    mask[y * width + width - 1] = 1;
  }
  return mask;
}

function quantizedThreshold(values: Float32Array, upperRatio: number): number {
  const bins = 4096;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  const span = Math.max(1e-6, max - min);
  const histogram = new Uint32Array(bins);
  for (let i = 0; i < values.length; i += 1) {
    const q = clamp(Math.floor(((values[i] - min) / span) * (bins - 1)), 0, bins - 1);
    histogram[q] += 1;
  }
  const target = Math.round(clamp01(upperRatio) * values.length);
  let acc = 0;
  let cut = bins - 1;
  for (let b = bins - 1; b >= 0; b -= 1) {
    acc += histogram[b];
    if (acc >= target) {
      cut = b;
      break;
    }
  }
  return min + (cut / Math.max(1, bins - 1)) * span;
}

function smoothCoastalBand(
  width: number,
  height: number,
  elevation: Float32Array,
  seaLevel: number,
  coastalSmoothing: number,
): Float32Array {
  const smooth = (coastalSmoothing - 1) / 9;
  const passes = 1 + Math.round(smooth * 2);
  const band = lerp(0.015, 0.08, smooth);
  let current = elevation.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const delta = Math.abs(current[index] - seaLevel);
        if (delta > band) {
          continue;
        }
        const avg = (
          current[index - 1] +
          current[index + 1] +
          current[index - width] +
          current[index + width]
        ) * 0.25;
        const strength = smoothstep(1 - delta / Math.max(1e-6, band)) * (0.04 + smooth * 0.14);
        next[index] = lerp(current[index], avg, strength);
      }
    }
    current = next;
  }
  return current;
}

function floodOcean(width: number, height: number, water: Uint8Array): { ocean: Uint8Array; lake: Uint8Array } {
  const total = width * height;
  const ocean = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const index = y * width + x;
    if (water[index] === 0 || ocean[index] === 1) {
      return;
    }
    ocean[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const current = queue[head];
    head += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  const lake = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (water[i] === 1 && ocean[i] === 0) {
      lake[i] = 1;
    }
  }
  return { ocean, lake };
}

function buildMasks(
  width: number,
  height: number,
  elevation: Float32Array,
  seaLevel: number,
): { land: Uint8Array; water: Uint8Array } {
  const total = width * height;
  const land = new Uint8Array(total);
  const water = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    const isLand = elevation[i] > seaLevel ? 1 : 0;
    land[i] = isLand;
    water[i] = isLand === 1 ? 0 : 1;
  }
  for (let x = 0; x < width; x += 1) {
    land[x] = 0;
    land[(height - 1) * width + x] = 0;
  }
  for (let y = 0; y < height; y += 1) {
    land[y * width] = 0;
    land[y * width + width - 1] = 0;
  }
  for (let i = 0; i < total; i += 1) {
    water[i] = land[i] === 1 ? 0 : 1;
  }
  return { land, water };
}

export function createEmptyDemState(width: number, height: number): DemCoreState {
  const total = width * height;
  return {
    demBase: new Float32Array(total),
    demConditioned: new Float32Array(total),
    demEroded: new Float32Array(total),
    demFinal: new Float32Array(total),
    seaLevel: 0,
    land: new Uint8Array(total),
    ocean: new Uint8Array(total),
    lake: new Uint8Array(total),
    river: new Uint8Array(total),
    flowDirection: new Int32Array(total),
    flowAccumulation: new Float32Array(total),
    flowNormalized: new Float32Array(total),
  };
}

export function generateDemCore(input: DemCoreInput): DemCoreState {
  const state = createEmptyDemState(input.width, input.height);
  state.demBase = buildMacroDem(input);
  const outlets = edgeOutletMask(input.width, input.height);
  const conditioned = conditionHydrology(input.width, input.height, state.demBase, 'drain-mostly', outlets);
  const reliefNorm = (input.controls.relief - 1) / 9;
  const sizeIterations =
    input.controls.size === 'isle'
      ? 14
      : input.controls.size === 'region'
        ? 18
        : input.controls.size === 'subcontinent'
          ? 21
          : 24;
  const eroded = runIncisionDiffusion(input.width, input.height, conditioned.elevation, {
    iterations: sizeIterations,
    incisionK: 0.0052 + reliefNorm * 0.0058,
    diffusionK: 0.034 - reliefNorm * 0.014,
    channelThreshold: 0.135,
    m: 0.72,
    n: 1.02,
  }, outlets);
  const landFractionNorm = (input.controls.landFraction - 1) / 9;
  const targetLand = 0.12 + landFractionNorm * 0.72;
  const seaLevel = quantizedThreshold(eroded.elevation, targetLand);
  const demFinal = smoothCoastalBand(
    input.width,
    input.height,
    eroded.elevation,
    seaLevel,
    input.controls.coastalSmoothing,
  );
  let masks = buildMasks(input.width, input.height, demFinal, seaLevel);
  let oceanFlood = floodOcean(input.width, input.height, masks.water);
  const conditionedFinal = conditionHydrology(
    input.width,
    input.height,
    demFinal,
    'drain-mostly',
    oceanFlood.ocean,
  );
  const demHydro = conditionedFinal.elevation;
  masks = buildMasks(input.width, input.height, demHydro, seaLevel);
  oceanFlood = floodOcean(input.width, input.height, masks.water);
  const finalFlow = computeFlowFields(input.width, input.height, demHydro, oceanFlood.ocean);

  const river = new Uint8Array(input.width * input.height);
  const riverThreshold = 0.2 + (1 - landFractionNorm) * 0.05;
  for (let i = 0; i < river.length; i += 1) {
    river[i] = masks.land[i] === 1 && finalFlow.flowNorm[i] >= riverThreshold ? 1 : 0;
  }
  state.demConditioned = conditioned.elevation;
  state.demEroded = eroded.elevation;
  state.demFinal = demHydro;
  state.seaLevel = seaLevel;
  state.land = masks.land;
  state.ocean = oceanFlood.ocean;
  state.lake = oceanFlood.lake;
  state.river = river;
  state.flowDirection = finalFlow.downstream;
  state.flowAccumulation = finalFlow.accumulation;
  state.flowNormalized = finalFlow.flowNorm;
  return state;
}

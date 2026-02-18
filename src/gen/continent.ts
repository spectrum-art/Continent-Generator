export type SizeOption = 'isle' | 'region' | 'subcontinent' | 'supercontinent';
export type AspectRatioOption = 'wide' | 'landscape' | 'square' | 'portrait' | 'narrow';

export type BiomeMix = {
  rivers: number;
  grassland: number;
  temperateForest: number;
  rainforest: number;
  desert: number;
  mountains: number;
  tundra: number;
};

export type ContinentControls = {
  seed: string;
  size: SizeOption;
  aspectRatio: AspectRatioOption;
  landFraction: number;
  relief: number;
  fragmentation: number;
  coastalSmoothing: number;
  latitudeCenter: number;
  latitudeSpan: number;
  plateCount: number;
  mountainPeakiness: number;
  climateBias: number;
  islandDensity: number;
  biomeMix: BiomeMix;
};

export const BIOME_TYPES = [
  'ocean',
  'lake',
  'beach',
  'river',
  'grassland',
  'temperate-forest',
  'rainforest',
  'desert',
  'tundra',
  'mountain',
  'rock',
] as const;

export type ContinentBiome = (typeof BIOME_TYPES)[number];

export type GeneratedContinent = {
  controls: ContinentControls;
  normalizedSeed: string;
  width: number;
  height: number;
  fieldScale: number;
  seaLevel: number;
  elevation: Float32Array;
  ridge: Float32Array;
  slope: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  light: Float32Array;
  flow: Float32Array;
  biome: Uint8Array;
  land: Uint8Array;
  ocean: Uint8Array;
  lake: Uint8Array;
  river: Uint8Array;
  distanceToOcean: Uint16Array;
  distanceToLand: Uint16Array;
  landArea: number;
  coastPerimeter: number;
  identityHash: string;
  controlsHash: string;
};

export type ExportPayload = {
  code: string;
  controls: ContinentControls;
};

type Plate = {
  x: number;
  y: number;
  uplift: number;
  driftX: number;
  driftY: number;
};

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

const ADJECTIVES = [
  'Amber', 'Ancient', 'Azure', 'Bold', 'Brisk', 'Calm', 'Crimson', 'Dawn', 'Dusky', 'Emerald',
  'Feral', 'Golden', 'Grand', 'Green', 'Hidden', 'Iron', 'Ivory', 'Jagged', 'Lone', 'Misty',
  'Noble', 'Northern', 'Obsidian', 'Pale', 'Quiet', 'Red', 'Rugged', 'Rusty', 'Sacred', 'Sandy',
  'Silent', 'Silver', 'Slate', 'Solar', 'Southern', 'Stone', 'Stormy', 'Summer', 'Swift', 'Tall',
  'Umber', 'Verdant', 'Vivid', 'Warm', 'Western', 'Wild', 'Winter', 'Wise',
] as const;

const NOUNS = [
  'Anchor', 'Arch', 'Bay', 'Beacon', 'Bluff', 'Cape', 'Chair', 'Cinder', 'Cliff', 'Coast',
  'Comet', 'Cove', 'Crown', 'Delta', 'Dune', 'Field', 'Fjord', 'Forest', 'Grove', 'Harbor',
  'Haven', 'Heights', 'Hollow', 'Island', 'Lagoon', 'Lake', 'March', 'Meadow', 'Mesa', 'Pass',
  'Peak', 'Pillar', 'Plain', 'Ridge', 'River', 'Saddle', 'Sea', 'Shore', 'Sound', 'Spire',
  'Summit', 'Trail', 'Vale', 'Watch', 'Wave', 'Woods',
] as const;

const SIZE_CONFIG: Record<SizeOption, { shortEdge: number; basePlates: number; fieldScale: number }> = {
  isle: { shortEdge: 240, basePlates: 6, fieldScale: 4 },
  region: { shortEdge: 360, basePlates: 9, fieldScale: 3 },
  subcontinent: { shortEdge: 560, basePlates: 13, fieldScale: 2 },
  supercontinent: { shortEdge: 760, basePlates: 18, fieldScale: 1 },
};

const OUTPUT_SCALE = 2;

const ASPECT_CONFIG: Record<AspectRatioOption, number> = {
  wide: 2,
  landscape: 1.5,
  square: 1,
  portrait: 2 / 3,
  narrow: 0.5,
};

const BIOME_INDEX: Record<ContinentBiome, number> = BIOME_TYPES.reduce((acc, biome, index) => {
  acc[biome] = index;
  return acc;
}, {} as Record<ContinentBiome, number>);

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

function smoothRange(value: number, min: number, max: number): number {
  if (max <= min) {
    return value <= min ? 0 : 1;
  }
  return smoothstep((value - min) / (max - min));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
  for (let octave = 0; octave < octaves; octave += 1) {
    const octaveSeed = (seed + Math.imul(octave + 1, 0x85ebca6b)) >>> 0;
    total += valueNoise(octaveSeed, x * frequency, y * frequency) * amplitude;
    weight += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / Math.max(1e-6, weight);
}

function ridgedFbm(
  seed: number,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const octaveSeed = (seed + Math.imul(octave + 1, 0x9e3779b9)) >>> 0;
    const v = valueNoise(octaveSeed, x * frequency, y * frequency) * 2 - 1;
    const ridge = 1 - Math.abs(v);
    total += ridge * ridge * amplitude;
    weight += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / Math.max(1e-6, weight);
}

function normalizeSeed(seed: string): string {
  const trimmed = seed.trim();
  if (trimmed.length === 0) {
    return 'default';
  }
  return trimmed.toLowerCase();
}

function titleCaseWord(word: string): string {
  if (word.length === 0) {
    return word;
  }
  return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
}

export function canonicalSeedDisplay(seed: string): string {
  return titleCaseWord(normalizeSeed(seed));
}

export function createHumanSeed(randomValue?: number): string {
  const rand = randomValue ?? Math.random();
  const a = Math.floor(Math.abs(rand) * ADJECTIVES.length) % ADJECTIVES.length;
  const b = Math.floor(Math.abs((rand * 1_000_003) % 1) * NOUNS.length) % NOUNS.length;
  return `${ADJECTIVES[a]}${NOUNS[b]}`;
}

export function randomHumanSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bucket = new Uint32Array(2);
    crypto.getRandomValues(bucket);
    return `${ADJECTIVES[bucket[0] % ADJECTIVES.length]}${NOUNS[bucket[1] % NOUNS.length]}`;
  }
  return createHumanSeed(Math.random());
}

export const DEFAULT_CONTROLS: ContinentControls = {
  seed: randomHumanSeed(),
  size: 'region',
  aspectRatio: 'landscape',
  landFraction: 5,
  relief: 6,
  fragmentation: 4,
  coastalSmoothing: 6,
  latitudeCenter: 50,
  latitudeSpan: 45,
  plateCount: 0,
  mountainPeakiness: 5,
  climateBias: 0,
  islandDensity: 4,
  biomeMix: {
    rivers: 0.6,
    grassland: 1,
    temperateForest: 1,
    rainforest: 0.5,
    desert: 0.6,
    mountains: 0.7,
    tundra: 0.3,
  },
};

function cloneControls(controls: ContinentControls): ContinentControls {
  return {
    ...controls,
    biomeMix: { ...controls.biomeMix },
  };
}

function clampControls(input: ContinentControls): ContinentControls {
  const output = cloneControls(input);
  output.seed = output.seed.trim().length > 0 ? output.seed.trim() : 'DefaultSeed';
  output.landFraction = Math.round(clamp(output.landFraction, 1, 10));
  output.relief = Math.round(clamp(output.relief, 1, 10));
  output.fragmentation = Math.round(clamp(output.fragmentation, 1, 10));
  output.coastalSmoothing = Math.round(clamp(output.coastalSmoothing, 1, 10));
  output.latitudeCenter = Math.round(clamp(output.latitudeCenter, -70, 70));
  output.latitudeSpan = Math.round(clamp(output.latitudeSpan, 20, 180));
  output.plateCount = Math.round(clamp(output.plateCount, -1, 1));
  output.mountainPeakiness = Math.round(clamp(output.mountainPeakiness, 1, 10));
  output.climateBias = Math.round(clamp(output.climateBias, -5, 5));
  output.islandDensity = Math.round(clamp(output.islandDensity, 0, 10));

  output.biomeMix.rivers = clamp(output.biomeMix.rivers, 0, 1);
  output.biomeMix.grassland = clamp(output.biomeMix.grassland, 0, 1);
  output.biomeMix.temperateForest = clamp(output.biomeMix.temperateForest, 0, 1);
  output.biomeMix.rainforest = clamp(output.biomeMix.rainforest, 0, 1);
  output.biomeMix.desert = clamp(output.biomeMix.desert, 0, 1);
  output.biomeMix.mountains = clamp(output.biomeMix.mountains, 0, 1);
  output.biomeMix.tundra = clamp(output.biomeMix.tundra, 0, 1);
  return output;
}

export function randomizeControls(base: ContinentControls): ContinentControls {
  const next = cloneControls(base);
  const rng = mulberry32(hashString(`${normalizeSeed(base.seed)}|randomize|${Date.now()}`));
  next.landFraction = 1 + Math.floor(rng() * 10);
  next.relief = 1 + Math.floor(rng() * 10);
  next.fragmentation = 1 + Math.floor(rng() * 10);
  next.coastalSmoothing = 1 + Math.floor(rng() * 10);
  next.latitudeCenter = Math.round(lerp(-70, 70, rng()));
  next.latitudeSpan = Math.round(lerp(20, 180, rng()));
  next.plateCount = Math.round(lerp(-1, 1, rng()));
  next.mountainPeakiness = 1 + Math.floor(rng() * 10);
  next.climateBias = Math.round(lerp(-5, 5, rng()));
  next.islandDensity = Math.round(lerp(0, 10, rng()));
  next.biomeMix.rivers = clamp(rng(), 0, 1);
  next.biomeMix.grassland = clamp(rng(), 0, 1);
  next.biomeMix.temperateForest = clamp(rng(), 0, 1);
  next.biomeMix.rainforest = clamp(rng(), 0, 1);
  next.biomeMix.desert = clamp(rng(), 0, 1);
  next.biomeMix.mountains = clamp(rng(), 0, 1);
  next.biomeMix.tundra = clamp(rng(), 0, 1);
  return clampControls(next);
}

export function resetBiomeMix(base: ContinentControls): ContinentControls {
  const next = cloneControls(base);
  next.biomeMix = { ...DEFAULT_CONTROLS.biomeMix };
  return clampControls(next);
}

export function defaultControlsWithSeed(seed?: string): ContinentControls {
  const controls = cloneControls(DEFAULT_CONTROLS);
  controls.seed = seed && seed.trim().length > 0 ? seed.trim() : randomHumanSeed();
  return controls;
}

export function mapDimensions(size: SizeOption, aspectRatio: AspectRatioOption): {
  width: number;
  height: number;
  basePlates: number;
  fieldScale: number;
} {
  const sizeConfig = SIZE_CONFIG[size];
  const ratio = ASPECT_CONFIG[aspectRatio];
  let width: number;
  let height: number;
  if (ratio >= 1) {
    height = sizeConfig.shortEdge;
    width = Math.round(sizeConfig.shortEdge * ratio);
  } else {
    width = sizeConfig.shortEdge;
    height = Math.round(sizeConfig.shortEdge / ratio);
  }
  width = Math.max(96, width);
  height = Math.max(96, height);
  width *= OUTPUT_SCALE;
  height *= OUTPUT_SCALE;
  return {
    width,
    height,
    basePlates: sizeConfig.basePlates,
    fieldScale: sizeConfig.fieldScale,
  };
}

function downsampleField(
  outWidth: number,
  outHeight: number,
  sampleScale: number,
  sampler: (sx: number, sy: number) => number,
): Float32Array {
  const result = new Float32Array(outWidth * outHeight);
  const sampleCount = sampleScale * sampleScale;
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      let sum = 0;
      for (let sy = 0; sy < sampleScale; sy += 1) {
        for (let sx = 0; sx < sampleScale; sx += 1) {
          const fx = x + (sx + 0.5) / sampleScale;
          const fy = y + (sy + 0.5) / sampleScale;
          sum += sampler(fx, fy);
        }
      }
      result[y * outWidth + x] = sum / sampleCount;
    }
  }
  return result;
}

function upsampleBilinearField(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Float32Array {
  const target = new Float32Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = (y / Math.max(1, targetHeight - 1)) * Math.max(1, sourceHeight - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = (x / Math.max(1, targetWidth - 1)) * Math.max(1, sourceWidth - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const tx = sx - x0;

      const v00 = source[y0 * sourceWidth + x0];
      const v10 = source[y0 * sourceWidth + x1];
      const v01 = source[y1 * sourceWidth + x0];
      const v11 = source[y1 * sourceWidth + x1];
      const vx0 = lerp(v00, v10, tx);
      const vx1 = lerp(v01, v11, tx);
      target[y * targetWidth + x] = lerp(vx0, vx1, ty);
    }
  }
  return target;
}

function normalizeSigned(values: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = clamp(((values[i] - min) / span) * 2 - 1, -1, 1);
  }
}

function applyEdgeFalloff(
  width: number,
  height: number,
  elevationSigned: Float32Array,
  seed: number,
): void {
  const aspect = width / Math.max(1, height);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
      const edgeWarp = (fbm(seed ^ 0x41f235ab, nx * 3.2, ny * 3.2, 2, 0.56, 2.1) - 0.5) * 0.04;
      const edgeField = smoothRange(edge + edgeWarp, 0.02, 0.215);
      const edgeFalloff = Math.pow(1 - edgeField, 2.1);

      const cx = (nx - 0.5) * 2 * aspect;
      const cy = (ny - 0.5) * 2;
      const warpX = (fbm(seed ^ 0x11e934b9, nx * 2.4, ny * 2.4, 2, 0.57, 2.1) - 0.5) * 0.34;
      const warpY = (fbm(seed ^ 0x7e20ad5d, nx * 2.8, ny * 2.8, 2, 0.57, 2.1) - 0.5) * 0.34;
      const wx = cx + warpX;
      const wy = cy + warpY;
      const power = 2.25 + fbm(seed ^ 0xa3d83b11, nx * 1.6, ny * 1.6, 2, 0.55, 2.1) * 1.35;
      const radial = Math.pow(Math.pow(Math.abs(wx), power) + Math.pow(Math.abs(wy), power), 1 / power);
      const boundary = 0.98 + (fbm(seed ^ 0x4d7b128f, nx * 3.6, ny * 3.6, 2, 0.56, 2.1) - 0.5) * 0.3;
      const interior = smoothRange(boundary - radial, -0.35, 0.36);
      const frameFalloff = Math.pow(1 - interior, 1.85);

      const falloff = Math.max(edgeFalloff, frameFalloff * 0.88);
      elevationSigned[index] -= falloff * 0.98;
    }
  }
}

function applyRidgeValleySynthesis(
  width: number,
  height: number,
  elevationSigned: Float32Array,
  seed: number,
  reliefNorm: number,
  peakNorm: number,
  fragNorm: number,
  stressField: Float32Array,
  stressDirX: Float32Array,
  stressDirY: Float32Array,
): void {
  const warpSeed = seed ^ 0x2bc6d1e3;
  const ridgeSeed = seed ^ 0x7193b5d7;
  const spurSeed = seed ^ 0xc2a4518d;

  const next = elevationSigned.slice();
  for (let y = 1; y < height - 1; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 1; x < width - 1; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const current = elevationSigned[index];
      const localStress = clamp01(stressField[index]);
      const mountainMask = smoothRange(current, -0.03 + fragNorm * 0.02, 0.62) * (0.45 + localStress * 0.75);
      if (mountainMask <= 0) {
        continue;
      }

      const cosA = stressDirX[index];
      const sinA = stressDirY[index];
      const dirLen = Math.hypot(cosA, sinA);
      if (dirLen < 1e-5) {
        continue;
      }

      const warpX = (fbm(warpSeed, nx * 4.8, ny * 4.8, 2, 0.55, 2.15) - 0.5) * 0.09;
      const warpY = (fbm(warpSeed ^ 0x93a7, nx * 4.2, ny * 4.2, 2, 0.55, 2.15) - 0.5) * 0.09;
      const wx = nx + warpX;
      const wy = ny + warpY;

      const rx = wx * cosA - wy * sinA;
      const ry = wx * sinA + wy * cosA;
      const ridgePrimary = ridgedFbm(
        ridgeSeed,
        rx * (13.8 + localStress * 9.2),
        ry * (5.2 + localStress * 3.4),
        4,
        0.58,
        2.05,
      );
      const rangeSpine = ridgedFbm(
        ridgeSeed ^ 0x73b,
        rx * (6.2 + localStress * 2.4),
        ry * (1.9 + localStress * 1.1),
        3,
        0.6,
        2.02,
      );
      const ridgeSpur = ridgedFbm(
        spurSeed,
        rx * (22.5 + localStress * 8.4) + wy * 2.1,
        ry * (8.8 + localStress * 3.6),
        2,
        0.55,
        2.2,
      );
      const branchSpine = Math.pow(clamp01(rangeSpine), 1.15 + peakNorm * 0.35);
      const ridgeMix = ridgePrimary * 0.57 + ridgeSpur * 0.23 + branchSpine * 0.2;
      const ridgeSigned = (ridgeMix - 0.5) * 2;

      const amplitude =
        (0.024 + reliefNorm * 0.11 + peakNorm * 0.12) *
        mountainMask *
        (0.54 + localStress * 0.88) *
        (0.74 + branchSpine * 0.55);
      const valleyDepth = (1 - ridgeMix) * (0.011 + reliefNorm * 0.052 + peakNorm * 0.034) * mountainMask;
      next[index] = current + ridgeSigned * amplitude - valleyDepth;
    }
  }

  elevationSigned.set(next);
}

function buildGlobalStressField(
  width: number,
  height: number,
  plates: Plate[],
  aspectMetric: number,
  seed: number,
): { stress: Float32Array; dirX: Float32Array; dirY: Float32Array } {
  const total = width * height;
  const stress = new Float32Array(total);
  const dirX = new Float32Array(total);
  const dirY = new Float32Array(total);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const plate = sampleContinuousPlateField(plates, nx, ny, aspectMetric);
      const angleNoise = (fbm(seed ^ 0x6ab329f1, nx * 1.8, ny * 1.8, 3, 0.58, 2.07) - 0.5) * Math.PI * 0.78;
      const baseAngle = Math.atan2(plate.driftY, plate.driftX) + angleNoise;
      dirX[index] = Math.cos(baseAngle);
      dirY[index] = Math.sin(baseAngle);
      const stressNoise = Math.abs(fbm(seed ^ 0x57d13ca7, nx * 2.3, ny * 2.3, 3, 0.56, 2.08) - 0.5) * 2;
      stress[index] = clamp01((1 - plate.coherence) * 0.78 + stressNoise * 0.35);
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const stressNext = stress.slice();
    const dirXNext = dirX.slice();
    const dirYNext = dirY.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const left = index - 1;
        const right = index + 1;
        const up = index - width;
        const down = index + width;
        stressNext[index] = (stress[index] * 0.5 + stress[left] + stress[right] + stress[up] + stress[down]) / 4.5;
        const smoothedX = (dirX[index] * 0.5 + dirX[left] + dirX[right] + dirX[up] + dirX[down]) / 4.5;
        const smoothedY = (dirY[index] * 0.5 + dirY[left] + dirY[right] + dirY[up] + dirY[down]) / 4.5;
        const len = Math.hypot(smoothedX, smoothedY) || 1;
        dirXNext[index] = smoothedX / len;
        dirYNext[index] = smoothedY / len;
      }
    }
    stress.set(stressNext);
    dirX.set(dirXNext);
    dirY.set(dirYNext);
  }

  return { stress, dirX, dirY };
}

function histogramThresholdSigned(values: Float32Array, targetLand: number): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  const bins = 2048;
  const histogram = new Uint32Array(bins);
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < values.length; i += 1) {
    const normalized = clamp01((values[i] - min) / span);
    const bin = clamp(Math.floor(normalized * (bins - 1)), 0, bins - 1);
    histogram[bin] += 1;
  }

  const targetCells = Math.round(clamp(targetLand, 0, 1) * values.length);
  let covered = 0;
  let thresholdBin = bins - 1;
  for (let bin = bins - 1; bin >= 0; bin -= 1) {
    covered += histogram[bin];
    if (covered >= targetCells) {
      thresholdBin = bin;
      break;
    }
  }
  return min + (thresholdBin / Math.max(1, bins - 1)) * span;
}

function smoothCoastalElevation(
  width: number,
  height: number,
  elevation: Float32Array,
  seaLevel: number,
  smoothLevel: number,
): void {
  const smooth = (smoothLevel - 1) / 9;
  const passes = Math.round(1 + smooth * 5);
  const band = lerp(0.025, 0.25, smooth);
  let current = elevation.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const distance = Math.abs(current[index] - seaLevel);
        if (distance > band) {
          continue;
        }

        let sum = 0;
        let orthogonal = 0;
        let diagonal = 0;
        for (const [dx, dy] of NEIGHBORS_8) {
          const sample = current[(y + dy) * width + (x + dx)];
          sum += sample;
          if (dx === 0 || dy === 0) {
            orthogonal += sample;
          } else {
            diagonal += sample;
          }
        }
        const average = sum / 8;
        const anisotropic = orthogonal / 4 * 0.65 + diagonal / 4 * 0.35;
        const coastalTarget = average * 0.35 + anisotropic * 0.65;
        const curvature = average - current[index];
        const strength = smoothstep(1 - distance / Math.max(1e-6, band)) * lerp(0.09, 0.52, smooth);
        const eroded = lerp(current[index], coastalTarget, strength);
        next[index] = lerp(eroded, seaLevel, strength * 0.08) + curvature * strength * 0.08;
      }
    }
    current = next;
  }

  elevation.set(current);
}

function enforceOceanEdges(width: number, height: number, land: Uint8Array): void {
  for (let x = 0; x < width; x += 1) {
    land[x] = 0;
    land[(height - 1) * width + x] = 0;
  }
  for (let y = 0; y < height; y += 1) {
    land[y * width] = 0;
    land[y * width + width - 1] = 0;
  }
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
    if (water[index] !== 1 || ocean[index] === 1) {
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
    for (const [dx, dy] of NEIGHBORS_4) {
      enqueue(x + dx, y + dy);
    }
  }

  const lake = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (water[i] === 1 && ocean[i] === 0) {
      lake[i] = 1;
    }
  }

  return { ocean, lake };
}

function bfsDistance(width: number, height: number, starts: Uint8Array): Uint16Array {
  const total = width * height;
  const distance = new Uint16Array(total);
  distance.fill(0xffff);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < total; i += 1) {
    if (starts[i] === 1) {
      distance[i] = 0;
      queue[tail] = i;
      tail += 1;
    }
  }

  while (head < tail) {
    const current = queue[head];
    head += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    const nextDistance = distance[current] + 1;
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const ni = ny * width + nx;
      if (distance[ni] <= nextDistance) {
        continue;
      }
      distance[ni] = nextDistance;
      queue[tail] = ni;
      tail += 1;
    }
  }

  return distance;
}

export function computeLightAndSlope(width: number, height: number, elevation01: Float32Array): {
  light: Float32Array;
  slope: Float32Array;
} {
  const total = width * height;
  const light = new Float32Array(width * height);
  const slope = new Float32Array(width * height);
  const smooth = elevation01.slice();
  const scratch = new Float32Array(total);

  const lx = -1;
  const ly = -1;
  const lz = 1;
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const lnx = lx / lLen;
  const lny = ly / lLen;
  const lnz = lz / lLen;

  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const left = smooth[index - 1];
        const right = smooth[index + 1];
        const up = smooth[index - width];
        const down = smooth[index + width];
        scratch[index] = (smooth[index] * 0.5 + left + right + up + down) / 4.5;
      }
    }
    for (let x = 0; x < width; x += 1) {
      scratch[x] = smooth[x];
      scratch[(height - 1) * width + x] = smooth[(height - 1) * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      scratch[y * width] = smooth[y * width];
      scratch[y * width + width - 1] = smooth[y * width + width - 1];
    }
    smooth.set(scratch);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(width - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(height - 1, y + 1);

      const tl = smooth[yu * width + xl];
      const tc = smooth[yu * width + x];
      const tr = smooth[yu * width + xr];
      const ml = smooth[y * width + xl];
      const mr = smooth[y * width + xr];
      const bl = smooth[yd * width + xl];
      const bc = smooth[yd * width + x];
      const br = smooth[yd * width + xr];

      const dzdx = ((tr + mr * 2 + br) - (tl + ml * 2 + bl)) / 8;
      const dzdy = ((bl + bc * 2 + br) - (tl + tc * 2 + tr)) / 8;
      const detailDx = (elevation01[y * width + xr] - elevation01[y * width + xl]) * 0.5;
      const detailDy = (elevation01[yd * width + x] - elevation01[yu * width + x]) * 0.5;
      const nx = -(dzdx * 4.3 + detailDx * 1.35);
      const ny = -(dzdy * 4.3 + detailDy * 1.35);
      const nz = 1;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const nnx = nx / nLen;
      const nny = ny / nLen;
      const nnz = nz / nLen;

      const lambert = Math.max(0, nnx * lnx + nny * lny + nnz * lnz);
      const ambient = 0.32;
      const diffuse = 0.68 * lambert;
      light[y * width + x] = clamp01(ambient + diffuse);
      slope[y * width + x] = clamp01(Math.hypot(dzdx + detailDx * 0.65, dzdy + detailDy * 0.65) * 7.8);
    }
  }

  const smoothed = light.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const neighborAverage =
        (light[index - 1] + light[index + 1] + light[index - width] + light[index + width] + light[index]) / 5;
      const blend = 0.16 * (1 - slope[index]);
      smoothed[index] = lerp(light[index], neighborAverage, blend);
    }
  }
  light.set(smoothed);

  return { light, slope };
}

function checksumFloatArray(values: Float32Array): number {
  let hash = 2166136261;
  for (let i = 0; i < values.length; i += 37) {
    hash ^= Math.round(values[i] * 10_000);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function checksumByteArray(values: Uint8Array): number {
  let hash = 2166136261;
  for (let i = 0; i < values.length; i += 17) {
    hash ^= values[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compactHashHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

function computeIdentityHash(
  controlsHash: string,
  normalizedSeed: string,
  width: number,
  height: number,
  elevation: Float32Array,
  land: Uint8Array,
  river: Uint8Array,
  biome: Uint8Array,
): string {
  let hash = hashString(`${normalizedSeed}|${width}|${height}|${controlsHash}`);
  const checks = [
    checksumFloatArray(elevation),
    checksumByteArray(land),
    checksumByteArray(river),
    checksumByteArray(biome),
  ];
  for (const check of checks) {
    hash ^= check;
    hash = Math.imul(hash, 16777619);
  }
  return compactHashHex(hash);
}

function computeLandAndCoast(width: number, height: number, land: Uint8Array): {
  landArea: number;
  coastPerimeter: number;
} {
  let landArea = 0;
  let coastPerimeter = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (land[index] !== 1) {
        continue;
      }
      landArea += 1;
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          coastPerimeter += 1;
          continue;
        }
        const ni = ny * width + nx;
        if (land[ni] === 0) {
          coastPerimeter += 1;
        }
      }
    }
  }
  return { landArea, coastPerimeter };
}

function computeFlowField(
  width: number,
  height: number,
  land: Uint8Array,
  elevationSigned: Float32Array,
  elevation01: Float32Array,
): { downstream: Int32Array; flow: Float32Array } {
  const total = width * height;
  const downstream = new Int32Array(total);
  downstream.fill(-1);
  const flow = new Float32Array(total);
  const bins: number[][] = Array.from({ length: 256 }, () => []);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (land[index] === 0) {
        continue;
      }

      flow[index] = 1;
      let bestElevation = elevationSigned[index];
      let bestNeighbor = -1;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (elevationSigned[ni] < bestElevation - 1e-4) {
          bestElevation = elevationSigned[ni];
          bestNeighbor = ni;
        }
      }
      downstream[index] = bestNeighbor;

      const bin = clamp(Math.floor(elevation01[index] * 255), 0, 255);
      bins[bin].push(index);
    }
  }

  for (let bin = 255; bin >= 0; bin -= 1) {
    const bucket = bins[bin];
    for (let i = 0; i < bucket.length; i += 1) {
      const index = bucket[i];
      const out = downstream[index];
      if (out >= 0) {
        flow[out] += flow[index];
      }
    }
  }

  let maxFlow = 1;
  for (let i = 0; i < flow.length; i += 1) {
    maxFlow = Math.max(maxFlow, flow[i]);
  }
  for (let i = 0; i < flow.length; i += 1) {
    flow[i] /= maxFlow;
  }

  return { downstream, flow };
}

function applyRiverIncision(
  width: number,
  height: number,
  elevationSigned: Float32Array,
  river: Uint8Array,
  flow: Float32Array,
  seaLevel: number,
  passScale = 1,
): void {
  const radius = 2;
  const total = width * height;
  const delta = new Float32Array(total);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (river[index] === 0 || elevationSigned[index] <= seaLevel - 0.02) {
        continue;
      }
      const trunkFactor = Math.sqrt(clamp01(flow[index]));
      const depth = (0.0055 + trunkFactor * 0.015) * passScale;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const distance = Math.hypot(dx, dy);
          if (distance > radius + 0.25) {
            continue;
          }
          const taper = Math.max(0, 1 - distance / (radius + 0.25));
          const ni = ny * width + nx;
          delta[ni] -= depth * taper * taper;
        }
      }
    }
  }
  for (let i = 0; i < total; i += 1) {
    elevationSigned[i] = Math.max(-1.2, elevationSigned[i] + delta[i]);
    if (river[i] === 1) {
      elevationSigned[i] = Math.max(elevationSigned[i], seaLevel + 0.004);
    }
  }
}

function applySlopeFeedbackPass(
  width: number,
  height: number,
  elevationSigned: Float32Array,
  seaLevel: number,
): void {
  const next = elevationSigned.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const current = elevationSigned[index];
      if (current <= seaLevel - 0.15) {
        continue;
      }
      const left = elevationSigned[y * width + (x - 1)];
      const right = elevationSigned[y * width + (x + 1)];
      const up = elevationSigned[(y - 1) * width + x];
      const down = elevationSigned[(y + 1) * width + x];
      const slope = Math.hypot((right - left) * 0.5, (down - up) * 0.5);
      const average = (left + right + up + down + current) / 5;
      const strength = clamp01((slope - 0.012) * 18) * 0.13;
      next[index] = lerp(current, average, strength);
    }
  }
  elevationSigned.set(next);
}

function applyFlowValleyFeedback(
  width: number,
  height: number,
  elevationSigned: Float32Array,
  flow: Float32Array,
  seaLevel: number,
  reliefNorm: number,
): void {
  const next = elevationSigned.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (elevationSigned[index] <= seaLevel + 0.015) {
        continue;
      }
      const accumulation = clamp01((flow[index] - 0.02) * 4.4);
      if (accumulation <= 0) {
        continue;
      }
      const left = elevationSigned[y * width + (x - 1)];
      const right = elevationSigned[y * width + (x + 1)];
      const up = elevationSigned[(y - 1) * width + x];
      const down = elevationSigned[(y + 1) * width + x];
      const slope = clamp01(Math.hypot((right - left) * 0.5, (down - up) * 0.5) * 8.2);
      const carveStrength = (0.0018 + reliefNorm * 0.0052) * accumulation * (0.6 + slope * 0.6);
      const floor = seaLevel + 0.004;
      next[index] = Math.max(floor, elevationSigned[index] - carveStrength);
    }
  }
  elevationSigned.set(next);
}

type ContinuousPlateSample = {
  uplift: number;
  driftX: number;
  driftY: number;
  coherence: number;
};

function sampleContinuousPlateField(
  plates: Plate[],
  nx: number,
  ny: number,
  aspectMetric: number,
): ContinuousPlateSample {
  let upliftSum = 0;
  let driftXSum = 0;
  let driftYSum = 0;
  let weightSum = 0;
  const falloff = 7.4 + plates.length * 0.08;

  for (let i = 0; i < plates.length; i += 1) {
    const plate = plates[i];
    const dx = (nx - plate.x) * aspectMetric;
    const dy = ny - plate.y;
    const d2 = dx * dx + dy * dy;
    const w = Math.exp(-d2 * falloff);
    upliftSum += plate.uplift * w;
    driftXSum += plate.driftX * w;
    driftYSum += plate.driftY * w;
    weightSum += w;
  }

  if (weightSum <= 1e-6) {
    return {
      uplift: 0,
      driftX: 0,
      driftY: 0,
      coherence: 0,
    };
  }

  const invW = 1 / weightSum;
  const driftX = driftXSum * invW;
  const driftY = driftYSum * invW;
  const coherence = clamp01(Math.hypot(driftX, driftY));
  return {
    uplift: upliftSum * invW,
    driftX,
    driftY,
    coherence,
  };
}

export function generateContinent(input: ContinentControls): GeneratedContinent {
  const controls = clampControls(input);
  const normalizedSeed = normalizeSeed(controls.seed);
  const { width, height, basePlates, fieldScale } = mapDimensions(controls.size, controls.aspectRatio);
  const total = width * height;
  const baseWidth = Math.max(96, Math.round(width / OUTPUT_SCALE));
  const baseHeight = Math.max(96, Math.round(height / OUTPUT_SCALE));

  const seedHash = hashString(normalizedSeed);
  const plateSeed = hashString(`${normalizedSeed}|plates|${width}|${height}|${controls.aspectRatio}`);
  const noiseSeed = hashString(`${normalizedSeed}|elevation`);
  const climateSeed = hashString(`${normalizedSeed}|climate`);

  const aspectMetric = width / Math.max(1, height);
  const reliefNorm = (controls.relief - 1) / 9;
  const fragNorm = (controls.fragmentation - 1) / 9;
  const peakNorm = (controls.mountainPeakiness - 1) / 9;
  const islandNorm = controls.islandDensity / 10;

  const plateCount = clamp(Math.round(basePlates + controls.plateCount * 4), 4, 36);
  const plateRng = mulberry32(plateSeed);
  const plates: Plate[] = [];
  for (let i = 0; i < plateCount; i += 1) {
    const angle = plateRng() * Math.PI * 2;
    plates.push({
      x: plateRng(),
      y: plateRng(),
      uplift: lerp(-1, 1, plateRng()),
      driftX: Math.cos(angle),
      driftY: Math.sin(angle),
    });
  }

  const rawElevationBase = downsampleField(baseWidth, baseHeight, fieldScale, (fx, fy) => {
    const nx0 = fx / Math.max(1, baseWidth - 1);
    const ny0 = fy / Math.max(1, baseHeight - 1);
    const warpX = (fbm(noiseSeed ^ 0xa17ec421, nx0 * 3.1, ny0 * 3.1, 2, 0.55, 2.1) - 0.5) * 0.06;
    const warpY = (fbm(noiseSeed ^ 0x7e5f08cb, nx0 * 2.7, ny0 * 2.7, 2, 0.55, 2.1) - 0.5) * 0.06;
    const nx = clamp01(nx0 + warpX);
    const ny = clamp01(ny0 + warpY);
    const plateSample = sampleContinuousPlateField(plates, nx, ny, aspectMetric);

    const noiseX = nx * aspectMetric;
    const noiseY = ny;
    const macroSlope =
      (nx - 0.5) * (0.12 + fragNorm * 0.04) +
      (ny - 0.5) * (0.08 + fragNorm * 0.05);
    const basin = fbm(
      noiseSeed ^ 0x3d6f8d5f,
      noiseX * 1.3 + plateSample.driftX * 0.9,
      noiseY * 1.3 + plateSample.driftY * 0.9,
      3,
      0.58,
      2.05,
    ) - 0.5;
    const upliftBands = fbm(
      noiseSeed ^ 0x1e7305c7,
      noiseX * 2.2 + plateSample.driftX * 2.6,
      noiseY * 2.2 + plateSample.driftY * 2.6,
      3,
      0.56,
      2.1,
    ) - 0.5;
    const low = fbm(noiseSeed, noiseX * 2.2, noiseY * 2.2, 5, 0.58, 2);
    const regional = fbm(noiseSeed ^ 0x51d7348b, noiseX * 6.4, noiseY * 6.4, 4, 0.55, 2.1);
    const rugged = fbm(noiseSeed ^ 0x2f43ac91, noiseX * 18.5, noiseY * 18.5, 3, 0.5, 2.3);
    const micro = fbm(noiseSeed ^ 0xf18bd7cf, noiseX * 44, noiseY * 44, 2, 0.45, 2.4);
    const ridgeGuide = ridgedFbm(
      noiseSeed ^ 0x6bbd3d3d,
      noiseX * 9.2 + plateSample.driftX * 2.2 + basin * 2.5,
      noiseY * 7.6 + plateSample.driftY * 2.2 - basin * 2.5,
      3,
      0.56,
      2.12,
    );
    const driftShear = 1 - plateSample.coherence;
    const plateBody =
      plateSample.uplift * (0.2 + reliefNorm * 0.24) +
      driftShear * (0.05 + reliefNorm * 0.14);

    const centerX = (nx - 0.5) * 2 * aspectMetric;
    const centerY = (ny - 0.5) * 2;
    const continentalWarpX = (fbm(noiseSeed ^ 0x143290e3, noiseX * 3.1, noiseY * 3.1, 2, 0.56, 2.1) - 0.5) * 0.4;
    const continentalWarpY = (fbm(noiseSeed ^ 0x657411a1, noiseX * 3.4, noiseY * 3.4, 2, 0.56, 2.1) - 0.5) * 0.4;
    const wx = centerX + continentalWarpX;
    const wy = centerY + continentalWarpY;
    const shapePower = 2.2 + fbm(noiseSeed ^ 0x95a21f77, noiseX * 1.8, noiseY * 1.8, 2, 0.55, 2.1) * 1.2;
    const shapeRadius = Math.pow(Math.pow(Math.abs(wx), shapePower) + Math.pow(Math.abs(wy), shapePower), 1 / shapePower);
    const contour = 0.96 + (fbm(noiseSeed ^ 0x71cc38d3, noiseX * 2.6, noiseY * 2.6, 2, 0.56, 2.1) - 0.5) * 0.35;
    const interior = smoothRange(
      contour - shapeRadius,
      -0.32 + islandNorm * 0.04,
      0.34 - fragNorm * 0.08 + islandNorm * 0.05,
    );
    const edgeSeaBias = (1 - interior) * (1.08 + fragNorm * 0.25 + islandNorm * 0.48);

    return (
      0.41 +
      plateBody +
      upliftBands * (0.19 + reliefNorm * 0.18) +
      basin * (0.18 + fragNorm * 0.14) +
      ridgeGuide * (0.09 + peakNorm * 0.15) +
      macroSlope * 0.38 +
      (low - 0.5) * (0.45 + reliefNorm * 0.35) +
      (regional - 0.5) * (0.3 + fragNorm * 0.35 + islandNorm * 0.15) +
      (rugged - 0.5) * (0.08 + reliefNorm * 0.22) +
      (micro - 0.5) * (0.04 + reliefNorm * 0.1) -
      edgeSeaBias
    );
  });

  const rawElevation = upsampleBilinearField(rawElevationBase, baseWidth, baseHeight, width, height);
  const globalStress = buildGlobalStressField(width, height, plates, aspectMetric, noiseSeed);

  normalizeSigned(rawElevation);
  applyEdgeFalloff(width, height, rawElevation, noiseSeed);
  applyRidgeValleySynthesis(
    width,
    height,
    rawElevation,
    noiseSeed,
    reliefNorm,
    peakNorm,
    fragNorm,
    globalStress.stress,
    globalStress.dirX,
    globalStress.dirY,
  );
  normalizeSigned(rawElevation);

  const targetLand = clamp(0.08 + (controls.landFraction - 1) / 9 * 0.66, 0.08, 0.74);
  const seaLevel = histogramThresholdSigned(rawElevation, targetLand);

  smoothCoastalElevation(width, height, rawElevation, seaLevel, controls.coastalSmoothing);

  const elevation01 = new Float32Array(total);
  const elevationSigned = rawElevation;
  const land = new Uint8Array(total);
  const ridge = new Float32Array(total);
  const ridgeSeed = noiseSeed ^ 0x0f6344f3;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      elevation01[index] = clamp01((elevationSigned[index] + 1) * 0.5);
      land[index] = elevationSigned[index] > seaLevel ? 1 : 0;

      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const ridgeNoise = Math.pow(
        1 - Math.abs(fbm(ridgeSeed, nx * 8.2 + ny * 1.9, ny * 8.2, 2, 0.56, 2.1) - 0.5) * 2,
        1.2 + peakNorm * 1.7,
      );
      ridge[index] = clamp01(ridgeNoise * clamp01((elevationSigned[index] - seaLevel) * 1.8 + 0.3));
    }
  }

  enforceOceanEdges(width, height, land);

  const water = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    water[i] = land[i] === 1 ? 0 : 1;
  }

  let { ocean, lake } = floodOcean(width, height, water);
  const distanceToOcean = bfsDistance(width, height, ocean);
  const distanceToLand = bfsDistance(width, height, land);

  const temperature = new Float32Array(total);
  const moisture = new Float32Array(total);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const latitude = controls.latitudeCenter + (0.5 - ny) * controls.latitudeSpan;
    const latTemp = 1 - Math.abs(latitude) / 90;

    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const elevAboveSea = Math.max(0, elevationSigned[index] - seaLevel);
      const climateNoise = fbm(climateSeed, nx * 3.2, ny * 3.2, 3, 0.57, 2.1);
      const moistureNoise = fbm(climateSeed ^ 0x5d82317d, nx * 4.8, ny * 4.8, 2, 0.55, 2.2);

      let temp = latTemp - elevAboveSea * 0.5 + (climateNoise - 0.5) * 0.12;
      temp = clamp01(temp);

      const oceanProximity = clamp01(1 - distanceToOcean[index] / (20 + controls.fragmentation * 2));
      const coastalHumidity = clamp01(1 - distanceToOcean[index] / (12 + controls.fragmentation));
      const prevailingWest = latitude >= 0 || Math.abs(latitude) > 24;
      const upwindIndex = prevailingWest
        ? (x > 0 ? index - 1 : index)
        : (x < width - 1 ? index + 1 : index);
      const rainShadow =
        clamp01((elevationSigned[upwindIndex] - elevationSigned[index]) * 3.5) * ridge[upwindIndex] * 0.22;
      let wet =
        0.2 +
        oceanProximity * 0.52 +
        coastalHumidity * 0.18 +
        (moistureNoise - 0.5) * 0.28 +
        controls.climateBias * 0.052 -
        elevAboveSea * 0.18 -
        rainShadow;

      if (land[index] === 0) {
        temp = clamp01(temp + 0.04);
        wet = clamp01(wet + 0.08);
      }

      temperature[index] = temp;
      moisture[index] = clamp01(wet);
    }
  }

  let { downstream, flow } = computeFlowField(width, height, land, elevationSigned, elevation01);
  applyFlowValleyFeedback(width, height, elevationSigned, flow, seaLevel, reliefNorm);
  for (let i = 0; i < total; i += 1) {
    elevation01[i] = clamp01((elevationSigned[i] + 1) * 0.5);
  }
  ({ downstream, flow } = computeFlowField(width, height, land, elevationSigned, elevation01));

  const river = new Uint8Array(total);
  const riverMix = controls.biomeMix.rivers;
  const trunkThreshold = lerp(0.11, 0.02, riverMix);
  const tributaryThreshold = lerp(0.07, 0.012, riverMix);
  const trunkMinLength = Math.round(lerp(55, 20, riverMix));
  const tributaryMinLength = Math.round(lerp(34, 15, riverMix));
  const trunkMinDrop = lerp(0.055, 0.018, riverMix);
  const tributaryMinDrop = lerp(0.045, 0.015, riverMix);
  const maxSources = Math.max(6, Math.round((total / 13_500) * (0.9 + riverMix * 2.2)));
  const spacing = Math.round(lerp(52, 19, riverMix));
  const tributarySpacing = Math.round(spacing * 0.58);
  const inlandMinDistance = Math.round(lerp(5, 13, riverMix));

  const sourceCandidates: Array<{ index: number; score: number }> = [];
  const inlandCandidates: Array<{ index: number; score: number }> = [];
  for (let i = 0; i < total; i += 1) {
    if (land[i] === 0 || elevationSigned[i] < seaLevel + 0.045) {
      continue;
    }
    if (flow[i] < trunkThreshold) {
      continue;
    }
    const inlandFactor = clamp01(distanceToOcean[i] / (16 + controls.fragmentation * 2));
    const wetness = moisture[i] + inlandFactor * 0.24;
    if (wetness < 0.14) {
      continue;
    }
    const elevationFactor = clamp01((elevationSigned[i] - seaLevel) * 1.9);
    const score = flow[i] * (0.52 + inlandFactor * 0.88) + elevationFactor * 0.2 + wetness * 0.18;
    const candidate = { index: i, score };
    sourceCandidates.push(candidate);
    if (distanceToOcean[i] >= inlandMinDistance) {
      inlandCandidates.push(candidate);
    }
  }
  sourceCandidates.sort((a, b) => b.score - a.score);
  inlandCandidates.sort((a, b) => b.score - a.score);

  const selectedSources: number[] = [];
  const sourceFarEnough = (index: number, sourceSpacing: number): boolean => {
    const x = index % width;
    const y = Math.floor(index / width);
    const spacingSq = sourceSpacing * sourceSpacing;
    for (const source of selectedSources) {
      const sx = source % width;
      const sy = Math.floor(source / width);
      const dx = sx - x;
      const dy = sy - y;
      if (dx * dx + dy * dy < spacingSq) {
        return false;
      }
    }
    return true;
  };

  const pushSource = (source: number): void => {
    if (!sourceFarEnough(source, spacing)) {
      return;
    }
    selectedSources.push(source);
  };

  const inlandTarget = Math.min(inlandCandidates.length, Math.round(maxSources * 0.6));
  for (let i = 0; i < inlandCandidates.length && selectedSources.length < inlandTarget; i += 1) {
    pushSource(inlandCandidates[i].index);
  }
  for (let i = 0; i < sourceCandidates.length && selectedSources.length < maxSources; i += 1) {
    pushSource(sourceCandidates[i].index);
  }

  const spillNeighbor = (index: number, seen: Set<number>): number => {
    const x = index % width;
    const y = Math.floor(index / width);
    let best = -1;
    let bestElevation = Number.POSITIVE_INFINITY;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const ni = ny * width + nx;
      if (seen.has(ni)) {
        continue;
      }
      const e = elevationSigned[ni];
      if (e < bestElevation) {
        bestElevation = e;
        best = ni;
      }
    }
    return best;
  };

  const tracePath = (source: number, allowRiverJoin: boolean): { path: number[]; reachesWater: boolean; joinsRiver: boolean } => {
    const seen = new Set<number>();
    const path: number[] = [];
    let current = source;
    let reachesWater = false;
    let joinsRiver = false;

    for (let step = 0; step < width + height + Math.max(width, height); step += 1) {
      if (seen.has(current)) {
        break;
      }
      seen.add(current);
      path.push(current);

      if (ocean[current] === 1) {
        reachesWater = true;
        break;
      }

      const next = downstream[current];
      const target = next >= 0 ? next : spillNeighbor(current, seen);
      if (target < 0) {
        break;
      }
      if (allowRiverJoin && river[target] === 1) {
        reachesWater = true;
        joinsRiver = true;
        path.push(target);
        break;
      }
      current = target;
    }

    return { path, reachesWater, joinsRiver };
  };

  const markRiverPath = (path: number[]): void => {
    for (let i = 0; i < path.length; i += 1) {
      const index = path[i];
      if (land[index] === 1) {
        river[index] = 1;
      }
    }
  };

  const maxRiverComponent = (): number => {
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let maxSize = 0;
    for (let i = 0; i < total; i += 1) {
      if (river[i] === 0 || visited[i] === 1) {
        continue;
      }
      let head = 0;
      let tail = 1;
      let size = 0;
      queue[0] = i;
      visited[i] = 1;
      while (head < tail) {
        const current = queue[head];
        head += 1;
        size += 1;
        const cx = current % width;
        const cy = Math.floor(current / width);
        for (const [dx, dy] of NEIGHBORS_8) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const ni = ny * width + nx;
          if (river[ni] === 0 || visited[ni] === 1) {
            continue;
          }
          visited[ni] = 1;
          queue[tail] = ni;
          tail += 1;
        }
      }
      if (size > maxSize) {
        maxSize = size;
      }
    }
    return maxSize;
  };

  for (let i = 0; i < selectedSources.length; i += 1) {
    const source = selectedSources[i];
    let traced = tracePath(source, false);
    if (!traced.reachesWater) {
      traced = tracePath(source, true);
    }
    const last = traced.path[Math.max(0, traced.path.length - 1)];
    const drop = elevationSigned[source] - elevationSigned[last];
    if (traced.path.length < trunkMinLength || drop < trunkMinDrop || !traced.reachesWater) {
      continue;
    }
    markRiverPath(traced.path);
  }

  const tributaryCandidates: Array<{ index: number; score: number }> = [];
  for (let i = 0; i < total; i += 1) {
    if (land[i] === 0 || river[i] === 1 || flow[i] < tributaryThreshold) {
      continue;
    }
    if (distanceToOcean[i] < inlandMinDistance - 1 || elevationSigned[i] < seaLevel + 0.03) {
      continue;
    }
    const inlandFactor = clamp01(distanceToOcean[i] / (15 + controls.fragmentation * 2));
    const wetness = clamp01(moisture[i] + flow[i] * 0.5);
    const score = flow[i] * 0.62 + inlandFactor * 0.58 + wetness * 0.2;
    tributaryCandidates.push({ index: i, score });
  }
  tributaryCandidates.sort((a, b) => b.score - a.score);

  const tributarySources: number[] = [];
  const maxTributaries = Math.max(8, Math.round(maxSources * 2.4));
  for (let i = 0; i < tributaryCandidates.length && tributarySources.length < maxTributaries; i += 1) {
    const source = tributaryCandidates[i].index;
    if (!sourceFarEnough(source, tributarySpacing)) {
      continue;
    }
    const traced = tracePath(source, true);
    if (!traced.joinsRiver || !traced.reachesWater) {
      continue;
    }
    const last = traced.path[Math.max(0, traced.path.length - 1)];
    const drop = elevationSigned[source] - elevationSigned[last];
    if (traced.path.length < tributaryMinLength || drop < tributaryMinDrop) {
      continue;
    }
    tributarySources.push(source);
    selectedSources.push(source);
    markRiverPath(traced.path);
  }

  let riverPixels = 0;
  for (let i = 0; i < river.length; i += 1) {
    riverPixels += river[i];
  }
  const fallbackTarget = Math.round((width * height) * (0.00018 + riverMix * 0.00035));
  if (riverPixels < fallbackTarget) {
    const fallbackCandidates: Array<{ index: number; score: number }> = [];
    for (let i = 0; i < total; i += 1) {
      if (
        land[i] === 0 ||
        river[i] === 1 ||
        flow[i] < 0.012 ||
        elevationSigned[i] < seaLevel + 0.025 ||
        distanceToOcean[i] < 8
      ) {
        continue;
      }
      const inland = clamp01(distanceToOcean[i] / 20);
      const score = flow[i] * 0.72 + inland * 0.48 + moisture[i] * 0.14;
      fallbackCandidates.push({ index: i, score });
    }
    fallbackCandidates.sort((a, b) => b.score - a.score);
    const fallbackSpacing = Math.max(8, Math.floor(tributarySpacing * 0.58));
    const fallbackMax = Math.max(24, Math.round(maxSources * 1.6));

    for (let i = 0; i < fallbackCandidates.length && riverPixels < fallbackTarget && i < fallbackMax * 6; i += 1) {
      const source = fallbackCandidates[i].index;
      if (!sourceFarEnough(source, fallbackSpacing)) {
        continue;
      }
      const traced = tracePath(source, true);
      if (!traced.reachesWater || traced.path.length < Math.max(12, tributaryMinLength - 3)) {
        continue;
      }
      const last = traced.path[Math.max(0, traced.path.length - 1)];
      const drop = elevationSigned[source] - elevationSigned[last];
      if (drop < Math.max(0.006, tributaryMinDrop * 0.4)) {
        continue;
      }
      selectedSources.push(source);
      for (let p = 0; p < traced.path.length; p += 1) {
        const index = traced.path[p];
        if (land[index] === 1 && river[index] === 0) {
          river[index] = 1;
          riverPixels += 1;
        }
      }
    }
  }

  if (controls.size !== 'isle' && controls.landFraction >= 4) {
    const trunkTarget = Math.max(24, Math.round(width * 0.05));
    let currentMaxComponent = maxRiverComponent();
    if (currentMaxComponent < trunkTarget) {
      const forcedCandidates: Array<{ index: number; score: number }> = [];
      for (let i = 0; i < total; i += 1) {
        if (land[i] === 0 || distanceToOcean[i] < 10 || flow[i] < 0.02 || elevationSigned[i] < seaLevel + 0.05) {
          continue;
        }
        const inland = clamp01(distanceToOcean[i] / 30);
        const score = flow[i] * 0.5 + inland * 0.35 + clamp01((elevationSigned[i] - seaLevel) * 1.3) * 0.15;
        forcedCandidates.push({ index: i, score });
      }
      forcedCandidates.sort((a, b) => b.score - a.score);
      for (let i = 0; i < forcedCandidates.length && i < 300 && currentMaxComponent < trunkTarget; i += 1) {
        const source = forcedCandidates[i].index;
        if (!sourceFarEnough(source, Math.max(10, Math.floor(spacing * 0.5)))) {
          continue;
        }
        const traced = tracePath(source, false);
        if (!traced.reachesWater || traced.path.length < Math.max(18, Math.floor(trunkTarget * 0.72))) {
          continue;
        }
        const last = traced.path[Math.max(0, traced.path.length - 1)];
        const drop = elevationSigned[source] - elevationSigned[last];
        if (drop < Math.max(0.012, trunkMinDrop * 0.5)) {
          continue;
        }
        selectedSources.push(source);
        markRiverPath(traced.path);
        currentMaxComponent = maxRiverComponent();
      }
    }
  }

  applyRiverIncision(width, height, elevationSigned, river, flow, seaLevel, 1);

  for (let i = 0; i < total; i += 1) {
    elevation01[i] = clamp01((elevationSigned[i] + 1) * 0.5);
    land[i] = elevationSigned[i] > seaLevel ? 1 : 0;
    water[i] = land[i] === 1 ? 0 : 1;
  }
  enforceOceanEdges(width, height, land);
  for (let i = 0; i < total; i += 1) {
    if (land[i] === 0) {
      water[i] = 1;
      river[i] = 0;
    }
  }
  ({ ocean, lake } = floodOcean(width, height, water));
  ({ downstream, flow } = computeFlowField(width, height, land, elevationSigned, elevation01));

  applyRiverIncision(width, height, elevationSigned, river, flow, seaLevel, 0.62);
  applySlopeFeedbackPass(width, height, elevationSigned, seaLevel);

  for (let i = 0; i < total; i += 1) {
    elevation01[i] = clamp01((elevationSigned[i] + 1) * 0.5);
    land[i] = elevationSigned[i] > seaLevel ? 1 : 0;
  }
  enforceOceanEdges(width, height, land);
  for (let i = 0; i < total; i += 1) {
    if (land[i] === 0) {
      river[i] = 0;
      water[i] = 1;
    } else {
      water[i] = 0;
    }
  }
  ({ ocean, lake } = floodOcean(width, height, water));
  const distanceToOceanPostIncision = bfsDistance(width, height, ocean);
  const distanceToLandPostIncision = bfsDistance(width, height, land);
  const postIncisionFlow = computeFlowField(width, height, land, elevationSigned, elevation01);
  flow = postIncisionFlow.flow;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (land[index] === 0) {
        continue;
      }
      const coastBlend = Math.exp(-distanceToOceanPostIncision[index] / 8.5);
      if (coastBlend < 0.02) {
        continue;
      }

      const left = elevationSigned[y * width + Math.max(0, x - 1)];
      const right = elevationSigned[y * width + Math.min(width - 1, x + 1)];
      const up = elevationSigned[Math.max(0, y - 1) * width + x];
      const down = elevationSigned[Math.min(height - 1, y + 1) * width + x];
      const localSlope = clamp01(Math.hypot((right - left) * 0.5, (down - up) * 0.5) * 6.5);
      const relief = Math.max(0, elevationSigned[index] - seaLevel);
      const drainage = clamp01(flow[index] * 1.9);
      const nearShoreLand = clamp01(1 - distanceToLandPostIncision[index] / 7);
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const coastNoise = fbm(climateSeed ^ 0x3a7f04c5, nx * 15.5, ny * 15.5, 2, 0.55, 2.2) - 0.5;

      const variation =
        coastBlend * (coastNoise * 0.22 + drainage * 0.16 + nearShoreLand * 0.1 - localSlope * 0.2 - relief * 0.17);
      moisture[index] = clamp01(moisture[index] + variation);
    }
  }

  const biome = new Uint8Array(total);
  const beachWidth = 2;
  const mountainThreshold = 0.54 + (1 - reliefNorm) * 0.1 - controls.biomeMix.mountains * 0.08;
  const rockThreshold = mountainThreshold + 0.15 - peakNorm * 0.08;

  const classifyBiomes = (): void => {
    for (let i = 0; i < total; i += 1) {
      if (ocean[i] === 1) {
        biome[i] = BIOME_INDEX.ocean;
        continue;
      }
      if (lake[i] === 1) {
        biome[i] = BIOME_INDEX.lake;
        continue;
      }
      if (river[i] === 1) {
        biome[i] = BIOME_INDEX.river;
        continue;
      }
      if (land[i] === 0) {
        biome[i] = BIOME_INDEX.ocean;
        continue;
      }

      if (distanceToOceanPostIncision[i] <= beachWidth) {
        biome[i] = BIOME_INDEX.beach;
        continue;
      }

      const elevAboveSea = clamp01((elevationSigned[i] - seaLevel) / Math.max(1e-6, 1 - seaLevel));
      const ridgeBoost = ridge[i] * 0.14;
      if (elevAboveSea + ridgeBoost >= rockThreshold) {
        biome[i] = BIOME_INDEX.rock;
        continue;
      }
      if (elevAboveSea + ridgeBoost >= mountainThreshold) {
        biome[i] = BIOME_INDEX.mountain;
        continue;
      }

      const temp = temperature[i];
      const wet = moisture[i];
      const riverMoisture = clamp01(flow[i] * 1.8);
      const effectiveWet = clamp01(wet + riverMoisture * 0.22);

      const grassScore =
        (1 - Math.abs(temp - 0.56)) *
        (1 - Math.abs(effectiveWet - 0.44)) *
        (0.45 + controls.biomeMix.grassland * 0.75);
      const forestScore =
        (1 - Math.abs(temp - 0.5)) * effectiveWet * (0.42 + controls.biomeMix.temperateForest * 0.95);
      const rainforestScore = temp * effectiveWet * (0.24 + controls.biomeMix.rainforest * 1.22);
      const desertScore = temp * (1 - effectiveWet) * (0.32 + controls.biomeMix.desert * 1.2);
      const tundraScore = (1 - temp + elevAboveSea * 0.3) * (0.3 + controls.biomeMix.tundra * 1.2);

      let bestBiome: ContinentBiome = 'grassland';
      let bestScore = grassScore;
      if (forestScore > bestScore) {
        bestScore = forestScore;
        bestBiome = 'temperate-forest';
      }
      if (rainforestScore > bestScore) {
        bestScore = rainforestScore;
        bestBiome = 'rainforest';
      }
      if (desertScore > bestScore) {
        bestScore = desertScore;
        bestBiome = 'desert';
      }
      if (tundraScore > bestScore) {
        bestBiome = 'tundra';
      }

      biome[i] = BIOME_INDEX[bestBiome];
    }
  };

  classifyBiomes();

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (land[index] === 0 || river[index] === 1 || ocean[index] === 1 || lake[index] === 1) {
        continue;
      }
      let edgeNeighbors = 0;
      let moistureSum = 0;
      let elevationSum = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = (y + dy) * width + (x + dx);
        moistureSum += moisture[ni];
        elevationSum += elevationSigned[ni];
        if (biome[ni] !== biome[index]) {
          edgeNeighbors += 1;
        }
      }
      if (edgeNeighbors < 3) {
        continue;
      }
      const moistureAvg = moistureSum / 8;
      const elevationAvg = elevationSum / 8;
      moisture[index] = lerp(moisture[index], moistureAvg, 0.15);
      elevationSigned[index] = lerp(elevationSigned[index], elevationAvg, 0.045);
      elevation01[index] = clamp01((elevationSigned[index] + 1) * 0.5);
    }
  }

  classifyBiomes();

  const { light, slope } = computeLightAndSlope(width, height, elevation01);
  const { landArea, coastPerimeter } = computeLandAndCoast(width, height, land);

  const controlsHash = compactHashHex(
    hashString(
      encodeControlsToCompactString({
        ...controls,
        seed: normalizedSeed,
      }),
    ),
  );
  const identityHash = computeIdentityHash(
    controlsHash,
    normalizedSeed,
    width,
    height,
    elevation01,
    land,
    river,
    biome,
  );

  return {
    controls,
    normalizedSeed,
    width,
    height,
    fieldScale,
    seaLevel,
    elevation: elevation01,
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
    distanceToOcean: distanceToOceanPostIncision,
    distanceToLand: distanceToLandPostIncision,
    landArea,
    coastPerimeter,
    identityHash,
    controlsHash,
  };
}

function colorToRgb(color: string): [number, number, number] {
  const parsed = Number.parseInt(color.slice(1), 16);
  return [(parsed >> 16) & 0xff, (parsed >> 8) & 0xff, parsed & 0xff];
}

function shadeRgb(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    clamp(Math.round(rgb[0] * factor), 0, 255),
    clamp(Math.round(rgb[1] * factor), 0, 255),
    clamp(Math.round(rgb[2] * factor), 0, 255),
  ];
}

export const ATLAS_PALETTE: Record<ContinentBiome, string> = {
  ocean: '#2d5a84',
  lake: '#4a7ea7',
  beach: '#d5c08d',
  river: '#4e99c2',
  grassland: '#88a66a',
  'temperate-forest': '#587f50',
  rainforest: '#3c6f4b',
  desert: '#c6af7a',
  tundra: '#b6bfb3',
  mountain: '#8b8577',
  rock: '#6f695f',
};

export function buildAtlasRgba(
  map: GeneratedContinent,
  outputWidth = map.width,
  outputHeight = map.height,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const srcWidth = map.width;
  const srcHeight = map.height;

  for (let y = 0; y < outputHeight; y += 1) {
    const sy = Math.min(srcHeight - 1, Math.floor((y / Math.max(1, outputHeight - 1)) * (srcHeight - 1)));
    for (let x = 0; x < outputWidth; x += 1) {
      const sx = Math.min(srcWidth - 1, Math.floor((x / Math.max(1, outputWidth - 1)) * (srcWidth - 1)));
      const srcIndex = sy * srcWidth + sx;
      const biomeName = BIOME_TYPES[map.biome[srcIndex]];
      const base = colorToRgb(ATLAS_PALETTE[biomeName]);

      const elev = map.elevation[srcIndex];
      const light = map.light[srcIndex];
      const slope = map.slope[srcIndex];
      const ridge = map.ridge[srcIndex];
      const distLand = map.distanceToLand[srcIndex];

      const nx = x / Math.max(1, outputWidth - 1);
      const ny = y / Math.max(1, outputHeight - 1);
      const detail = fbm(hashString(`${map.normalizedSeed}|render-detail`), nx * 40, ny * 40, 2, 0.55, 2.2) - 0.5;

      let factor = 1;
      if (biomeName === 'ocean') {
        factor = 0.8 + clamp(distLand, 0, 48) / 48 * 0.32;
      } else if (biomeName === 'lake') {
        factor = 0.9 + clamp(distLand, 0, 16) / 16 * 0.15;
      } else if (biomeName === 'river') {
        factor = 0.9;
      } else if (biomeName === 'beach') {
        factor = 1.03;
      } else {
        const reliefContrast = (light - 0.5) * (0.85 + slope * 0.8 + ridge * 0.55);
        const lightContrast = clamp01(0.5 + reliefContrast);
        const slopeShade = Math.pow(1 - slope, 1.4) * 0.07;
        factor =
          0.54 +
          lightContrast * 0.72 +
          elev * 0.1 +
          slope * 0.08 +
          ridge * 0.16 +
          detail * 0.06 -
          slopeShade;
      }

      if (biomeName === 'mountain' || biomeName === 'rock') {
        factor += 0.08;
      }

      const shaded = shadeRgb(base, factor);
      const outIndex = (y * outputWidth + x) * 4;
      rgba[outIndex] = shaded[0];
      rgba[outIndex + 1] = shaded[1];
      rgba[outIndex + 2] = shaded[2];
      rgba[outIndex + 3] = 255;
    }
  }

  return rgba;
}

function encodeBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(padded, 'base64'));
    }
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function encodeControlsToCompactString(controls: ContinentControls): string {
  const c = clampControls(controls);
  const fields = [
    'v=2',
    `s=${encodeURIComponent(c.seed)}`,
    `z=${c.size}`,
    `a=${c.aspectRatio}`,
    `lf=${c.landFraction}`,
    `re=${c.relief}`,
    `fr=${c.fragmentation}`,
    `cs=${c.coastalSmoothing}`,
    `lc=${c.latitudeCenter}`,
    `ls=${c.latitudeSpan}`,
    `pc=${c.plateCount}`,
    `mp=${c.mountainPeakiness}`,
    `cb=${c.climateBias}`,
    `id=${c.islandDensity}`,
    `rv=${c.biomeMix.rivers.toFixed(3)}`,
    `gr=${c.biomeMix.grassland.toFixed(3)}`,
    `tf=${c.biomeMix.temperateForest.toFixed(3)}`,
    `rf=${c.biomeMix.rainforest.toFixed(3)}`,
    `de=${c.biomeMix.desert.toFixed(3)}`,
    `mn=${c.biomeMix.mountains.toFixed(3)}`,
    `tu=${c.biomeMix.tundra.toFixed(3)}`,
  ];
  return fields.join('~');
}

function parseCompactString(input: string): ContinentControls | null {
  const kv = new Map<string, string>();
  for (const part of input.split('~')) {
    const equals = part.indexOf('=');
    if (equals <= 0) {
      continue;
    }
    kv.set(part.slice(0, equals), part.slice(equals + 1));
  }

  const version = kv.get('v');
  if (version !== '1' && version !== '2') {
    return null;
  }

  const size = kv.get('z') as SizeOption | undefined;
  const aspectRatio = kv.get('a') as AspectRatioOption | undefined;
  if (!size || !aspectRatio) {
    return null;
  }

  const parsed: ContinentControls = {
    seed: kv.get('s') ? decodeURIComponent(kv.get('s') as string) : 'DefaultSeed',
    size,
    aspectRatio,
    landFraction: Number(kv.get('lf')),
    relief: Number(kv.get('re')),
    fragmentation: Number(kv.get('fr')),
    coastalSmoothing: Number(kv.get('cs')),
    latitudeCenter: Number(kv.get('lc')),
    latitudeSpan: Number(kv.get('ls')),
    plateCount: Number(kv.get('pc')),
    mountainPeakiness: Number(kv.get('mp')),
    climateBias: Number(kv.get('cb')),
    islandDensity: Number(kv.get('id')),
    biomeMix: {
      rivers: Number(kv.get('rv')),
      grassland: Number(kv.get('gr')),
      temperateForest: Number(kv.get('tf')),
      rainforest: Number(kv.get('rf')),
      desert: Number(kv.get('de')),
      mountains: Number(kv.get('mn')),
      tundra: Number(kv.get('tu')),
    },
  };

  return clampControls(parsed);
}

export function exportContinentControls(controls: ContinentControls): ExportPayload {
  const compact = encodeControlsToCompactString(controls);
  const bytes = new TextEncoder().encode(compact);
  return {
    code: encodeBase64Url(bytes),
    controls: clampControls(controls),
  };
}

export function importContinentControls(code: string): ContinentControls | null {
  const bytes = decodeBase64Url(code.trim());
  if (!bytes) {
    return null;
  }
  const compact = new TextDecoder().decode(bytes);
  return parseCompactString(compact);
}

export function controlsIdentity(controls: ContinentControls): string {
  return exportContinentControls(controls).code;
}

export function biomeNameForIndex(index: number): ContinentBiome {
  const safe = clamp(Math.round(index), 0, BIOME_TYPES.length - 1);
  return BIOME_TYPES[safe];
}

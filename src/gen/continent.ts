export type SizeOption = 'isle' | 'region' | 'subcontinent' | 'supercontinent';
export type AspectRatioOption = 'wide' | 'landscape' | 'square' | 'portrait' | 'narrow';
export type PresetOption =
  | 'earth-like'
  | 'archipelago'
  | 'mountain-kingdoms'
  | 'riverlands'
  | 'dune-world'
  | 'rain-world'
  | 'broken-coast';

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
  preset: PresetOption;
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
  seaLevel: number;
  elevation: Float32Array;
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
  identityHash: string;
};

export type ExportPayload = {
  code: string;
  controls: ContinentControls;
};

type Plate = {
  x: number;
  y: number;
  height: number;
  drift: number;
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
  'Faint', 'Feral', 'Golden', 'Grand', 'Green', 'Hidden', 'Iron', 'Ivory', 'Jagged', 'Lone',
  'Lucky', 'Misty', 'Mossy', 'Noble', 'Northern', 'Obsidian', 'Old', 'Pale', 'Quiet', 'Red',
  'Rugged', 'Rusty', 'Sacred', 'Sandy', 'Shaded', 'Silent', 'Silver', 'Slate', 'Solar', 'Southern',
  'Spring', 'Steady', 'Stone', 'Stormy', 'Summer', 'Swift', 'Tall', 'Umber', 'Verdant', 'Vivid',
  'Warm', 'Western', 'Wild', 'Winter', 'Wise', 'Young',
] as const;

const NOUNS = [
  'Anchor', 'Arch', 'Bay', 'Beacon', 'Bluff', 'Cairn', 'Cape', 'Cedar', 'Chair', 'Cinder',
  'Cliff', 'Coast', 'Comet', 'Cove', 'Crown', 'Delta', 'Dune', 'Field', 'Fjord', 'Forest',
  'Garden', 'Gate', 'Grove', 'Harbor', 'Haven', 'Heights', 'Hollow', 'Island', 'Key', 'Lagoon',
  'Lake', 'March', 'Meadow', 'Mesa', 'Moon', 'Pass', 'Peak', 'Pillar', 'Plain', 'Ridge',
  'River', 'Run', 'Saddle', 'Sea', 'Shore', 'Sound', 'Spire', 'Stone', 'Summit', 'Trail',
  'Vale', 'Watch', 'Wave', 'Woods',
] as const;

const SIZE_CONFIG: Record<SizeOption, { shortEdge: number; basePlates: number }> = {
  isle: { shortEdge: 240, basePlates: 5 },
  region: { shortEdge: 360, basePlates: 8 },
  subcontinent: { shortEdge: 560, basePlates: 12 },
  supercontinent: { shortEdge: 760, basePlates: 16 },
};

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
  for (let i = 0; i < octaves; i += 1) {
    const octaveSeed = (seed + Math.imul(i + 1, 0x85ebca6b)) >>> 0;
    total += valueNoise(octaveSeed, x * frequency, y * frequency) * amplitude;
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
  const normalized = normalizeSeed(seed);
  return titleCaseWord(normalized);
}

export function createHumanSeed(randomValue?: number): string {
  const rand = randomValue ?? Math.random();
  const seedA = Math.floor(Math.abs(rand) * ADJECTIVES.length) % ADJECTIVES.length;
  const seedB = Math.floor(Math.abs((rand * 1_000_003) % 1) * NOUNS.length) % NOUNS.length;
  return `${ADJECTIVES[seedA]}${NOUNS[seedB]}`;
}

export function randomHumanSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bucket = new Uint32Array(2);
    crypto.getRandomValues(bucket);
    const adjective = ADJECTIVES[bucket[0] % ADJECTIVES.length];
    const noun = NOUNS[bucket[1] % NOUNS.length];
    return `${adjective}${noun}`;
  }
  return createHumanSeed(Math.random());
}

export const DEFAULT_CONTROLS: ContinentControls = {
  seed: randomHumanSeed(),
  preset: 'earth-like',
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

const PRESET_PATCHES: Record<PresetOption, Partial<ContinentControls>> = {
  'earth-like': {
    landFraction: 5,
    relief: 6,
    fragmentation: 4,
    coastalSmoothing: 6,
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
  },
  'archipelago': {
    landFraction: 3,
    relief: 5,
    fragmentation: 9,
    coastalSmoothing: 4,
    plateCount: 1,
    mountainPeakiness: 4,
    climateBias: 1,
    islandDensity: 9,
    biomeMix: {
      rivers: 0.45,
      grassland: 0.8,
      temperateForest: 0.9,
      rainforest: 0.75,
      desert: 0.35,
      mountains: 0.5,
      tundra: 0.2,
    },
  },
  'mountain-kingdoms': {
    landFraction: 6,
    relief: 9,
    fragmentation: 5,
    coastalSmoothing: 5,
    plateCount: 1,
    mountainPeakiness: 9,
    climateBias: -1,
    islandDensity: 2,
    biomeMix: {
      rivers: 0.65,
      grassland: 0.6,
      temperateForest: 0.85,
      rainforest: 0.35,
      desert: 0.45,
      mountains: 1,
      tundra: 0.6,
    },
  },
  riverlands: {
    landFraction: 5,
    relief: 5,
    fragmentation: 4,
    coastalSmoothing: 7,
    plateCount: 0,
    mountainPeakiness: 4,
    climateBias: 2,
    islandDensity: 3,
    biomeMix: {
      rivers: 1,
      grassland: 1.05,
      temperateForest: 0.95,
      rainforest: 0.6,
      desert: 0.25,
      mountains: 0.55,
      tundra: 0.2,
    },
  },
  'dune-world': {
    landFraction: 6,
    relief: 6,
    fragmentation: 3,
    coastalSmoothing: 7,
    plateCount: -1,
    mountainPeakiness: 6,
    climateBias: -5,
    islandDensity: 1,
    biomeMix: {
      rivers: 0.2,
      grassland: 0.45,
      temperateForest: 0.2,
      rainforest: 0.05,
      desert: 1,
      mountains: 0.65,
      tundra: 0.15,
    },
  },
  'rain-world': {
    landFraction: 5,
    relief: 6,
    fragmentation: 6,
    coastalSmoothing: 5,
    plateCount: 0,
    mountainPeakiness: 5,
    climateBias: 5,
    islandDensity: 6,
    biomeMix: {
      rivers: 0.95,
      grassland: 0.7,
      temperateForest: 1,
      rainforest: 1,
      desert: 0.1,
      mountains: 0.6,
      tundra: 0.2,
    },
  },
  'broken-coast': {
    landFraction: 5,
    relief: 6,
    fragmentation: 8,
    coastalSmoothing: 3,
    plateCount: 0,
    mountainPeakiness: 6,
    climateBias: 0,
    islandDensity: 8,
    biomeMix: {
      rivers: 0.65,
      grassland: 0.9,
      temperateForest: 0.85,
      rainforest: 0.45,
      desert: 0.55,
      mountains: 0.75,
      tundra: 0.35,
    },
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

export function applyPreset(base: ContinentControls, preset: PresetOption): ContinentControls {
  const next = cloneControls(base);
  const patch = PRESET_PATCHES[preset];
  const merged: ContinentControls = {
    ...next,
    ...patch,
    preset,
    biomeMix: {
      ...next.biomeMix,
      ...(patch.biomeMix ?? {}),
    },
  };
  return clampControls(merged);
}

export function randomizeControls(base: ContinentControls): ContinentControls {
  const next = cloneControls(base);
  const random = mulberry32(hashString(`${normalizeSeed(base.seed)}|randomize|${Date.now()}`));
  next.landFraction = 1 + Math.floor(random() * 10);
  next.relief = 1 + Math.floor(random() * 10);
  next.fragmentation = 1 + Math.floor(random() * 10);
  next.coastalSmoothing = 1 + Math.floor(random() * 10);
  next.latitudeCenter = Math.round(lerp(-70, 70, random()));
  next.latitudeSpan = Math.round(lerp(20, 180, random()));
  next.plateCount = Math.round(lerp(-1, 1, random()));
  next.mountainPeakiness = 1 + Math.floor(random() * 10);
  next.climateBias = Math.round(lerp(-5, 5, random()));
  next.islandDensity = Math.round(lerp(0, 10, random()));
  next.biomeMix.rivers = clamp(random(), 0, 1);
  next.biomeMix.grassland = clamp(random(), 0, 1);
  next.biomeMix.temperateForest = clamp(random(), 0, 1);
  next.biomeMix.rainforest = clamp(random(), 0, 1);
  next.biomeMix.desert = clamp(random(), 0, 1);
  next.biomeMix.mountains = clamp(random(), 0, 1);
  next.biomeMix.tundra = clamp(random(), 0, 1);
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

export function mapDimensions(size: SizeOption, aspectRatio: AspectRatioOption): { width: number; height: number; basePlates: number } {
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
  return {
    width,
    height,
    basePlates: sizeConfig.basePlates,
  };
}

function histogramThreshold(values: Float32Array, targetLand: number): { threshold: number; min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { threshold: 0, min: 0, max: 1 };
  }

  const bins = 2048;
  const histogram = new Uint32Array(bins);
  const span = max - min;
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

  const threshold = min + (thresholdBin / Math.max(1, bins - 1)) * span;
  return { threshold, min, max };
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
      const nextIndex = ny * width + nx;
      if (distance[nextIndex] <= nextDistance) {
        continue;
      }
      distance[nextIndex] = nextDistance;
      queue[tail] = nextIndex;
      tail += 1;
    }
  }

  return distance;
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

function computeLight(width: number, height: number, elevation: Float32Array): Float32Array {
  const light = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = elevation[y * width + Math.max(0, x - 1)];
      const right = elevation[y * width + Math.min(width - 1, x + 1)];
      const up = elevation[Math.max(0, y - 1) * width + x];
      const down = elevation[Math.min(height - 1, y + 1) * width + x];
      const dx = right - left;
      const dy = down - up;
      const nx = -dx * 2.2;
      const ny = -dy * 2.2;
      const nz = 1;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const nnx = nx / nLen;
      const nny = ny / nLen;
      const nnz = nz / nLen;

      const lx = -0.58;
      const ly = -0.42;
      const lz = 0.7;
      const lLen = Math.hypot(lx, ly, lz) || 1;
      const dot = nnx * (lx / lLen) + nny * (ly / lLen) + nnz * (lz / lLen);
      light[y * width + x] = clamp01(dot * 0.5 + 0.5);
    }
  }
  return light;
}

function clampMapBoundaries(width: number, height: number, land: Uint8Array): void {
  for (let x = 0; x < width; x += 1) {
    land[x] = 0;
    land[width + x] = 0;
    land[(height - 1) * width + x] = 0;
    land[(height - 2) * width + x] = 0;
  }
  for (let y = 0; y < height; y += 1) {
    land[y * width] = 0;
    land[y * width + 1] = 0;
    land[y * width + width - 1] = 0;
    land[y * width + width - 2] = 0;
  }
}

function applyCoastalSmoothing(
  width: number,
  height: number,
  land: Uint8Array,
  iterations: number,
  smoothingLevel: number,
  fragNoiseSeed: number,
  fragmentation: number,
  islandDensity: number,
): Uint8Array {
  let current = land;
  const next = new Uint8Array(width * height);
  const smoothFactor = (smoothingLevel - 1) / 9;
  const fragFactor = (fragmentation - 1) / 9;
  const islandFactor = islandDensity / 10;

  for (let iter = 0; iter < iterations; iter += 1) {
    next.fill(0);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        let neighbors = 0;
        for (const [dx, dy] of NEIGHBORS_8) {
          const ni = (y + dy) * width + (x + dx);
          neighbors += current[ni];
        }

        const isLand = current[index] === 1;
        const landKeepThreshold = Math.round(2 + smoothFactor * 3);
        const waterFillThreshold = Math.round(6 - smoothFactor * 2);
        let nextValue = 0;
        if (isLand) {
          nextValue = neighbors >= landKeepThreshold ? 1 : 0;
        } else {
          nextValue = neighbors >= waterFillThreshold ? 1 : 0;
        }

        const nx = x / (width - 1);
        const ny = y / (height - 1);
        const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
        const fragNoise = (valueNoise(fragNoiseSeed + iter * 101, nx * 24, ny * 24) - 0.5) * 2;
        if (nextValue === 1 && edgeDistance < 0.26 && fragNoise > 0.65 - fragFactor * 0.5) {
          nextValue = 0;
        } else if (nextValue === 0 && edgeDistance > 0.08 && edgeDistance < 0.23) {
          const islandChance = 0.03 * islandFactor;
          if (fragNoise > 0.85 - islandChance) {
            nextValue = 1;
          }
        }

        next[index] = nextValue;
      }
    }

    clampMapBoundaries(width, height, next);
    current = next.slice();
  }

  return current;
}

function addSinkLakes(
  width: number,
  height: number,
  land: Uint8Array,
  ocean: Uint8Array,
  lake: Uint8Array,
  river: Uint8Array,
  sinkCandidates: number[],
  elevation: Float32Array,
): void {
  let created = 0;
  for (const sink of sinkCandidates) {
    if (created > 64) {
      break;
    }
    if (land[sink] === 0 || ocean[sink] === 1 || river[sink] === 1) {
      continue;
    }
    const x = sink % width;
    const y = Math.floor(sink / width);
    if (x <= 2 || y <= 2 || x >= width - 3 || y >= height - 3) {
      continue;
    }

    const sinkElevation = elevation[sink];
    const basin: number[] = [sink];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      const ni = ny * width + nx;
      if (land[ni] !== 1 || ocean[ni] === 1 || river[ni] === 1) {
        continue;
      }
      if (elevation[ni] <= sinkElevation + 0.025) {
        basin.push(ni);
      }
    }

    if (basin.length < 2) {
      continue;
    }

    for (const index of basin) {
      land[index] = 0;
      lake[index] = 1;
    }
    created += 1;
  }
}

function computeIdentityHash(
  normalizedSeed: string,
  width: number,
  height: number,
  biome: Uint8Array,
): string {
  let hash = hashString(`${normalizedSeed}|${width}|${height}`);
  for (let i = 0; i < biome.length; i += 1) {
    hash ^= biome[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function generateContinent(input: ContinentControls): GeneratedContinent {
  const controls = clampControls(input);
  const normalizedSeed = normalizeSeed(controls.seed);
  const dimensions = mapDimensions(controls.size, controls.aspectRatio);
  const { width, height } = dimensions;
  const total = width * height;

  const seedHash = hashString(normalizedSeed);
  const plateSeed = hashString(`${normalizedSeed}|plate`);
  const elevSeed = hashString(`${normalizedSeed}|elev`);
  const climateSeed = hashString(`${normalizedSeed}|climate`);

  const reliefNorm = (controls.relief - 1) / 9;
  const fragNorm = (controls.fragmentation - 1) / 9;
  const peakNorm = (controls.mountainPeakiness - 1) / 9;
  const coastNorm = (controls.coastalSmoothing - 1) / 9;
  const islandNorm = controls.islandDensity / 10;

  const plateDelta = controls.plateCount * 3;
  const plateCount = clamp(Math.round(dimensions.basePlates + plateDelta), 4, 28);
  const plateRng = mulberry32(hashString(`${normalizedSeed}|plates|${width}|${height}|${plateCount}`));
  const plates: Plate[] = [];
  for (let i = 0; i < plateCount; i += 1) {
    plates.push({
      x: plateRng(),
      y: plateRng(),
      height: lerp(-1, 1, plateRng()),
      drift: lerp(-1, 1, plateRng()),
    });
  }

  const hubCount = clamp(Math.round(2 + (1 - fragNorm) * 2 + controls.landFraction / 4), 2, 7);
  const hubRng = mulberry32(hashString(`${normalizedSeed}|hubs|${width}|${height}|${hubCount}`));
  const hubs: Array<{ x: number; y: number; rx: number; ry: number; weight: number }> = [];
  let hubWeight = 0;
  for (let i = 0; i < hubCount; i += 1) {
    const rx = lerp(0.15, 0.45, hubRng());
    const ry = lerp(0.15, 0.45, hubRng());
    const weight = lerp(0.6, 1.4, hubRng());
    hubs.push({
      x: lerp(0.15, 0.85, hubRng()),
      y: lerp(0.15, 0.85, hubRng()),
      rx,
      ry,
      weight,
    });
    hubWeight += weight;
  }

  const rawElevation = new Float32Array(total);
  const initialLand = new Uint8Array(total);
  const normalizedElevation = new Float32Array(total);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;

      let nearestDistance = Number.POSITIVE_INFINITY;
      let secondDistance = Number.POSITIVE_INFINITY;
      let nearestPlate = 0;
      let secondPlate = 0;
      for (let plateIndex = 0; plateIndex < plates.length; plateIndex += 1) {
        const plate = plates[plateIndex];
        const dx = nx - plate.x;
        const dy = ny - plate.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          secondDistance = nearestDistance;
          secondPlate = nearestPlate;
          nearestDistance = distance;
          nearestPlate = plateIndex;
        } else if (distance < secondDistance) {
          secondDistance = distance;
          secondPlate = plateIndex;
        }
      }

      const plateBase = plates[nearestPlate].height * 0.28;
      const boundaryGap = Math.sqrt(secondDistance) - Math.sqrt(nearestDistance);
      const boundaryStrength = clamp01(1 - boundaryGap * 7.5);
      const orderedA = Math.min(nearestPlate, secondPlate);
      const orderedB = Math.max(nearestPlate, secondPlate);
      const boundaryHash = hashInts(seedHash, orderedA + 17, orderedB + 53, 71);
      const boundaryType = boundaryHash % 3;
      let boundaryEffect = 0;
      if (boundaryType === 0) {
        boundaryEffect = boundaryStrength * (0.12 + reliefNorm * 0.22 + peakNorm * 0.18);
      } else if (boundaryType === 1) {
        boundaryEffect = -boundaryStrength * (0.08 + reliefNorm * 0.14);
      } else {
        boundaryEffect = boundaryStrength * (0.03 + reliefNorm * 0.08);
      }

      const driftEffect = (plates[nearestPlate].drift - plates[secondPlate].drift) * boundaryStrength * 0.08;

      let continentShape = 0;
      for (const hub of hubs) {
        const dx = (nx - hub.x) / hub.rx;
        const dy = (ny - hub.y) / hub.ry;
        const d2 = dx * dx + dy * dy;
        continentShape += Math.exp(-d2 * 1.8) * hub.weight;
      }
      continentShape /= Math.max(1e-6, hubWeight);

      const lowNoise = fbm(elevSeed, nx * 2.2, ny * 2.2, 4, 0.55, 2);
      const midNoise = fbm(elevSeed ^ 0x68bc21eb, nx * 6.8, ny * 6.8, 3, 0.52, 2.1);
      const highNoise = fbm(elevSeed ^ 0x1f123bb5, nx * 18.5, ny * 18.5, 2, 0.5, 2.35);

      const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
      const interior = smoothRange(edgeDistance, 0.035, 0.28);
      const edgeSea = (1 - interior) * (1.1 + fragNorm * 0.45);

      const raw =
        0.42 +
        continentShape * 0.58 +
        plateBase * 0.28 +
        boundaryEffect +
        driftEffect +
        (lowNoise - 0.5) * (0.25 + reliefNorm * 0.3) +
        (midNoise - 0.5) * (0.12 + fragNorm * 0.24) +
        (highNoise - 0.5) * (0.05 + peakNorm * 0.18 + islandNorm * 0.06) -
        edgeSea;

      rawElevation[index] = raw;
    }
  }

  const targetLand = clamp(0.08 + ((controls.landFraction - 1) / 9) * 0.62, 0.08, 0.7);
  const { threshold, min: elevationMin, max: elevationMax } = histogramThreshold(rawElevation, targetLand);
  const elevationSpan = Math.max(1e-6, elevationMax - elevationMin);
  for (let i = 0; i < total; i += 1) {
    normalizedElevation[i] = clamp01((rawElevation[i] - elevationMin) / elevationSpan);
    initialLand[i] = rawElevation[i] >= threshold ? 1 : 0;
  }

  clampMapBoundaries(width, height, initialLand);
  const smoothingIterations = Math.round(1 + coastNorm * 3);
  const smoothedLand = applyCoastalSmoothing(
    width,
    height,
    initialLand,
    smoothingIterations,
    controls.coastalSmoothing,
    hashString(`${normalizedSeed}|coast`),
    controls.fragmentation,
    controls.islandDensity,
  );
  clampMapBoundaries(width, height, smoothedLand);

  const water = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    water[i] = smoothedLand[i] === 1 ? 0 : 1;
  }

  let { ocean, lake } = floodOcean(width, height, water);

  const distanceToOcean = bfsDistance(width, height, ocean);
  const distanceToLand = bfsDistance(width, height, smoothedLand);

  const temperature = new Float32Array(total);
  const moisture = new Float32Array(total);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const elevation = normalizedElevation[index];
      const latitude = controls.latitudeCenter + (0.5 - ny) * controls.latitudeSpan;
      const latTemp = 1 - Math.abs(latitude) / 90;
      const climateNoise = fbm(climateSeed, nx * 3.2, ny * 3.2, 3, 0.58, 2.05);
      const climateNoise2 = fbm(climateSeed ^ 0xbb40e62d, nx * 5.9, ny * 5.9, 2, 0.55, 2.2);
      const elevationPenalty = Math.max(0, elevation - clamp01((threshold - elevationMin) / elevationSpan));
      let temp = latTemp - elevationPenalty * 0.55 + (climateNoise - 0.5) * 0.1;
      temp = clamp01(temp);

      const oceanProximity = clamp01(1 - distanceToOcean[index] / (26 + controls.fragmentation * 3));
      let wetness =
        0.2 +
        oceanProximity * 0.58 +
        (climateNoise2 - 0.5) * 0.35 +
        controls.climateBias * 0.055 -
        elevationPenalty * 0.18;
      wetness = clamp01(wetness);

      if (smoothedLand[index] === 0) {
        temp = clamp01(temp + 0.05);
        wetness = clamp01(wetness + 0.1);
      }

      temperature[index] = temp;
      moisture[index] = wetness;
    }
  }

  const downstream = new Int32Array(total);
  downstream.fill(-1);
  const flow = new Float32Array(total);
  const bins: number[][] = Array.from({ length: 256 }, () => []);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (smoothedLand[index] === 0) {
        continue;
      }
      flow[index] = 1;

      let bestElevation = normalizedElevation[index];
      let bestNeighbor = -1;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (normalizedElevation[ni] < bestElevation - 1e-4) {
          bestElevation = normalizedElevation[ni];
          bestNeighbor = ni;
        }
      }
      downstream[index] = bestNeighbor;

      const bin = clamp(Math.floor(normalizedElevation[index] * 255), 0, 255);
      bins[bin].push(index);
    }
  }

  for (let bin = 255; bin >= 0; bin -= 1) {
    const entries = bins[bin];
    for (let i = 0; i < entries.length; i += 1) {
      const index = entries[i];
      const out = downstream[index];
      if (out >= 0) {
        flow[out] += flow[index];
      }
    }
  }

  let maxFlow = 1;
  for (let i = 0; i < flow.length; i += 1) {
    if (flow[i] > maxFlow) {
      maxFlow = flow[i];
    }
  }
  for (let i = 0; i < flow.length; i += 1) {
    flow[i] = flow[i] / maxFlow;
  }

  const river = new Uint8Array(total);
  const riverMix = controls.biomeMix.rivers;
  const sourceThreshold = lerp(0.05, 0.008, riverMix);
  const minRiverLength = Math.round(lerp(26, 8, riverMix));
  const minDrop = lerp(0.05, 0.015, riverMix);
  const maxSources = Math.max(8, Math.round((total / 7000) * (0.5 + riverMix * 2.5)));
  const spacing = Math.round(lerp(34, 12, riverMix));
  const sourceCandidates: number[] = [];

  const seaLevelNormalized = clamp01((threshold - elevationMin) / elevationSpan);

  for (let i = 0; i < total; i += 1) {
    if (smoothedLand[i] === 0) {
      continue;
    }
    if (flow[i] < sourceThreshold) {
      continue;
    }
    if (normalizedElevation[i] < seaLevelNormalized + 0.08) {
      continue;
    }
    if (moisture[i] < 0.25) {
      continue;
    }

    const x = i % width;
    const y = Math.floor(i / width);
    if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) {
      continue;
    }

    const sourceNoise = (hashInts(seedHash, x, y, 197) & 0xffff) / 0xffff;
    if (sourceNoise > 0.75 + riverMix * 0.2) {
      continue;
    }
    sourceCandidates.push(i);
  }

  sourceCandidates.sort((a, b) => flow[b] - flow[a]);
  const selectedSources: number[] = [];
  const sinkCandidates: number[] = [];

  const farEnough = (index: number): boolean => {
    const x = index % width;
    const y = Math.floor(index / width);
    const spacingSq = spacing * spacing;
    for (const selected of selectedSources) {
      const sx = selected % width;
      const sy = Math.floor(selected / width);
      const dx = sx - x;
      const dy = sy - y;
      if (dx * dx + dy * dy < spacingSq) {
        return false;
      }
    }
    return true;
  };

  for (let s = 0; s < sourceCandidates.length && selectedSources.length < maxSources; s += 1) {
    const source = sourceCandidates[s];
    if (!farEnough(source)) {
      continue;
    }
    selectedSources.push(source);

    const seen = new Set<number>();
    const path: number[] = [];
    let current = source;
    const startElevation = normalizedElevation[source];
    let terminalWater = false;
    for (let step = 0; step < width + height; step += 1) {
      if (seen.has(current)) {
        break;
      }
      seen.add(current);
      path.push(current);

      if (ocean[current] === 1 || lake[current] === 1) {
        terminalWater = true;
        break;
      }

      const next = downstream[current];
      if (next < 0) {
        sinkCandidates.push(current);
        break;
      }
      current = next;
    }

    const endElevation = normalizedElevation[path[path.length - 1]];
    const drop = startElevation - endElevation;
    if (!terminalWater && path.length < minRiverLength + 6) {
      continue;
    }
    if (path.length < minRiverLength || drop < minDrop) {
      continue;
    }

    for (let i = 0; i < path.length; i += 1) {
      const index = path[i];
      if (smoothedLand[index] === 1) {
        river[index] = 1;
      }
    }
  }

  addSinkLakes(width, height, smoothedLand, ocean, lake, river, sinkCandidates, normalizedElevation);

  const waterFinal = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    waterFinal[i] = smoothedLand[i] === 1 ? 0 : 1;
  }
  ({ ocean, lake } = floodOcean(width, height, waterFinal));

  const distanceToOceanFinal = bfsDistance(width, height, ocean);
  const distanceToLandFinal = bfsDistance(width, height, smoothedLand);

  const biome = new Uint8Array(total);

  const beachWidth = clamp(Math.round(1 + (10 - controls.coastalSmoothing) / 4 + controls.fragmentation / 8), 1, 3);
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
    if (smoothedLand[i] === 0) {
      biome[i] = BIOME_INDEX.ocean;
      continue;
    }

    const oceanDistance = distanceToOceanFinal[i];
    if (oceanDistance <= beachWidth) {
      biome[i] = BIOME_INDEX.beach;
      continue;
    }

    const elevation = normalizedElevation[i];
    const elevationAboveSea = clamp01((elevation - seaLevelNormalized) / Math.max(1e-6, 1 - seaLevelNormalized));
    const mountainThreshold = 0.56 + (1 - reliefNorm) * 0.12 - controls.biomeMix.mountains * 0.08;
    const rockThreshold = mountainThreshold + 0.16 - peakNorm * 0.06;
    if (elevationAboveSea >= rockThreshold) {
      biome[i] = BIOME_INDEX.rock;
      continue;
    }
    if (elevationAboveSea >= mountainThreshold) {
      biome[i] = BIOME_INDEX.mountain;
      continue;
    }

    const temp = temperature[i];
    const wet = moisture[i];

    const grassScore =
      (1 - Math.abs(temp - 0.56)) *
      (1 - Math.abs(wet - 0.45)) *
      (0.5 + controls.biomeMix.grassland * 0.8);
    const forestScore =
      (1 - Math.abs(temp - 0.52)) * wet * (0.45 + controls.biomeMix.temperateForest * 0.95);
    const rainforestScore = temp * wet * (0.3 + controls.biomeMix.rainforest * 1.15);
    const desertScore = temp * (1 - wet) * (0.35 + controls.biomeMix.desert * 1.2);
    const tundraScore = (1 - temp + elevationAboveSea * 0.2) * (0.35 + controls.biomeMix.tundra * 1.1);

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

  const smoothable = new Set<number>([
    BIOME_INDEX.grassland,
    BIOME_INDEX['temperate-forest'],
    BIOME_INDEX.rainforest,
    BIOME_INDEX.desert,
    BIOME_INDEX.tundra,
  ]);
  const smoothedBiome = biome.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!smoothable.has(biome[index])) {
        continue;
      }
      const counts = new Map<number, number>();
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = (y + dy) * width + (x + dx);
        const key = biome[ni];
        if (!smoothable.has(key)) {
          continue;
        }
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let best = biome[index];
      let bestCount = 0;
      for (const [key, count] of counts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          best = key;
        }
      }
      if (bestCount >= 5) {
        smoothedBiome[index] = best;
      }
    }
  }

  const light = computeLight(width, height, normalizedElevation);
  const identityHash = computeIdentityHash(normalizedSeed, width, height, smoothedBiome);

  return {
    controls,
    normalizedSeed,
    width,
    height,
    seaLevel: seaLevelNormalized,
    elevation: normalizedElevation,
    temperature,
    moisture,
    light,
    flow,
    biome: smoothedBiome,
    land: smoothedLand,
    ocean,
    lake,
    river,
    distanceToOcean: distanceToOceanFinal,
    distanceToLand: distanceToLandFinal,
    identityHash,
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
  ocean: '#2f5f89',
  lake: '#4d82a8',
  beach: '#d8c28f',
  river: '#4ea3c8',
  grassland: '#8ba96f',
  'temperate-forest': '#5f8856',
  rainforest: '#3f7554',
  desert: '#c8b27a',
  tundra: '#b7beaf',
  mountain: '#8a8678',
  rock: '#706d66',
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
      const elevation = map.elevation[srcIndex];
      const light = map.light[srcIndex];
      const landDistance = map.distanceToLand[srcIndex];

      let factor = 1;
      if (biomeName === 'ocean') {
        factor = 0.86 + clamp(landDistance, 0, 36) / 36 * 0.24;
      } else if (biomeName === 'lake') {
        factor = 0.92 + clamp(landDistance, 0, 12) / 12 * 0.1;
      } else if (biomeName === 'river') {
        factor = 0.95;
      } else if (biomeName === 'beach') {
        factor = 1.02;
      } else {
        factor = 0.82 + light * 0.34 + elevation * 0.08;
        if (biomeName === 'mountain' || biomeName === 'rock') {
          factor += 0.06;
        }
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
    `v=1`,
    `s=${encodeURIComponent(c.seed)}`,
    `p=${c.preset}`,
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
  const parts = input.split('~');
  for (const part of parts) {
    const equals = part.indexOf('=');
    if (equals <= 0) {
      continue;
    }
    kv.set(part.slice(0, equals), part.slice(equals + 1));
  }
  if (kv.get('v') !== '1') {
    return null;
  }

  const preset = kv.get('p') as PresetOption | undefined;
  const size = kv.get('z') as SizeOption | undefined;
  const aspectRatio = kv.get('a') as AspectRatioOption | undefined;
  if (!preset || !size || !aspectRatio) {
    return null;
  }

  const seedValue = kv.get('s') ? decodeURIComponent(kv.get('s') as string) : 'DefaultSeed';
  const parsed: ContinentControls = {
    seed: seedValue,
    preset,
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

export function withSeed(controls: ContinentControls, seed: string): ContinentControls {
  const next = cloneControls(controls);
  next.seed = seed.trim().length > 0 ? seed.trim() : randomHumanSeed();
  return clampControls(next);
}

export function biomeNameForIndex(index: number): ContinentBiome {
  const safe = clamp(Math.round(index), 0, BIOME_TYPES.length - 1);
  return BIOME_TYPES[safe];
}

export function controlsIdentity(controls: ContinentControls): string {
  return exportContinentControls(controls).code;
}

export function controlsFromPreset(preset: PresetOption, seed?: string): ContinentControls {
  const base = defaultControlsWithSeed(seed);
  return applyPreset(base, preset);
}


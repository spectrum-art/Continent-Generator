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

export type ContinentFeatureVector = {
  landRatio: number;
  coastlineComplexity: number;
  islandCount: number;
  offshoreIslandRatio: number;
  ridgeCoherence: number;
  riverComponents: number;
  majorRiverComponents: number;
  bboxFillRatio: number;
  cornerRetention: number;
};

export type DistinctnessPair = 'archipelago-vs-earth-like' | 'broken-coast-vs-earth-like' | 'archipelago-vs-broken-coast';

export type DistinctnessPairResult = {
  pair: DistinctnessPair;
  separatingMetrics: string[];
  pass: boolean;
};

export type DistinctnessSeedResult = {
  seed: string;
  pairResults: DistinctnessPairResult[];
  pass: boolean;
};

export type PresetDistinctnessSuite = {
  seeds: string[];
  seedResults: DistinctnessSeedResult[];
  pass: boolean;
};

export type PerfProbeResult = {
  durationMs: number;
  frames: number;
  avgFps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  worstFrameMs: number;
  hitchCount: number;
  zoom: number;
};

type PresetSignature = {
  landBias: number;
  seaEdgeBias: number;
  attractorScale: number;
  attractorWeightBias: number;
  coastFractureBias: number;
  islandBias: number;
  ridgeBias: number;
  riverBias: number;
  climateWetnessBias: number;
};

type Plate = {
  x: number;
  y: number;
  uplift: number;
  driftX: number;
  driftY: number;
};

type LandComponent = {
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  touchesEdge: boolean;
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

const SIZE_CONFIG: Record<SizeOption, { shortEdge: number; basePlates: number; fieldScale: number }> = {
  isle: { shortEdge: 240, basePlates: 6, fieldScale: 2 },
  region: { shortEdge: 360, basePlates: 9, fieldScale: 2 },
  subcontinent: { shortEdge: 560, basePlates: 13, fieldScale: 2 },
  supercontinent: { shortEdge: 760, basePlates: 18, fieldScale: 1 },
};

const ASPECT_CONFIG: Record<AspectRatioOption, number> = {
  wide: 2,
  landscape: 1.5,
  square: 1,
  portrait: 2 / 3,
  narrow: 0.5,
};

const PRESET_SIGNATURES: Record<PresetOption, PresetSignature> = {
  'earth-like': {
    landBias: 0,
    seaEdgeBias: 0.05,
    attractorScale: 1,
    attractorWeightBias: 1,
    coastFractureBias: 0.9,
    islandBias: 0.4,
    ridgeBias: 1,
    riverBias: 1,
    climateWetnessBias: 0,
  },
  'archipelago': {
    landBias: -0.16,
    seaEdgeBias: 0.16,
    attractorScale: 0.68,
    attractorWeightBias: 0.72,
    coastFractureBias: 1.45,
    islandBias: 1.8,
    ridgeBias: 0.7,
    riverBias: 0.8,
    climateWetnessBias: 0.1,
  },
  'mountain-kingdoms': {
    landBias: 0.08,
    seaEdgeBias: 0.04,
    attractorScale: 1.05,
    attractorWeightBias: 1.18,
    coastFractureBias: 0.85,
    islandBias: 0.2,
    ridgeBias: 1.55,
    riverBias: 1,
    climateWetnessBias: -0.05,
  },
  riverlands: {
    landBias: 0.03,
    seaEdgeBias: 0.03,
    attractorScale: 1,
    attractorWeightBias: 1,
    coastFractureBias: 0.82,
    islandBias: 0.28,
    ridgeBias: 0.78,
    riverBias: 1.6,
    climateWetnessBias: 0.3,
  },
  'dune-world': {
    landBias: 0.12,
    seaEdgeBias: 0.02,
    attractorScale: 1.1,
    attractorWeightBias: 1.06,
    coastFractureBias: 0.66,
    islandBias: 0.05,
    ridgeBias: 1.05,
    riverBias: 0.22,
    climateWetnessBias: -0.62,
  },
  'rain-world': {
    landBias: -0.02,
    seaEdgeBias: 0.06,
    attractorScale: 0.96,
    attractorWeightBias: 0.9,
    coastFractureBias: 1.18,
    islandBias: 0.95,
    ridgeBias: 0.92,
    riverBias: 1.75,
    climateWetnessBias: 0.72,
  },
  'broken-coast': {
    landBias: 0.02,
    seaEdgeBias: 0.08,
    attractorScale: 1.2,
    attractorWeightBias: 1.26,
    coastFractureBias: 1.8,
    islandBias: 1.24,
    ridgeBias: 1.15,
    riverBias: 0.95,
    climateWetnessBias: 0,
  },
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
    coastalSmoothing: 3,
    plateCount: 1,
    mountainPeakiness: 4,
    climateBias: 1,
    islandDensity: 10,
    biomeMix: {
      rivers: 0.45,
      grassland: 0.8,
      temperateForest: 0.9,
      rainforest: 0.75,
      desert: 0.35,
      mountains: 0.45,
      tundra: 0.2,
    },
  },
  'mountain-kingdoms': {
    landFraction: 6,
    relief: 9,
    fragmentation: 4,
    coastalSmoothing: 4,
    plateCount: 1,
    mountainPeakiness: 10,
    climateBias: -1,
    islandDensity: 1,
    biomeMix: {
      rivers: 0.6,
      grassland: 0.55,
      temperateForest: 0.85,
      rainforest: 0.25,
      desert: 0.4,
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
      grassland: 1,
      temperateForest: 0.95,
      rainforest: 0.6,
      desert: 0.25,
      mountains: 0.45,
      tundra: 0.2,
    },
  },
  'dune-world': {
    landFraction: 6,
    relief: 6,
    fragmentation: 3,
    coastalSmoothing: 8,
    plateCount: -1,
    mountainPeakiness: 6,
    climateBias: -5,
    islandDensity: 1,
    biomeMix: {
      rivers: 0.15,
      grassland: 0.4,
      temperateForest: 0.2,
      rainforest: 0.05,
      desert: 1,
      mountains: 0.65,
      tundra: 0.1,
    },
  },
  'rain-world': {
    landFraction: 5,
    relief: 6,
    fragmentation: 7,
    coastalSmoothing: 5,
    plateCount: 0,
    mountainPeakiness: 5,
    climateBias: 5,
    islandDensity: 6,
    biomeMix: {
      rivers: 1,
      grassland: 0.7,
      temperateForest: 1,
      rainforest: 1,
      desert: 0.1,
      mountains: 0.55,
      tundra: 0.15,
    },
  },
  'broken-coast': {
    landFraction: 5,
    relief: 6,
    fragmentation: 9,
    coastalSmoothing: 2,
    plateCount: 0,
    mountainPeakiness: 6,
    climateBias: 0,
    islandDensity: 8,
    biomeMix: {
      rivers: 0.6,
      grassland: 0.85,
      temperateForest: 0.82,
      rainforest: 0.4,
      desert: 0.5,
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
  const patch = PRESET_PATCHES[preset];
  const merged: ContinentControls = {
    ...cloneControls(base),
    ...patch,
    preset,
    biomeMix: {
      ...base.biomeMix,
      ...(patch.biomeMix ?? {}),
    },
  };
  return clampControls(merged);
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
  return {
    width,
    height,
    basePlates: sizeConfig.basePlates,
    fieldScale: sizeConfig.fieldScale,
  };
}

function histogramThreshold(values: Float32Array, targetLand: number): { threshold: number; min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
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

function carveCoastAndIslands(
  width: number,
  height: number,
  land: Uint8Array,
  seed: number,
  fragmentation: number,
  islandDensity: number,
  signature: PresetSignature,
): void {
  const frag = (fragmentation - 1) / 9;
  const island = islandDensity / 10;
  const working = land.slice();

  for (let y = 2; y < height - 2; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 2; x < width - 2; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      let neighborLand = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        neighborLand += working[(y + dy) * width + (x + dx)];
      }
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
      const nearCoast = neighborLand >= 2 && neighborLand <= 6;
      const coastNoise = fbm(seed, nx * 18, ny * 18, 3, 0.55, 2.1);
      const fjordNoise = fbm(seed ^ 0x6c8e9cf5, nx * 34, ny * 34, 2, 0.5, 2.3);

      if (working[index] === 1 && nearCoast) {
        const carveThreshold =
          0.76 - frag * 0.34 * signature.coastFractureBias - (1 - edge) * 0.08 * signature.coastFractureBias;
        if (coastNoise > carveThreshold || fjordNoise > carveThreshold + 0.03) {
          land[index] = 0;
        }
      } else if (working[index] === 0 && neighborLand >= 5) {
        const islandThreshold = 0.93 - island * 0.25 * signature.islandBias - frag * 0.12;
        if (coastNoise > islandThreshold && edge > 0.06 && edge < 0.3) {
          land[index] = 1;
        }
      }
    }
  }

  clampMapBoundaries(width, height, land);
}

function applyCoastalSmoothing(
  width: number,
  height: number,
  land: Uint8Array,
  smoothingLevel: number,
): Uint8Array {
  const smooth = (smoothingLevel - 1) / 9;
  const passes = Math.round(1 + smooth * 5);
  let current = land.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    const landKeep = Math.round(2 + smooth * 5);
    const waterFill = Math.round(7 - smooth * 1.1);

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        let neighbors = 0;
        for (const [dx, dy] of NEIGHBORS_8) {
          neighbors += current[(y + dy) * width + (x + dx)];
        }

        if (current[index] === 1) {
          next[index] = neighbors >= landKeep ? 1 : 0;
        } else {
          next[index] = neighbors >= waterFill ? 1 : 0;
        }
      }
    }

    clampMapBoundaries(width, height, next);
    current = next;
  }

  if (smooth > 0.55) {
    const finishingPasses = Math.round(1 + smooth * 3);
    for (let pass = 0; pass < finishingPasses; pass += 1) {
      const next = current.slice();
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = y * width + x;
          let neighbors = 0;
          for (const [dx, dy] of NEIGHBORS_8) {
            neighbors += current[(y + dy) * width + (x + dx)];
          }
          if (current[index] === 1) {
            next[index] = neighbors >= 5 ? 1 : 0;
          } else {
            next[index] = neighbors >= 6 ? 1 : 0;
          }
        }
      }
      clampMapBoundaries(width, height, next);
      current = next;
    }
  }

  if (smooth > 0.25) {
    const minLandComponentArea = Math.round(8 + smooth * 140);
    const minWaterPocketArea = Math.round(8 + smooth * 110);
    pruneSmallComponents(width, height, current, 1, minLandComponentArea, 0);
    pruneSmallComponents(width, height, current, 0, minWaterPocketArea, 1);
    clampMapBoundaries(width, height, current);
  }

  return current;
}

function pruneSmallComponents(
  width: number,
  height: number,
  mask: Uint8Array,
  targetValue: 0 | 1,
  minArea: number,
  replacement: 0 | 1,
): void {
  const visited = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    if (visited[index] === 1 || mask[index] !== targetValue) {
      continue;
    }

    const queue: number[] = [index];
    visited[index] = 1;
    const component: number[] = [];
    let touchesBoundary = false;

    while (queue.length > 0) {
      const current = queue.pop() as number;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBoundary = true;
      }

      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const nextIndex = ny * width + nx;
        if (visited[nextIndex] === 1 || mask[nextIndex] !== targetValue) {
          continue;
        }
        visited[nextIndex] = 1;
        queue.push(nextIndex);
      }
    }

    if (touchesBoundary || component.length >= minArea) {
      continue;
    }

    for (const cell of component) {
      mask[cell] = replacement;
    }
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

function computeLightAndSlope(width: number, height: number, elevation: Float32Array): {
  light: Float32Array;
  slope: Float32Array;
} {
  const light = new Float32Array(width * height);
  const slope = new Float32Array(width * height);

  const lx = -0.62;
  const ly = -0.4;
  const lz = 0.68;
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const lnx = lx / lLen;
  const lny = ly / lLen;
  const lnz = lz / lLen;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = elevation[y * width + Math.max(0, x - 1)];
      const right = elevation[y * width + Math.min(width - 1, x + 1)];
      const up = elevation[Math.max(0, y - 1) * width + x];
      const down = elevation[Math.min(height - 1, y + 1) * width + x];

      const dx = right - left;
      const dy = down - up;
      const nx = -dx * 2.8;
      const ny = -dy * 2.8;
      const nz = 1;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const nnx = nx / nLen;
      const nny = ny / nLen;
      const nnz = nz / nLen;
      const dot = nnx * lnx + nny * lny + nnz * lnz;
      light[y * width + x] = clamp01(dot * 0.5 + 0.5);
      slope[y * width + x] = clamp01(Math.hypot(dx, dy) * 5.2);
    }
  }

  return { light, slope };
}

function checksumFloatArray(values: Float32Array): number {
  let hash = 2166136261;
  for (let i = 0; i < values.length; i += 37) {
    const quantized = Math.round(values[i] * 10_000);
    hash ^= quantized;
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
  ridge: Float32Array,
  land: Uint8Array,
  river: Uint8Array,
  biome: Uint8Array,
): string {
  let hash = hashString(`${normalizedSeed}|${width}|${height}|${controlsHash}`);
  const checks = [
    checksumFloatArray(elevation),
    checksumFloatArray(ridge),
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

function landComponents(width: number, height: number, land: Uint8Array): LandComponent[] {
  const total = width * height;
  const visited = new Uint8Array(total);
  const components: LandComponent[] = [];

  for (let i = 0; i < total; i += 1) {
    if (land[i] === 0 || visited[i] === 1) {
      continue;
    }

    let area = 0;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let touchesEdge = false;

    const queue: number[] = [i];
    visited[i] = 1;

    while (queue.length > 0) {
      const current = queue.pop() as number;
      area += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesEdge = true;
      }

      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (land[ni] === 0 || visited[ni] === 1) {
          continue;
        }
        visited[ni] = 1;
        queue.push(ni);
      }
    }

    components.push({ area, minX, maxX, minY, maxY, touchesEdge });
  }

  components.sort((a, b) => b.area - a.area);
  return components;
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

export function measureContinentFeatures(map: GeneratedContinent): ContinentFeatureVector {
  const { width, height, land, river, ridge, coastPerimeter, landArea } = map;
  const components = landComponents(width, height, land);
  const islandCount = Math.max(0, components.length - 1);

  let offshoreIslands = 0;
  if (components.length > 1) {
    for (let i = 1; i < components.length; i += 1) {
      const component = components[i];
      if (component.touchesEdge) {
        continue;
      }
      const edgeDistance = Math.min(
        component.minX,
        component.minY,
        width - 1 - component.maxX,
        height - 1 - component.maxY,
      );
      if (edgeDistance > Math.min(width, height) * 0.08) {
        offshoreIslands += 1;
      }
    }
  }

  const largest = components[0];
  let bboxFillRatio = 0;
  let cornerRetention = 0;
  if (largest) {
    const bboxArea = (largest.maxX - largest.minX + 1) * (largest.maxY - largest.minY + 1);
    bboxFillRatio = largest.area / Math.max(1, bboxArea);

    const cornerWindow = Math.max(4, Math.round(Math.min(width, height) * 0.08));
    let cornerLand = 0;
    let cornerCells = 0;
    const cornerChecks = [
      { x0: 0, y0: 0 },
      { x0: width - cornerWindow, y0: 0 },
      { x0: 0, y0: height - cornerWindow },
      { x0: width - cornerWindow, y0: height - cornerWindow },
    ];
    for (const corner of cornerChecks) {
      for (let y = corner.y0; y < corner.y0 + cornerWindow; y += 1) {
        for (let x = corner.x0; x < corner.x0 + cornerWindow; x += 1) {
          const index = y * width + x;
          cornerCells += 1;
          cornerLand += land[index];
        }
      }
    }
    cornerRetention = cornerLand / Math.max(1, cornerCells);
  }

  let mountainTiles = 0;
  let ridgeSignal = 0;
  let ridgeStrong = 0;
  for (let i = 0; i < map.biome.length; i += 1) {
    const biome = BIOME_TYPES[map.biome[i]];
    if (biome === 'mountain' || biome === 'rock') {
      mountainTiles += 1;
      ridgeSignal += ridge[i];
      if (ridge[i] > 0.5) {
        ridgeStrong += 1;
      }
    }
  }
  const ridgeCoherence = mountainTiles > 0
    ? clamp01((ridgeSignal / mountainTiles) * 0.6 + ridgeStrong / mountainTiles * 0.8)
    : 0;

  const riverVisited = new Uint8Array(river.length);
  let riverComponents = 0;
  let majorRiverComponents = 0;
  for (let i = 0; i < river.length; i += 1) {
    if (river[i] === 0 || riverVisited[i] === 1) {
      continue;
    }
    riverComponents += 1;
    let componentSize = 0;
    const queue: number[] = [i];
    riverVisited[i] = 1;
    while (queue.length > 0) {
      const current = queue.pop() as number;
      componentSize += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (river[ni] === 0 || riverVisited[ni] === 1) {
          continue;
        }
        riverVisited[ni] = 1;
        queue.push(ni);
      }
    }
    if (componentSize >= 28) {
      majorRiverComponents += 1;
    }
  }

  const landRatio = landArea / Math.max(1, width * height);
  const coastlineComplexity = coastPerimeter * coastPerimeter / Math.max(1, landArea);

  return {
    landRatio,
    coastlineComplexity,
    islandCount,
    offshoreIslandRatio: islandCount > 0 ? offshoreIslands / islandCount : 0,
    ridgeCoherence,
    riverComponents,
    majorRiverComponents,
    bboxFillRatio,
    cornerRetention,
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

export function generateContinent(input: ContinentControls): GeneratedContinent {
  const controls = clampControls(input);
  const normalizedSeed = normalizeSeed(controls.seed);
  const dimensions = mapDimensions(controls.size, controls.aspectRatio);
  const { width, height, basePlates, fieldScale } = dimensions;
  const total = width * height;

  const signature = PRESET_SIGNATURES[controls.preset];
  const reliefNorm = (controls.relief - 1) / 9;
  const fragNorm = (controls.fragmentation - 1) / 9;
  const smoothingNorm = (controls.coastalSmoothing - 1) / 9;
  const peakNorm = (controls.mountainPeakiness - 1) / 9;
  const islandNorm = controls.islandDensity / 10;

  const seedHash = hashString(normalizedSeed);
  const plateSeed = hashString(`${normalizedSeed}|plates|${width}|${height}|${controls.preset}`);
  const elevSeed = hashString(`${normalizedSeed}|elev|${controls.size}|${controls.aspectRatio}`);
  const climateSeed = hashString(`${normalizedSeed}|climate|${controls.latitudeCenter}|${controls.latitudeSpan}`);

  const plateCount = clamp(Math.round(basePlates + controls.plateCount * 4), 4, 34);
  const plateRng = mulberry32(plateSeed);
  const plates: Plate[] = [];
  for (let i = 0; i < plateCount; i += 1) {
    const driftAngle = plateRng() * Math.PI * 2;
    plates.push({
      x: plateRng(),
      y: plateRng(),
      uplift: lerp(-1, 1, plateRng()),
      driftX: Math.cos(driftAngle),
      driftY: Math.sin(driftAngle),
    });
  }

  const landFractionNorm = (controls.landFraction - 1) / 9;
  let attractorCount = clamp(Math.round(1 + (1 - fragNorm) * 2 + landFractionNorm * 2), 1, 8);
  if (controls.preset === 'archipelago') {
    attractorCount = clamp(attractorCount + 3, 4, 12);
  }
  if (controls.preset === 'broken-coast') {
    attractorCount = clamp(attractorCount - 1, 1, 5);
  }

  const attractorRng = mulberry32(hashString(`${normalizedSeed}|attractors|${controls.preset}|${attractorCount}`));
  const attractors: Array<{ x: number; y: number; rx: number; ry: number; weight: number }> = [];
  let attractorWeight = 0;
  for (let i = 0; i < attractorCount; i += 1) {
    const rx = lerp(0.14, 0.48, attractorRng()) * signature.attractorScale;
    const ry = lerp(0.14, 0.48, attractorRng()) * signature.attractorScale;
    const weight = lerp(0.45, 1.55, attractorRng()) * signature.attractorWeightBias;
    let x = lerp(0.13, 0.87, attractorRng());
    let y = lerp(0.13, 0.87, attractorRng());

    if (controls.preset === 'archipelago') {
      const arc = i / Math.max(1, attractorCount - 1);
      x = 0.16 + arc * 0.68 + (attractorRng() - 0.5) * 0.09;
      y = 0.45 + Math.sin(arc * Math.PI * 2.2 + attractorRng() * 0.4) * 0.2;
    } else if (controls.preset === 'broken-coast' && i > 0) {
      x = lerp(0.08, 0.92, attractorRng());
      y = lerp(0.06, 0.94, attractorRng());
    }

    attractors.push({ x, y, rx, ry, weight });
    attractorWeight += weight;
  }

  const rawElevation = downsampleField(width, height, fieldScale, (fx, fy) => {
    const nx = fx / Math.max(1, width - 1);
    const ny = fy / Math.max(1, height - 1);

    let nearestDistance = Number.POSITIVE_INFINITY;
    let secondDistance = Number.POSITIVE_INFINITY;
    let nearestPlate = 0;
    let secondPlate = 0;

    for (let i = 0; i < plates.length; i += 1) {
      const plate = plates[i];
      const dx = nx - plate.x;
      const dy = ny - plate.y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        secondDistance = nearestDistance;
        secondPlate = nearestPlate;
        nearestDistance = distance;
        nearestPlate = i;
      } else if (distance < secondDistance) {
        secondDistance = distance;
        secondPlate = i;
      }
    }

    const plateA = plates[nearestPlate];
    const plateB = plates[secondPlate];
    const boundaryGap = Math.sqrt(secondDistance) - Math.sqrt(nearestDistance);
    const boundaryStrength = clamp01(1 - boundaryGap * 8.2);

    const orderedA = Math.min(nearestPlate, secondPlate);
    const orderedB = Math.max(nearestPlate, secondPlate);
    const boundaryHash = hashInts(seedHash, orderedA + 17, orderedB + 41, 911);
    const boundaryType = boundaryHash % 3;

    const relativeDrift = Math.abs(plateA.driftX - plateB.driftX) + Math.abs(plateA.driftY - plateB.driftY);
    let boundaryUplift = 0;
    if (boundaryType === 0) {
      boundaryUplift = boundaryStrength * (0.16 + reliefNorm * 0.22 + peakNorm * 0.26) * signature.ridgeBias;
    } else if (boundaryType === 1) {
      boundaryUplift = -boundaryStrength * (0.08 + reliefNorm * 0.12);
    } else {
      boundaryUplift = boundaryStrength * (0.04 + reliefNorm * 0.06 + relativeDrift * 0.02);
    }

    let attractorField = 0;
    for (const attractor of attractors) {
      const dx = (nx - attractor.x) / attractor.rx;
      const dy = (ny - attractor.y) / attractor.ry;
      const d2 = dx * dx + dy * dy;
      attractorField += Math.exp(-d2 * 1.7) * attractor.weight;
    }
    attractorField /= Math.max(1e-6, attractorWeight);

    const low = fbm(elevSeed, nx * 2.2, ny * 2.2, 4, 0.56, 2);
    const mid = fbm(elevSeed ^ 0x68bc21eb, nx * 7.3, ny * 7.3, 3, 0.52, 2.06);
    const high = fbm(elevSeed ^ 0x1f123bb5, nx * 18.8, ny * 18.8, 2, 0.5, 2.3);

    const ridgeLine = Math.pow(1 - Math.abs(fbm(elevSeed ^ 0xd73ac1bb, nx * 11.5, ny * 11.5, 2, 0.54, 2.1) - 0.5) * 2, 1.4 + peakNorm * 2);
    const ridgeDirectional = Math.pow(1 - Math.abs(fbm(elevSeed ^ 0x7a2fd905, nx * 2.7 + ny * 8.2, ny * 2.3, 2, 0.55, 2.1) - 0.5) * 2, 1.1 + peakNorm * 1.4);
    const ridgeField = boundaryStrength * ridgeLine * ridgeDirectional;

    const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
    const edgeWarp = (fbm(elevSeed ^ 0x43d8b19f, nx * 3.4, ny * 3.4, 2, 0.57, 2.1) - 0.5) * 0.06;
    const edgeInterior = smoothRange(edgeDistance + edgeWarp, 0.04, 0.32 - fragNorm * 0.06);
    const edgeSeaBias = (1 - edgeInterior) * (1.1 + signature.seaEdgeBias + fragNorm * 0.3);

    const raw =
      0.42 +
      attractorField * (0.48 + landFractionNorm * 0.26) +
      plateA.uplift * 0.14 +
      boundaryUplift +
      ridgeField * (0.16 + peakNorm * 0.2) * signature.ridgeBias +
      (low - 0.5) * (0.22 + reliefNorm * 0.25) +
      (mid - 0.5) * (0.12 + fragNorm * 0.2) +
      (high - 0.5) * (0.04 + peakNorm * 0.08 + islandNorm * 0.05) -
      edgeSeaBias;

    return raw;
  });

  const targetLand = clamp(0.08 + landFractionNorm * 0.64 + signature.landBias, 0.08, 0.72);
  const { threshold, min: elevMin, max: elevMax } = histogramThreshold(rawElevation, targetLand);
  const elevSpan = Math.max(1e-6, elevMax - elevMin);

  const elevation = new Float32Array(total);
  const ridge = new Float32Array(total);
  const land = new Uint8Array(total);

  const ridgeSeed = elevSeed ^ 0x38fd0ac1;
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      elevation[index] = clamp01((rawElevation[index] - elevMin) / elevSpan);
      land[index] = rawElevation[index] >= threshold ? 1 : 0;
      ridge[index] = clamp01(
        Math.pow(1 - Math.abs(fbm(ridgeSeed, nx * 7.2, ny * 7.2, 2, 0.55, 2.1) - 0.5) * 2, 1.2 + peakNorm * 1.6) *
          clamp01((elevation[index] - 0.45) * 2),
      );
    }
  }

  clampMapBoundaries(width, height, land);
  carveCoastAndIslands(width, height, land, hashString(`${normalizedSeed}|coast-carve`), controls.fragmentation, controls.islandDensity, signature);
  const smoothedLand = applyCoastalSmoothing(width, height, land, controls.coastalSmoothing);
  clampMapBoundaries(width, height, smoothedLand);

  const water = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    water[i] = smoothedLand[i] === 1 ? 0 : 1;
  }

  let { ocean, lake } = floodOcean(width, height, water);
  const distanceToOcean = bfsDistance(width, height, ocean);
  const distanceToLand = bfsDistance(width, height, smoothedLand);

  const seaLevel = clamp01((threshold - elevMin) / elevSpan);

  const temperature = new Float32Array(total);
  const moisture = new Float32Array(total);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const latitude = controls.latitudeCenter + (0.5 - ny) * controls.latitudeSpan;
    const latTemp = 1 - Math.abs(latitude) / 90;

    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const elev = elevation[index];
      const localNoise = fbm(climateSeed, nx * 3.5, ny * 3.5, 3, 0.58, 2.05);
      const localNoise2 = fbm(climateSeed ^ 0x59d2ca8f, nx * 5.4, ny * 5.4, 2, 0.55, 2.2);

      const elevPenalty = Math.max(0, elev - seaLevel) * 0.58;
      let temp = latTemp - elevPenalty + (localNoise - 0.5) * 0.11;
      temp = clamp01(temp);

      const oceanProximity = clamp01(1 - distanceToOcean[index] / (26 + controls.fragmentation * 3));
      const rainShadow = x > 0
        ? clamp01(ridge[index - 1] * (elevation[index - 1] - elev + 0.2)) * 0.12
        : 0;
      let wet =
        0.2 +
        oceanProximity * 0.58 +
        (localNoise2 - 0.5) * 0.32 +
        controls.climateBias * 0.055 +
        signature.climateWetnessBias * 0.16 -
        elevPenalty * 0.17 -
        rainShadow;

      if (smoothedLand[index] === 0) {
        temp = clamp01(temp + 0.05);
        wet = clamp01(wet + 0.1);
      }

      temperature[index] = temp;
      moisture[index] = clamp01(wet);
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
      let bestElevation = elevation[index];
      let bestNeighbor = -1;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (elevation[ni] < bestElevation - 1e-4) {
          bestElevation = elevation[ni];
          bestNeighbor = ni;
        }
      }
      downstream[index] = bestNeighbor;

      const bin = clamp(Math.floor(elevation[index] * 255), 0, 255);
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
    flow[i] = flow[i] / maxFlow;
  }

  const river = new Uint8Array(total);
  const riverMix = controls.biomeMix.rivers * signature.riverBias;
  const sourceThreshold = lerp(0.09, 0.012, clamp01(riverMix));
  const minRiverLength = Math.round(lerp(40, 10, clamp01(riverMix)));
  const minDrop = lerp(0.07, 0.02, clamp01(riverMix));
  const maxSources = Math.max(6, Math.round((total / 9_000) * (0.55 + clamp01(riverMix) * 2.4)));
  const spacing = Math.round(lerp(42, 14, clamp01(riverMix)));

  const sourceCandidates: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (smoothedLand[i] === 0) {
      continue;
    }
    if (flow[i] < sourceThreshold || moisture[i] < 0.2) {
      continue;
    }
    if (elevation[i] < seaLevel + 0.08) {
      continue;
    }
    sourceCandidates.push(i);
  }
  sourceCandidates.sort((a, b) => flow[b] - flow[a]);

  const selectedSources: number[] = [];
  const sinkCandidates: number[] = [];

  const isFarEnough = (index: number): boolean => {
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
    if (!isFarEnough(source)) {
      continue;
    }
    selectedSources.push(source);

    const seen = new Set<number>();
    const path: number[] = [];
    let current = source;
    const startElevation = elevation[source];
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

      if (river[current] === 1 && current !== source) {
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

    const endElevation = elevation[path[path.length - 1]];
    const drop = startElevation - endElevation;
    if (path.length < minRiverLength || drop < minDrop) {
      continue;
    }
    if (!terminalWater && path.length < minRiverLength + 10) {
      continue;
    }

    for (let i = 0; i < path.length; i += 1) {
      const index = path[i];
      if (smoothedLand[index] === 1) {
        river[index] = 1;
      }
    }
  }

  for (let i = 0; i < total; i += 1) {
    if (river[i] === 1 && flow[i] > 0.45) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (smoothedLand[ni] === 1 && elevation[ni] <= elevation[i] + 0.035 && flow[ni] > 0.2) {
          river[ni] = 1;
        }
      }
    }
  }

  if (sinkCandidates.length > 0) {
    let lakeCreated = 0;
    for (const sink of sinkCandidates) {
      if (lakeCreated >= 64) {
        break;
      }
      if (smoothedLand[sink] === 0 || river[sink] === 1) {
        continue;
      }
      const x = sink % width;
      const y = Math.floor(sink / width);
      if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) {
        continue;
      }
      const basinLevel = elevation[sink] + 0.022 + (hashInts(seedHash, x, y, 67) % 9) * 0.001;
      const basin: number[] = [];
      const queue: number[] = [sink];
      const visited = new Set<number>([sink]);
      while (queue.length > 0 && basin.length < 40) {
        const current = queue.pop() as number;
        if (smoothedLand[current] === 0 || river[current] === 1) {
          continue;
        }
        if (elevation[current] <= basinLevel) {
          basin.push(current);
          const cx = current % width;
          const cy = Math.floor(current / width);
          for (const [dx, dy] of NEIGHBORS_8) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            const ni = ny * width + nx;
            if (visited.has(ni)) {
              continue;
            }
            visited.add(ni);
            queue.push(ni);
          }
        }
      }

      if (basin.length >= 3) {
        for (const index of basin) {
          smoothedLand[index] = 0;
        }
        lakeCreated += 1;
      }
    }
  }

  const waterFinal = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    waterFinal[i] = smoothedLand[i] === 1 ? 0 : 1;
  }
  ({ ocean, lake } = floodOcean(width, height, waterFinal));
  const distanceToOceanFinal = bfsDistance(width, height, ocean);
  const distanceToLandFinal = bfsDistance(width, height, smoothedLand);

  const biome = new Uint8Array(total);
  const beachWidth = clamp(Math.round(1 + (10 - controls.coastalSmoothing) / 3), 1, 4);
  const mountainThreshold = 0.53 + (1 - reliefNorm) * 0.12 - controls.biomeMix.mountains * 0.08;
  const rockThreshold = mountainThreshold + 0.16 - peakNorm * 0.08;

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

    if (distanceToOceanFinal[i] <= beachWidth) {
      biome[i] = BIOME_INDEX.beach;
      continue;
    }

    const elevAboveSea = clamp01((elevation[i] - seaLevel) / Math.max(1e-6, 1 - seaLevel));
    const ridgeBoost = ridge[i] * 0.12;

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

    const grassScore =
      (1 - Math.abs(temp - 0.56)) * (1 - Math.abs(wet - 0.45)) * (0.5 + controls.biomeMix.grassland * 0.75);
    const forestScore =
      (1 - Math.abs(temp - 0.52)) * wet * (0.45 + controls.biomeMix.temperateForest * 0.95);
    const rainforestScore = temp * wet * (0.28 + controls.biomeMix.rainforest * 1.2);
    const desertScore = temp * (1 - wet) * (0.35 + controls.biomeMix.desert * 1.2);
    const tundraScore = (1 - temp + elevAboveSea * 0.25) * (0.35 + controls.biomeMix.tundra * 1.15);

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
  const biomeSmoothed = biome.slice();
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
        biomeSmoothed[index] = best;
      }
    }
  }

  const { light, slope } = computeLightAndSlope(width, height, elevation);
  const { landArea, coastPerimeter } = computeLandAndCoast(width, height, smoothedLand);

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
    elevation,
    ridge,
    smoothedLand,
    river,
    biomeSmoothed,
  );

  return {
    controls,
    normalizedSeed,
    width,
    height,
    fieldScale,
    seaLevel,
    elevation,
    ridge,
    slope,
    temperature,
    moisture,
    light,
    flow,
    biome: biomeSmoothed,
    land: smoothedLand,
    ocean,
    lake,
    river,
    distanceToOcean: distanceToOceanFinal,
    distanceToLand: distanceToLandFinal,
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
  ocean: '#2f5f89',
  lake: '#4d82a8',
  beach: '#d6c08a',
  river: '#4ca0c6',
  grassland: '#89a86c',
  'temperate-forest': '#5a8552',
  rainforest: '#3e7151',
  desert: '#c8b179',
  tundra: '#b8c0b2',
  mountain: '#8a8678',
  rock: '#6f6b63',
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
      const detail = fbm(hashString(`${map.normalizedSeed}|render`), nx * 42, ny * 42, 2, 0.55, 2.2) - 0.5;

      let factor = 1;
      if (biomeName === 'ocean') {
        factor = 0.82 + clamp(distLand, 0, 48) / 48 * 0.3;
      } else if (biomeName === 'lake') {
        factor = 0.9 + clamp(distLand, 0, 14) / 14 * 0.15;
      } else if (biomeName === 'river') {
        factor = 0.9;
      } else if (biomeName === 'beach') {
        factor = 1.04;
      } else {
        factor =
          0.67 +
          light * 0.58 +
          elev * 0.12 +
          slope * 0.1 +
          ridge * 0.12 +
          detail * 0.08;
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
    'v=1',
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
  for (const part of input.split('~')) {
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

  const parsed: ContinentControls = {
    seed: kv.get('s') ? decodeURIComponent(kv.get('s') as string) : 'DefaultSeed',
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

export function controlsIdentity(controls: ContinentControls): string {
  return exportContinentControls(controls).code;
}

export function controlsFromPreset(preset: PresetOption, seed?: string): ContinentControls {
  const base = defaultControlsWithSeed(seed);
  return applyPreset(base, preset);
}

export function biomeNameForIndex(index: number): ContinentBiome {
  const safe = clamp(Math.round(index), 0, BIOME_TYPES.length - 1);
  return BIOME_TYPES[safe];
}

export function presetDistinctnessVectors(seed: string): Record<PresetOption, ContinentFeatureVector> {
  const vectors = {} as Record<PresetOption, ContinentFeatureVector>;
  const presets: PresetOption[] = [
    'earth-like',
    'archipelago',
    'mountain-kingdoms',
    'riverlands',
    'dune-world',
    'rain-world',
    'broken-coast',
  ];
  for (const preset of presets) {
    const controls = applyPreset(defaultControlsWithSeed(seed), preset);
    vectors[preset] = measureContinentFeatures(generateContinent(controls));
  }
  return vectors;
}

function distinctnessMetricKeys(
  left: ContinentFeatureVector,
  right: ContinentFeatureVector,
): string[] {
  const keys: string[] = [];

  if (Math.abs(left.landRatio - right.landRatio) >= 0.01) {
    keys.push('landRatio');
  }
  if (Math.abs(left.coastlineComplexity - right.coastlineComplexity) >= 4) {
    keys.push('coastlineComplexity');
  }
  if (Math.abs(left.islandCount - right.islandCount) >= 1) {
    keys.push('islandCount');
  }
  if (Math.abs(left.offshoreIslandRatio - right.offshoreIslandRatio) >= 0.06) {
    keys.push('offshoreIslandRatio');
  }
  if (Math.abs(left.ridgeCoherence - right.ridgeCoherence) >= 0.04) {
    keys.push('ridgeCoherence');
  }
  if (Math.abs(left.majorRiverComponents - right.majorRiverComponents) >= 1) {
    keys.push('majorRiverComponents');
  }
  if (Math.abs(left.bboxFillRatio - right.bboxFillRatio) >= 0.025) {
    keys.push('bboxFillRatio');
  }
  if (Math.abs(left.cornerRetention - right.cornerRetention) >= 0.005) {
    keys.push('cornerRetention');
  }

  return keys;
}

export function runPresetDistinctnessSuite(seeds: string[]): PresetDistinctnessSuite {
  const normalizedSeeds = seeds.map((seed) => normalizeSeed(seed));
  const seedResults: DistinctnessSeedResult[] = [];

  for (const seed of normalizedSeeds) {
    const vectors = presetDistinctnessVectors(seed);
    const pairComparisons: Array<{
      pair: DistinctnessPair;
      left: PresetOption;
      right: PresetOption;
    }> = [
      { pair: 'archipelago-vs-earth-like', left: 'archipelago', right: 'earth-like' },
      { pair: 'broken-coast-vs-earth-like', left: 'broken-coast', right: 'earth-like' },
      { pair: 'archipelago-vs-broken-coast', left: 'archipelago', right: 'broken-coast' },
    ];

    const pairResults: DistinctnessPairResult[] = pairComparisons.map((entry) => {
      const separatingMetrics = distinctnessMetricKeys(vectors[entry.left], vectors[entry.right]);
      return {
        pair: entry.pair,
        separatingMetrics,
        pass: separatingMetrics.length >= 3,
      };
    });

    seedResults.push({
      seed,
      pairResults,
      pass: pairResults.every((pairResult) => pairResult.pass),
    });
  }

  return {
    seeds: normalizedSeeds,
    seedResults,
    pass: seedResults.every((entry) => entry.pass),
  };
}

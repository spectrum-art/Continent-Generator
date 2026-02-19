import {
  generateStructuralTerrain,
  seaLevelForLandFraction,
  smoothCoastFromElevation,
} from './structureTerrain';

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
  structuralDiagnostics?: {
    ridgeWidthCv: number;
    ridgeAmplitudeCv: number;
    junctionSymmetryScore: number;
    highDegreeNodes: number;
    resolutionValid: boolean;
  };
};

export type ExportPayload = {
  code: string;
  controls: ContinentControls;
};

type DomainType = 'convergent' | 'divergent' | 'craton' | 'transform';

type Domain = {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  strength: number;
  type: DomainType;
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

const SIZE_CONFIG: Record<SizeOption, { shortEdge: number; fieldScale: number }> = {
  isle: { shortEdge: 180, fieldScale: 3 },
  region: { shortEdge: 260, fieldScale: 2 },
  subcontinent: { shortEdge: 380, fieldScale: 2 },
  supercontinent: { shortEdge: 520, fieldScale: 1 },
};

const ASPECT_CONFIG: Record<AspectRatioOption, number> = {
  wide: 2,
  landscape: 1.5,
  square: 1,
  portrait: 2 / 3,
  narrow: 0.5,
};

const OUTPUT_SCALE = 1;

const BIOME_INDEX: Record<ContinentBiome, number> = BIOME_TYPES.reduce((acc, biome, index) => {
  acc[biome] = index;
  return acc;
}, {} as Record<ContinentBiome, number>);

export const ATLAS_PALETTE: Record<ContinentBiome, string> = {
  ocean: '#1f252f',
  lake: '#2a313d',
  beach: '#5c6168',
  river: '#3f464f',
  grassland: '#7f848b',
  'temperate-forest': '#8a8f95',
  rainforest: '#757b82',
  desert: '#999ea4',
  tundra: '#b1b5bb',
  mountain: '#c2c6cc',
  rock: '#d0d3d8',
};

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

function ridgedFbm(seed: number, x: number, y: number, octaves: number, persistence: number, lacunarity: number): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let i = 0; i < octaves; i += 1) {
    const octaveSeed = (seed + Math.imul(i + 1, 0x9e3779b9)) >>> 0;
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
  width = Math.max(120, width) * OUTPUT_SCALE;
  height = Math.max(120, height) * OUTPUT_SCALE;
  return {
    width,
    height,
    basePlates: 0,
    fieldScale: sizeConfig.fieldScale,
  };
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

function normalize01(values: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = clamp01((values[i] - min) / span);
  }
}

function histogramThreshold01(values: Float32Array, targetLand: number): number {
  const bins = 2048;
  const histogram = new Uint32Array(bins);
  for (let i = 0; i < values.length; i += 1) {
    const bin = clamp(Math.floor(values[i] * (bins - 1)), 0, bins - 1);
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
  return thresholdBin / Math.max(1, bins - 1);
}

function generateDomains(seed: number, count: number): Domain[] {
  const rng = mulberry32(seed ^ 0x6f4a91b7);
  const types: DomainType[] = ['convergent', 'divergent', 'craton', 'transform'];
  const domains: Domain[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    domains.push({
      x: 0.1 + rng() * 0.8,
      y: 0.1 + rng() * 0.8,
      dirX: Math.cos(a),
      dirY: Math.sin(a),
      strength: 0.6 + rng() * 0.8,
      type: types[Math.floor(rng() * types.length) % types.length],
    });
  }
  return domains;
}

function buildMacroUplift(
  width: number,
  height: number,
  seed: number,
  domains: Domain[],
  reliefNorm: number,
  fragNorm: number,
): Float32Array {
  const uplift = new Float32Array(width * height);
  const aspect = width / Math.max(1, height);

  for (let y = 0; y < height; y += 1) {
    const ny0 = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx0 = x / Math.max(1, width - 1);
      const warpX = (fbm(seed ^ 0x17d31f2b, nx0 * 1.9, ny0 * 1.9, 3, 0.57, 2.05) - 0.5) * 0.12;
      const warpY = (fbm(seed ^ 0x4bd8a915, nx0 * 1.7, ny0 * 1.7, 3, 0.57, 2.05) - 0.5) * 0.12;
      const nx = clamp01(nx0 + warpX);
      const ny = clamp01(ny0 + warpY);

      let weightSum = 0;
      let value = 0;
      for (let i = 0; i < domains.length; i += 1) {
        const d = domains[i];
        const dx = (nx - d.x) * aspect;
        const dy = ny - d.y;
        const along = dx * d.dirX + dy * d.dirY;
        const perp = -dx * d.dirY + dy * d.dirX;
        const dist2 = dx * dx + dy * dy;
        const w = Math.exp(-dist2 * (8.1 + fragNorm * 4.6));

        let local = 0;
        if (d.type === 'convergent') {
          const belt = Math.exp(-(perp * perp) * (16 + reliefNorm * 24));
          const chain = ridgedFbm(seed ^ (i * 7919), along * 4.6, perp * 2.8, 3, 0.58, 2.08);
          local = belt * (0.45 + chain * 0.9);
        } else if (d.type === 'divergent') {
          const rift = Math.exp(-(perp * perp) * (13 + reliefNorm * 16));
          local = -rift * (0.25 + Math.abs(Math.sin(along * 3.3)) * 0.45);
        } else if (d.type === 'transform') {
          const shear = Math.exp(-(perp * perp) * (15 + reliefNorm * 12));
          local = shear * (Math.sin(along * 5.2) * 0.22);
        } else {
          local = 0.08 + fbm(seed ^ (i * 3571), nx * 2.2, ny * 2.2, 2, 0.58, 2.05) * 0.14;
        }

        value += local * d.strength * w;
        weightSum += w;
      }

      const sx = nx * aspect;
      const sy = ny;
      const macro = (fbm(seed ^ 0x83e4cb71, sx * 1.6, sy * 1.6, 4, 0.58, 2.02) - 0.5) * (0.5 + reliefNorm * 0.35);
      const regional = (fbm(seed ^ 0x20fd13bb, sx * 4.2, sy * 4.2, 3, 0.55, 2.08) - 0.5) * (0.22 + fragNorm * 0.28);
      const result = 0.45 + value / Math.max(1e-6, weightSum) + macro + regional;
      uplift[y * width + x] = result;
    }
  }

  normalize01(uplift);
  return uplift;
}

function applyEdgeAndShapeControl(
  width: number,
  height: number,
  elevation: Float32Array,
  seed: number,
  landFractionNorm: number,
): void {
  const aspect = width / Math.max(1, height);
  const baseRadius = lerp(0.34, 0.56, landFractionNorm);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const cx = (nx - 0.5) * aspect;
      const cy = ny - 0.5;
      const radius = Math.hypot(cx, cy);
      const angle = Math.atan2(cy, cx);

      const angularNoise =
        (fbm(seed ^ 0x93a77b3d, Math.cos(angle) * 2.1 + 2.5, Math.sin(angle) * 2.1 + 2.5, 3, 0.55, 2.08) - 0.5) * 0.13;
      const macroNoise = (fbm(seed ^ 0x51d8bf43, nx * 2.0, ny * 2.0, 3, 0.56, 2.05) - 0.5) * 0.1;
      const boundary = baseRadius + angularNoise + macroNoise;
      const continentMask = 1 - smoothRange(radius, boundary, boundary + 0.2);

      const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
      const oceanEdge = smoothRange(edgeDistance, 0.0, 0.09 + landFractionNorm * 0.04);
      const interiorBias = continentMask * oceanEdge;
      const erosionBias = (1 - oceanEdge) * (0.72 - landFractionNorm * 0.14);
      elevation[index] = clamp01(elevation[index] * 0.82 + interiorBias * 0.52 - erosionBias);
    }
  }
}

function computeStressOrientation(
  width: number,
  height: number,
  uplift: Float32Array,
): { stress: Float32Array; dirX: Float32Array; dirY: Float32Array } {
  const total = width * height;
  const stress = new Float32Array(total);
  const dirX = new Float32Array(total);
  const dirY = new Float32Array(total);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(width - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(height - 1, y + 1);
      const gx = (uplift[y * width + xr] - uplift[y * width + xl]) * 0.5;
      const gy = (uplift[yd * width + x] - uplift[yu * width + x]) * 0.5;
      const mag = Math.hypot(gx, gy);
      const index = y * width + x;
      stress[index] = clamp01(mag * 7.2);
      const tx = -gy;
      const ty = gx;
      const tLen = Math.hypot(tx, ty) || 1;
      dirX[index] = tx / tLen;
      dirY[index] = ty / tLen;
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const sx = stress.slice();
    const dx = dirX.slice();
    const dy = dirY.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const l = index - 1;
        const r = index + 1;
        const u = index - width;
        const d = index + width;
        sx[index] = (stress[index] * 0.5 + stress[l] + stress[r] + stress[u] + stress[d]) / 4.5;
        const mx = (dirX[index] * 0.5 + dirX[l] + dirX[r] + dirX[u] + dirX[d]) / 4.5;
        const my = (dirY[index] * 0.5 + dirY[l] + dirY[r] + dirY[u] + dirY[d]) / 4.5;
        const len = Math.hypot(mx, my) || 1;
        dx[index] = mx / len;
        dy[index] = my / len;
      }
    }
    stress.set(sx);
    dirX.set(dx);
    dirY.set(dy);
  }

  return { stress, dirX, dirY };
}

function applyAnisotropicRidges(
  width: number,
  height: number,
  seed: number,
  elevation: Float32Array,
  stress: Float32Array,
  dirX: Float32Array,
  dirY: Float32Array,
  reliefNorm: number,
  peakNorm: number,
): void {
  const next = elevation.slice();
  for (let y = 1; y < height - 1; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 1; x < width - 1; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const localStress = stress[index];
      if (localStress < 0.06) {
        continue;
      }
      const mountainMask = smoothRange(elevation[index], 0.35 - reliefNorm * 0.07, 0.86);
      if (mountainMask <= 0) {
        continue;
      }

      const tx = dirX[index];
      const ty = dirY[index];
      const warpX = (fbm(seed ^ 0x8f7e1c43, nx * 4.6, ny * 4.6, 2, 0.55, 2.1) - 0.5) * 0.08;
      const warpY = (fbm(seed ^ 0x55cb319f, nx * 4.1, ny * 4.1, 2, 0.55, 2.1) - 0.5) * 0.08;
      const px = nx + warpX;
      const py = ny + warpY;

      const along = px * tx + py * ty;
      const across = -px * ty + py * tx;

      const backbone = ridgedFbm(seed ^ 0x6aa4bb1d, along * 6.8, across * 1.7, 3, 0.6, 2.05);
      const medium = ridgedFbm(seed ^ 0x9e315f07, along * 13.4, across * 4.5, 3, 0.56, 2.1);
      const fine = ridgedFbm(seed ^ 0xc31fd4a9, along * 24.6, across * 9.1, 2, 0.54, 2.2);
      const ridges = backbone * 0.5 + medium * 0.34 + fine * 0.16;

      const ridgeSigned = (ridges - 0.5) * 2;
      const amplitude = (0.022 + reliefNorm * 0.094 + peakNorm * 0.1) * mountainMask * (0.34 + localStress * 1.08);
      const valley = (1 - ridges) * (0.008 + reliefNorm * 0.04 + peakNorm * 0.03) * mountainMask;
      next[index] = clamp01(elevation[index] + ridgeSigned * amplitude - valley);
    }
  }
  elevation.set(next);
}

function computeFlowField(width: number, height: number, elevation: Float32Array): {
  downstream: Int32Array;
  flow: Float32Array;
} {
  const total = width * height;
  const downstream = new Int32Array(total);
  downstream.fill(-1);
  const flow = new Float32Array(total);
  const bins: number[][] = Array.from({ length: 256 }, () => []);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      flow[index] = 1;
      let bestElevation = elevation[index];
      let best = -1;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (elevation[ni] < bestElevation - 1e-6) {
          bestElevation = elevation[ni];
          best = ni;
        }
      }
      downstream[index] = best;
      const bin = clamp(Math.floor(elevation[index] * 255), 0, 255);
      bins[bin].push(index);
    }
  }

  for (let b = 255; b >= 0; b -= 1) {
    const bucket = bins[b];
    for (let i = 0; i < bucket.length; i += 1) {
      const index = bucket[i];
      const out = downstream[index];
      if (out >= 0) {
        flow[out] += flow[index];
      }
    }
  }

  let maxFlow = 1;
  for (let i = 0; i < total; i += 1) {
    maxFlow = Math.max(maxFlow, flow[i]);
  }
  for (let i = 0; i < total; i += 1) {
    flow[i] /= maxFlow;
  }

  return { downstream, flow };
}

function applyErosionValleys(
  width: number,
  height: number,
  elevation: Float32Array,
  iterations: number,
  reliefNorm: number,
): Float32Array {
  let flow = new Float32Array(width * height);

  for (let iter = 0; iter < iterations; iter += 1) {
    const computed = computeFlowField(width, height, elevation);
    flow = computed.flow;
    const next = elevation.slice();

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const left = elevation[y * width + (x - 1)];
        const right = elevation[y * width + (x + 1)];
        const up = elevation[(y - 1) * width + x];
        const down = elevation[(y + 1) * width + x];
        const slope = Math.hypot((right - left) * 0.5, (down - up) * 0.5);
        const carve = (0.0028 + reliefNorm * 0.004) * flow[index] * (0.55 + slope * 3.35);
        next[index] = clamp01(elevation[index] - carve);
      }
    }

    elevation.set(next);
  }

  return flow;
}

function smoothCoastalDEM(
  width: number,
  height: number,
  dem: Float32Array,
  seaLevel: number,
  smoothLevel: number,
): void {
  const smooth = (smoothLevel - 1) / 9;
  const passes = Math.round(1 + smooth * 3);
  const band = lerp(0.03, 0.16, smooth);
  let current = dem.slice();

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
        for (const [dx, dy] of NEIGHBORS_8) {
          sum += current[(y + dy) * width + (x + dx)];
        }
        const avg = sum / 8;
        const strength = smoothstep(1 - distance / Math.max(1e-6, band)) * (0.05 + smooth * 0.24);
        next[index] = lerp(current[index], avg, strength);
      }
    }
    current = next;
  }

  dem.set(current);
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

function computeLandAndCoast(width: number, height: number, land: Uint8Array): {
  landArea: number;
  coastPerimeter: number;
} {
  let landArea = 0;
  let coastPerimeter = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (land[index] === 0) {
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

export function computeLightAndSlope(width: number, height: number, elevation01: Float32Array): {
  light: Float32Array;
  slope: Float32Array;
} {
  const total = width * height;
  const smooth = elevation01.slice();
  const scratch = new Float32Array(total);
  const light = new Float32Array(total);
  const slope = new Float32Array(total);

  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const avg = (
          smooth[index] * 0.5 +
          smooth[index - 1] +
          smooth[index + 1] +
          smooth[index - width] +
          smooth[index + width]
        ) / 4.5;
        scratch[index] = avg;
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

  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < smooth.length; i += 1) {
    minElevation = Math.min(minElevation, smooth[i]);
    maxElevation = Math.max(maxElevation, smooth[i]);
  }
  const reliefSpan = Math.max(1e-6, maxElevation - minElevation);
  const normalScale = 4.6 / reliefSpan;
  const slopeScale = 3.4 / reliefSpan;

  const lx = -1;
  const ly = -1;
  const lz = 1;
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const lnx = lx / lLen;
  const lny = ly / lLen;
  const lnz = lz / lLen;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(width - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(height - 1, y + 1);

      const dzdx = (smooth[y * width + xr] - smooth[y * width + xl]) * 0.5;
      const dzdy = (smooth[yd * width + x] - smooth[yu * width + x]) * 0.5;
      const nx = -dzdx * normalScale;
      const ny = -dzdy * normalScale;
      const nz = 1;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const nnx = nx / nLen;
      const nny = ny / nLen;
      const nnz = nz / nLen;

      const lambert = Math.max(0, nnx * lnx + nny * lny + nnz * lnz);
      const ambient = 0.31;
      const diffuse = 0.69 * lambert;
      const value = clamp01(ambient + diffuse);
      const index = y * width + x;
      light[index] = clamp01(Math.pow(value, 0.92));
      slope[index] = clamp01(Math.hypot(dzdx, dzdy) * slopeScale);
    }
  }

  return { light, slope };
}

function checksumFloatArray(values: Float32Array): number {
  let hash = 2166136261;
  for (let i = 0; i < values.length; i += 29) {
    hash ^= Math.round(values[i] * 10000);
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
): string {
  let hash = hashString(`${normalizedSeed}|${width}|${height}|${controlsHash}`);
  hash ^= checksumFloatArray(elevation);
  hash = Math.imul(hash, 16777619);
  hash ^= checksumByteArray(land);
  hash = Math.imul(hash, 16777619);
  return compactHashHex(hash);
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
    'v=3',
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
  if (version !== '1' && version !== '2' && version !== '3') {
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

export function generateContinent(input: ContinentControls): GeneratedContinent {
  const controls = clampControls(input);
  const normalizedSeed = normalizeSeed(controls.seed);
  const { width, height, fieldScale } = mapDimensions(controls.size, controls.aspectRatio);
  const total = width * height;

  const seed = hashString(normalizedSeed);
  const landFractionNorm = (controls.landFraction - 1) / 9;
  const structural = generateStructuralTerrain(width, height, seed, controls);
  const elevation = structural.elevation;
  const seaLevel = seaLevelForLandFraction(elevation, landFractionNorm, structural.landPotential);
  smoothCoastFromElevation(width, height, elevation, seaLevel, controls.coastalSmoothing);

  const land = new Uint8Array(total);
  const water = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    land[i] = elevation[i] > seaLevel ? 1 : 0;
    water[i] = land[i] === 1 ? 0 : 1;
  }
  enforceOceanEdges(width, height, land);
  for (let i = 0; i < total; i += 1) {
    water[i] = land[i] === 1 ? 0 : 1;
  }

  const { ocean, lake } = floodOcean(width, height, water);
  const distanceToOcean = bfsDistance(width, height, ocean);
  const distanceToLand = bfsDistance(width, height, land);

  const { light, slope } = computeLightAndSlope(width, height, elevation);
  const ridge = structural.ridge;
  const flow = structural.flow;

  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < total; i += 1) {
    minElevation = Math.min(minElevation, elevation[i]);
    maxElevation = Math.max(maxElevation, elevation[i]);
  }
  const reliefSpan = Math.max(1e-6, maxElevation - minElevation);
  const mountainThreshold = seaLevel + reliefSpan * 0.24;
  const rockThreshold = seaLevel + reliefSpan * 0.37;

  const biome = new Uint8Array(total);
  const river = new Uint8Array(total);
  const temperature = new Float32Array(total);
  const moisture = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    if (ocean[i] === 1) {
      biome[i] = BIOME_INDEX.ocean;
    } else if (lake[i] === 1) {
      biome[i] = BIOME_INDEX.lake;
    } else if (land[i] === 0) {
      biome[i] = BIOME_INDEX.ocean;
    } else if (elevation[i] > rockThreshold) {
      biome[i] = BIOME_INDEX.rock;
    } else if (elevation[i] > mountainThreshold) {
      biome[i] = BIOME_INDEX.mountain;
    } else {
      biome[i] = BIOME_INDEX.grassland;
    }
    temperature[i] = 0;
    moisture[i] = 0;
  }

  const { landArea, coastPerimeter } = computeLandAndCoast(width, height, land);
  const controlsHash = compactHashHex(hashString(encodeControlsToCompactString({ ...controls, seed: normalizedSeed })));
  const identityHash = computeIdentityHash(controlsHash, normalizedSeed, width, height, elevation, land);

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
    biome,
    land,
    ocean,
    lake,
    river,
    distanceToOcean,
    distanceToLand,
    landArea,
    coastPerimeter,
    identityHash,
    controlsHash,
    structuralDiagnostics: structural.diagnostics,
  };
}

function shadeGray(value: number): [number, number, number] {
  const v = clamp(Math.round(value * 255), 0, 255);
  return [v, v, v];
}

function elevationDisplayRange(map: GeneratedContinent): { low: number; high: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < map.elevation.length; i += 1) {
    min = Math.min(min, map.elevation[i]);
    max = Math.max(max, map.elevation[i]);
  }
  const span = Math.max(1e-6, max - min);
  return {
    low: min + span * 0.03,
    high: max - span * 0.03,
  };
}

function normalizeElevationValue(value: number, low: number, high: number): number {
  return clamp01((value - low) / Math.max(1e-6, high - low));
}

export function buildAtlasRgba(
  map: GeneratedContinent,
  outputWidth = map.width,
  outputHeight = map.height,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const srcWidth = map.width;
  const srcHeight = map.height;
  const range = elevationDisplayRange(map);

  for (let y = 0; y < outputHeight; y += 1) {
    const sy = Math.min(srcHeight - 1, Math.floor((y / Math.max(1, outputHeight - 1)) * (srcHeight - 1)));
    for (let x = 0; x < outputWidth; x += 1) {
      const sx = Math.min(srcWidth - 1, Math.floor((x / Math.max(1, outputWidth - 1)) * (srcWidth - 1)));
      const index = sy * srcWidth + sx;
      const elev = normalizeElevationValue(map.elevation[index], range.low, range.high);
      const shade = map.light[index];
      const ocean = map.ocean[index] === 1;

      const value = ocean
        ? clamp01(0.08 + elev * 0.45)
        : clamp01(0.15 + elev * 0.35 + shade * 0.62);
      const [r, g, b] = shadeGray(value);
      const out = (y * outputWidth + x) * 4;
      rgba[out] = r;
      rgba[out + 1] = g;
      rgba[out + 2] = b;
      rgba[out + 3] = 255;
    }
  }

  return rgba;
}

export function buildElevationRgba(
  map: GeneratedContinent,
  outputWidth = map.width,
  outputHeight = map.height,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const range = elevationDisplayRange(map);
  for (let y = 0; y < outputHeight; y += 1) {
      const sy = Math.min(map.height - 1, Math.floor((y / Math.max(1, outputHeight - 1)) * (map.height - 1)));
    for (let x = 0; x < outputWidth; x += 1) {
      const sx = Math.min(map.width - 1, Math.floor((x / Math.max(1, outputWidth - 1)) * (map.width - 1)));
      const v = normalizeElevationValue(map.elevation[sy * map.width + sx], range.low, range.high);
      const gray = clamp(Math.round(v * 255), 0, 255);
      const out = (y * outputWidth + x) * 4;
      rgba[out] = gray;
      rgba[out + 1] = gray;
      rgba[out + 2] = gray;
      rgba[out + 3] = 255;
    }
  }
  return rgba;
}

export function buildNormalRgba(
  map: GeneratedContinent,
  outputWidth = map.width,
  outputHeight = map.height,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y += 1) {
    const sy = Math.min(map.height - 1, Math.floor((y / Math.max(1, outputHeight - 1)) * (map.height - 1)));
    for (let x = 0; x < outputWidth; x += 1) {
      const sx = Math.min(map.width - 1, Math.floor((x / Math.max(1, outputWidth - 1)) * (map.width - 1)));
      const xl = Math.max(0, sx - 1);
      const xr = Math.min(map.width - 1, sx + 1);
      const yu = Math.max(0, sy - 1);
      const yd = Math.min(map.height - 1, sy + 1);
      const dzdx = (map.elevation[sy * map.width + xr] - map.elevation[sy * map.width + xl]) * 0.5;
      const dzdy = (map.elevation[yd * map.width + sx] - map.elevation[yu * map.width + sx]) * 0.5;
      const nx = -dzdx * 5;
      const ny = -dzdy * 5;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const rx = clamp(Math.round(((nx / len) * 0.5 + 0.5) * 255), 0, 255);
      const gy = clamp(Math.round(((ny / len) * 0.5 + 0.5) * 255), 0, 255);
      const bz = clamp(Math.round(((nz / len) * 0.5 + 0.5) * 255), 0, 255);
      const out = (y * outputWidth + x) * 4;
      rgba[out] = rx;
      rgba[out + 1] = gy;
      rgba[out + 2] = bz;
      rgba[out + 3] = 255;
    }
  }
  return rgba;
}

export type TileType =
  | 'water'
  | 'lake'
  | 'sand'
  | 'grass'
  | 'forest'
  | 'mountain'
  | 'rock'
  | 'river';

export type ShoreType = 'ocean' | 'lake';

export const CHUNK_SIZE = 64;
export const RIVER_SOURCE_SPACING = 22;
export const RIVER_SOURCE_RATE = 0.78;
export const MIN_SOURCE_ELEVATION = 0.54;
export const MIN_SOURCE_FLOW = 0.16;
export const RIVER_SOURCE_MARGIN = 176;
export const MAX_RIVER_STEPS = 420;
export const SEA_LEVEL = 0.45;
export const RIVER_WATER_STOP_ELEVATION = SEA_LEVEL;
export const RIVER_UPHILL_TOLERANCE = 0.005;
export const MAJOR_SOURCE_SPACING = 84;
export const MAJOR_MIN_SOURCE_ELEVATION = 0.67;
export const MIN_RIVER_LENGTH = 12;
export const MIN_RIVER_ELEVATION_DROP = 0.02;
export const MAX_RIVER_COMPONENT_SOURCES = 110;
export const SHORELINE_BAND = 0.052;
export const OCEAN_SHORE_RADIUS_MIN = 1.8;
export const OCEAN_SHORE_RADIUS_MAX = 4.2;
export const LAKE_SHORE_RADIUS_MIN = 0.9;
export const LAKE_SHORE_RADIUS_MAX = 2.3;
export const HYDRO_MACRO_SIZE = 256;
export const HYDRO_MACRO_MARGIN = 128;
export const MIN_LAKE_COMPONENT_TILES = 40;
export const MAX_LAKE_COMPACTNESS = 220;
export const LAKE_TENDRIL_PRUNE_PASSES = 3;

const TILE_TYPES: TileType[] = ['water', 'lake', 'sand', 'grass', 'forest', 'mountain', 'rock', 'river'];
const AXIAL_DIRECTIONS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const RIVER_CACHE_MAX_CHUNKS = 256;
const HYDRO_CACHE_MAX_REGIONS = 64;
const RIVER_TIE_EPSILON = 1e-6;

type RiverChunkData = {
  tiles: Set<string>;
  sources: Set<string>;
};

type HydroRegionData = {
  roiStartX: number;
  roiStartY: number;
  roiEndX: number;
  roiEndY: number;
  ocean: Set<string>;
  lake: Set<string>;
  lakeBasinId: Map<string, number>;
};

const riverChunkCache = new Map<string, RiverChunkData>();
const riverChunkCacheOrder: string[] = [];
const hydroRegionCache = new Map<string, HydroRegionData>();
const hydroRegionCacheOrder: string[] = [];

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rotate(x: number, y: number, radians: number): { x: number; y: number } {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function hashCoord(seedHash: number, x: number, y: number, salt: number): number {
  let h = (seedHash ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return h >>> 0;
}

function chunkRiverCacheKey(seed: string, cx: number, cy: number): string {
  return `${seed}|${cx}:${cy}`;
}

function regionHydroCacheKey(seed: string, macroX: number, macroY: number): string {
  return `${seed}|${macroX}:${macroY}`;
}

function localTileKey(localX: number, localY: number): string {
  return `${localX},${localY}`;
}

function worldTileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function parseTileKey(key: string): [number, number] {
  const [x, y] = key.split(',');
  return [Number(x), Number(y)];
}

function axialDistance(dq: number, dr: number): number {
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
}

function countHexNeighborsInSet(x: number, y: number, tiles: Set<string>): number {
  let count = 0;
  for (const [dx, dy] of AXIAL_DIRECTIONS) {
    if (tiles.has(worldTileKey(x + dx, y + dy))) {
      count += 1;
    }
  }
  return count;
}

function latticeValue(seedHash: number, x: number, y: number): number {
  const latticeSeed = (seedHash ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  return mulberry32(latticeSeed)();
}

function valueNoise2D(seedHash: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const v00 = latticeValue(seedHash, x0, y0);
  const v10 = latticeValue(seedHash, x1, y0);
  const v01 = latticeValue(seedHash, x0, y1);
  const v11 = latticeValue(seedHash, x1, y1);

  const ix0 = lerp(v00, v10, sx);
  const ix1 = lerp(v01, v11, sx);
  return lerp(ix0, ix1, sy);
}

function fractalNoise2D(
  seedHash: number,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let maxTotal = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    const octaveSeed = (seedHash + Math.imul(octave + 1, 0x9e3779b1)) >>> 0;
    total += valueNoise2D(octaveSeed, x * frequency, y * frequency) * amplitude;
    maxTotal += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return total / maxTotal;
}

function landBiomeFromFields(elevation: number, moisture: number): TileType {
  if (elevation > 0.84) return TILE_TYPES[6];
  if (elevation > 0.71 && moisture < 0.36) return TILE_TYPES[6];
  if (elevation > 0.67) return TILE_TYPES[5];
  if (moisture > 0.61) return TILE_TYPES[4];
  return TILE_TYPES[3];
}

function chooseDownhillNeighbor(
  seedHash: number,
  seed: string,
  x: number,
  y: number,
): { x: number; y: number; elevation: number } {
  let bestX = x;
  let bestY = y;
  let bestElevation = elevationAt(seed, x, y);
  let bestTie = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < AXIAL_DIRECTIONS.length; i += 1) {
    const [dx, dy] = AXIAL_DIRECTIONS[i];
    const nx = x + dx;
    const ny = y + dy;
    const candidateElevation = elevationAt(seed, nx, ny);
    const tie = hashCoord(seedHash, nx, ny, i + 101);

    if (
      candidateElevation < bestElevation - RIVER_TIE_EPSILON ||
      (Math.abs(candidateElevation - bestElevation) <= RIVER_TIE_EPSILON && tie < bestTie)
    ) {
      bestX = nx;
      bestY = ny;
      bestElevation = candidateElevation;
      bestTie = tie;
    }
  }

  return { x: bestX, y: bestY, elevation: bestElevation };
}

function riverSourcePotentialAt(seed: string, x: number, y: number): number {
  const center = elevationAt(seed, x, y);
  let downhill = 0;
  let uphill = 0;
  for (const [dx, dy] of AXIAL_DIRECTIONS) {
    const neighbor = elevationAt(seed, x + dx, y + dy);
    const delta = center - neighbor;
    if (delta > 0) {
      downhill += delta;
    } else {
      uphill += -delta;
    }
  }
  const valleyPotential = (1 + uphill * 10) / (0.4 + downhill * 12);
  return clamp01(Math.log2(1 + valleyPotential * 2.4) / 3.2);
}

type RiverTraceResult = {
  path: Array<[number, number]>;
  endElevation: number;
  terminatedWater: boolean;
  terminatedLake: boolean;
  mergedIntoRiver: boolean;
};

function traceRiverPath(
  seedHash: number,
  seed: string,
  startX: number,
  startY: number,
  existingRiverWorld: Set<string> | null,
): RiverTraceResult {
  let x = startX;
  let y = startY;
  let currentElevation = elevationAt(seed, x, y);
  const seen = new Set<string>();
  const path: Array<[number, number]> = [];
  let terminatedWater = false;
  let terminatedLake = false;
  let mergedIntoRiver = false;

  for (let step = 0; step < MAX_RIVER_STEPS; step += 1) {
    const key = worldTileKey(x, y);
    if (seen.has(key)) {
      break;
    }
    seen.add(key);
    path.push([x, y]);

    if (existingRiverWorld && path.length > 1 && existingRiverWorld.has(key)) {
      mergedIntoRiver = true;
      break;
    }

    if (signedHeightAt(seed, x, y) <= 0) {
      const waterClass = classifyWaterTile(seed, x, y);
      if (waterClass === TILE_TYPES[1]) {
        terminatedLake = true;
      } else {
        terminatedWater = true;
      }
      break;
    }

    if (currentElevation <= RIVER_WATER_STOP_ELEVATION) {
      terminatedWater = true;
      break;
    }

    const next = chooseDownhillNeighbor(seedHash, seed, x, y);
    if (next.x === x && next.y === y) {
      break;
    }
    if (next.elevation > currentElevation + RIVER_UPHILL_TOLERANCE) {
      break;
    }

    x = next.x;
    y = next.y;
    currentElevation = next.elevation;
  }

  return {
    path,
    endElevation: currentElevation,
    terminatedWater,
    terminatedLake,
    mergedIntoRiver,
  };
}

export function riverTraceLengthFromSource(seed: string, startX: number, startY: number): number {
  const seedHash = hashString(seed);
  return traceRiverPath(seedHash, seed, startX, startY, null).path.length;
}

export function riverTraceTerminationFromSource(
  seed: string,
  startX: number,
  startY: number,
): 'ocean' | 'lake' | 'merged' | 'stalled' {
  const seedHash = hashString(seed);
  const trace = traceRiverPath(seedHash, seed, startX, startY, null);
  if (trace.terminatedWater) {
    return 'ocean';
  }
  if (trace.terminatedLake) {
    return 'lake';
  }
  if (trace.mergedIntoRiver) {
    return 'merged';
  }
  return 'stalled';
}

function buildRiverChunk(seed: string, cx: number, cy: number): RiverChunkData {
  const cacheKey = chunkRiverCacheKey(seed, cx, cy);
  const cached = riverChunkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const seedHash = hashString(seed);
  const riverWorldTiles = new Set<string>();
  const sources = new Set<string>();
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;
  const endX = startX + CHUNK_SIZE - 1;
  const endY = startY + CHUNK_SIZE - 1;
  type SourceCandidate = { x: number; y: number; score: number; tie: number };
  const candidates: SourceCandidate[] = [];
  const sourceMargin = RIVER_SOURCE_MARGIN;
  const gridMinX = Math.floor((startX - sourceMargin) / RIVER_SOURCE_SPACING);
  const gridMaxX = Math.floor((endX + sourceMargin) / RIVER_SOURCE_SPACING);
  const gridMinY = Math.floor((startY - sourceMargin) / RIVER_SOURCE_SPACING);
  const gridMaxY = Math.floor((endY + sourceMargin) / RIVER_SOURCE_SPACING);

  for (let gy = gridMinY; gy <= gridMaxY; gy += 1) {
    for (let gx = gridMinX; gx <= gridMaxX; gx += 1) {
      const pick = (hashCoord(seedHash, gx, gy, 7) & 0xffff) / 0xffff;
      if (pick > RIVER_SOURCE_RATE) {
        continue;
      }

      const offsetX = hashCoord(seedHash, gx, gy, 13) % RIVER_SOURCE_SPACING;
      const offsetY = hashCoord(seedHash, gx, gy, 29) % RIVER_SOURCE_SPACING;
      const x = gx * RIVER_SOURCE_SPACING + offsetX;
      const y = gy * RIVER_SOURCE_SPACING + offsetY;
      const elev = elevationAt(seed, x, y);
      if (elev < MIN_SOURCE_ELEVATION) {
        continue;
      }
      const sourcePotential = riverSourcePotentialAt(seed, x, y);
      if (sourcePotential < MIN_SOURCE_FLOW) {
        continue;
      }
      const score =
        elev * 1.2 + sourcePotential * 1.45 + ((hashCoord(seedHash, x, y, 203) & 0xff) / 255) * 0.2;
      const tie = hashCoord(seedHash, x, y, 181);
      candidates.push({ x, y, score, tie });
    }
  }

  const majorMargin = RIVER_SOURCE_MARGIN;
  const majorGridMinX = Math.floor((startX - majorMargin) / MAJOR_SOURCE_SPACING);
  const majorGridMaxX = Math.floor((endX + majorMargin) / MAJOR_SOURCE_SPACING);
  const majorGridMinY = Math.floor((startY - majorMargin) / MAJOR_SOURCE_SPACING);
  const majorGridMaxY = Math.floor((endY + majorMargin) / MAJOR_SOURCE_SPACING);

  for (let gy = majorGridMinY; gy <= majorGridMaxY; gy += 1) {
    for (let gx = majorGridMinX; gx <= majorGridMaxX; gx += 1) {
      const offsetX = hashCoord(seedHash, gx, gy, 211) % MAJOR_SOURCE_SPACING;
      const offsetY = hashCoord(seedHash, gx, gy, 223) % MAJOR_SOURCE_SPACING;
      const x = gx * MAJOR_SOURCE_SPACING + offsetX;
      const y = gy * MAJOR_SOURCE_SPACING + offsetY;
      const elev = elevationAt(seed, x, y);
      if (elev < MAJOR_MIN_SOURCE_ELEVATION) {
        continue;
      }
      const sourcePotential = riverSourcePotentialAt(seed, x, y);
      const score =
        elev * 1.35 +
        sourcePotential * 1.15 +
        ((hashCoord(seedHash, x, y, 227) & 0xff) / 255) * 0.12;
      const tie = hashCoord(seedHash, x, y, 229);
      candidates.push({ x, y, score, tie });
    }
  }

  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) {
      return b.score - a.score;
    }
    if (a.tie !== b.tie) {
      return a.tie - b.tie;
    }
    if (a.x !== b.x) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  const claimedSources = new Set<string>();
  let acceptedSources = 0;
  for (const candidate of candidates) {
    if (acceptedSources >= MAX_RIVER_COMPONENT_SOURCES) {
      break;
    }
    const candidateKey = worldTileKey(candidate.x, candidate.y);
    if (claimedSources.has(candidateKey)) {
      continue;
    }
    claimedSources.add(candidateKey);

    const trace = traceRiverPath(seedHash, seed, candidate.x, candidate.y, riverWorldTiles);
    const startElevation = elevationAt(seed, candidate.x, candidate.y);
    const pathWithoutWater = trace.path.filter(([px, py]) => signedHeightAt(seed, px, py) >= 0);
    if (pathWithoutWater.length < MIN_RIVER_LENGTH) {
      continue;
    }
    const elevationDrop = startElevation - trace.endElevation;
    if (elevationDrop < MIN_RIVER_ELEVATION_DROP) {
      continue;
    }
    if (!trace.terminatedWater && !trace.terminatedLake && !trace.mergedIntoRiver) {
      const isStrongInlandTrace =
        pathWithoutWater.length >= MIN_RIVER_LENGTH * 2 &&
        elevationDrop >= MIN_RIVER_ELEVATION_DROP * 1.9;
      if (!isStrongInlandTrace) {
        continue;
      }
    }

    acceptedSources += 1;
    if (candidate.x >= startX && candidate.x <= endX && candidate.y >= startY && candidate.y <= endY) {
      sources.add(localTileKey(candidate.x - startX, candidate.y - startY));
    }

    for (let i = 0; i < pathWithoutWater.length; i += 1) {
      const [px, py] = pathWithoutWater[i];
      riverWorldTiles.add(worldTileKey(px, py));

      const widenHash = hashCoord(seedHash, px, py, 907 + i);
      const shouldWidenPrimary =
        pathWithoutWater.length >= 24 &&
        (widenHash & 0xff) < 182 &&
        i >= Math.floor(pathWithoutWater.length * 0.3);
      if (!shouldWidenPrimary) {
        continue;
      }

      const primaryDir = widenHash % AXIAL_DIRECTIONS.length;
      const [dx1, dy1] = AXIAL_DIRECTIONS[primaryDir];
      const w1x = px + dx1;
      const w1y = py + dy1;
      if (signedHeightAt(seed, w1x, w1y) >= 0) {
        riverWorldTiles.add(worldTileKey(w1x, w1y));
      }

      const shouldWidenSecondary =
        pathWithoutWater.length >= 42 &&
        i >= Math.floor(pathWithoutWater.length * 0.55) &&
        ((widenHash >>> 8) & 0xff) < 96;
      if (!shouldWidenSecondary) {
        continue;
      }
      const secondaryDir = (primaryDir + 1 + ((widenHash >>> 16) & 1)) % AXIAL_DIRECTIONS.length;
      const [dx2, dy2] = AXIAL_DIRECTIONS[secondaryDir];
      const w2x = px + dx2;
      const w2y = py + dy2;
      if (signedHeightAt(seed, w2x, w2y) >= 0) {
        riverWorldTiles.add(worldTileKey(w2x, w2y));
      }
    }
  }

  const widenedWorldTiles = new Set<string>(riverWorldTiles);
  for (const key of riverWorldTiles) {
    const [x, y] = parseTileKey(key);
    const elevation = elevationAt(seed, x, y);
    const widths = elevation < 0.62 ? 3 : 2;
    let dir = hashCoord(seedHash, x, y, 941) % AXIAL_DIRECTIONS.length;
    for (let i = 0; i < widths; i += 1) {
      const [dx, dy] = AXIAL_DIRECTIONS[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (signedHeightAt(seed, nx, ny) >= 0) {
        widenedWorldTiles.add(worldTileKey(nx, ny));
      }
      dir = (dir + 1 + ((hashCoord(seedHash, x, y, 947 + i) >>> 7) & 1)) % AXIAL_DIRECTIONS.length;
    }
  }

  const tiles = new Set<string>();
  for (const key of widenedWorldTiles) {
    const [pathX, pathY] = parseTileKey(key);
    if (pathX >= startX && pathX <= endX && pathY >= startY && pathY <= endY) {
      tiles.add(localTileKey(pathX - startX, pathY - startY));
    }
  }

  const built: RiverChunkData = { tiles, sources };
  riverChunkCache.set(cacheKey, built);
  riverChunkCacheOrder.push(cacheKey);
  while (riverChunkCacheOrder.length > RIVER_CACHE_MAX_CHUNKS) {
    const oldest = riverChunkCacheOrder.shift();
    if (!oldest) break;
    riverChunkCache.delete(oldest);
  }

  return built;
}

export function elevationAt(seed: string, x: number, y: number): number {
  const seedHash = hashString(seed);
  const scaledX = x * 0.016;
  const scaledY = y * 0.016;
  const warpX =
    fractalNoise2D(seedHash ^ 0x1a4d0f1f, scaledX * 0.52, scaledY * 0.52, 3, 0.57, 2.05) - 0.5;
  const warpY =
    fractalNoise2D(seedHash ^ 0xb7e1812d, scaledX * 0.52, scaledY * 0.52, 3, 0.57, 2.05) - 0.5;
  const domainX = scaledX + warpX * 1.6;
  const domainY = scaledY + warpY * 1.6;

  const continentBasis = rotate(domainX, domainY, 0.33);
  const terrainBasis = rotate(domainX, domainY, -1.07);
  const ridgeBasis = rotate(domainX, domainY, 1.74);

  const continent = fractalNoise2D(
    seedHash ^ 0xa53d7f19,
    continentBasis.x * 0.28,
    continentBasis.y * 0.28,
    4,
    0.58,
    2.05,
  );
  const terrain = fractalNoise2D(
    seedHash ^ 0x7f4a7c15,
    terrainBasis.x * 0.92,
    terrainBasis.y * 0.92,
    5,
    0.52,
    2.0,
  );
  const detail = fractalNoise2D(
    seedHash ^ 0x21f0aaad,
    ridgeBasis.x * 2.1,
    ridgeBasis.y * 2.1,
    4,
    0.46,
    2.02,
  );
  const ridge = 1 - Math.abs(detail * 2 - 1);
  const broadSlope = fractalNoise2D(
    seedHash ^ 0x11ab04f3,
    domainX * 0.4,
    domainY * 0.4,
    3,
    0.6,
    2.0,
  );
  const combined = continent * 0.5 + terrain * 0.32 + ridge * 0.12 + broadSlope * 0.06;
  const contrasted = smoothstep(clamp01((combined - 0.06) * 1.18));
  return clamp01(contrasted * 1.05);
}

export function elevationAtFromMacro(
  seed: string,
  x: number,
  y: number,
  macroX: number,
  macroY: number,
): number {
  void macroX;
  void macroY;
  return elevationAt(seed, x, y);
}

export function heightAt(seed: string, x: number, y: number): number {
  return elevationAt(seed, x, y);
}

export function signedHeightAt(seed: string, x: number, y: number): number {
  return heightAt(seed, x, y) - SEA_LEVEL;
}

export function isWaterCandidateAt(seed: string, x: number, y: number): boolean {
  return signedHeightAt(seed, x, y) < 0;
}

function buildHydroRegion(seed: string, regionX: number, regionY: number): HydroRegionData {
  const cacheKey = regionHydroCacheKey(seed, regionX, regionY);
  const cached = hydroRegionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const interiorStartX = regionX * HYDRO_MACRO_SIZE;
  const interiorStartY = regionY * HYDRO_MACRO_SIZE;
  const interiorEndX = interiorStartX + HYDRO_MACRO_SIZE - 1;
  const interiorEndY = interiorStartY + HYDRO_MACRO_SIZE - 1;

  const roiStartX = interiorStartX - HYDRO_MACRO_MARGIN;
  const roiStartY = interiorStartY - HYDRO_MACRO_MARGIN;
  const roiEndX = interiorEndX + HYDRO_MACRO_MARGIN;
  const roiEndY = interiorEndY + HYDRO_MACRO_MARGIN;

  const waterCandidates = new Set<string>();
  const oceanWorld = new Set<string>();
  const queue: Array<[number, number]> = [];

  for (let y = roiStartY; y <= roiEndY; y += 1) {
    for (let x = roiStartX; x <= roiEndX; x += 1) {
      if (!isWaterCandidateAt(seed, x, y)) {
        continue;
      }
      const key = worldTileKey(x, y);
      waterCandidates.add(key);
      if (x === roiStartX || x === roiEndX || y === roiStartY || y === roiEndY) {
        oceanWorld.add(key);
        queue.push([x, y]);
      }
    }
  }

  while (queue.length > 0) {
    const [x, y] = queue.shift() as [number, number];
    for (const [dx, dy] of AXIAL_DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < roiStartX || nx > roiEndX || ny < roiStartY || ny > roiEndY) {
        continue;
      }
      const nKey = worldTileKey(nx, ny);
      if (!waterCandidates.has(nKey) || oceanWorld.has(nKey)) {
        continue;
      }
      oceanWorld.add(nKey);
      queue.push([nx, ny]);
    }
  }

  const lakeWorld = new Set<string>();
  const lakeBasinIdWorld = new Map<string, number>();
  const basinVisited = new Set<string>();
  let nextLakeBasinId = 1;
  for (const key of waterCandidates) {
    if (oceanWorld.has(key) || basinVisited.has(key)) {
      continue;
    }

    const basinQueue = [key];
    const basinTiles: string[] = [];
    basinVisited.add(key);

    while (basinQueue.length > 0) {
      const current = basinQueue.shift() as string;
      basinTiles.push(current);
      const [x, y] = parseTileKey(current);

      for (const [dx, dy] of AXIAL_DIRECTIONS) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < roiStartX || nextX > roiEndX || nextY < roiStartY || nextY > roiEndY) {
          continue;
        }
        const nextKey = worldTileKey(nextX, nextY);
        if (!waterCandidates.has(nextKey) || oceanWorld.has(nextKey) || basinVisited.has(nextKey)) {
          continue;
        }
        basinVisited.add(nextKey);
        basinQueue.push(nextKey);
      }
    }

    const basinTileSet = new Set<string>(basinTiles);
    for (let pass = 0; pass < LAKE_TENDRIL_PRUNE_PASSES; pass += 1) {
      const prune: string[] = [];
      for (const lakeKey of basinTileSet) {
        const [lx, ly] = parseTileKey(lakeKey);
        if (countHexNeighborsInSet(lx, ly, basinTileSet) <= 1) {
          prune.push(lakeKey);
        }
      }
      if (prune.length === 0) {
        break;
      }
      for (const keyToRemove of prune) {
        basinTileSet.delete(keyToRemove);
      }
    }

    const localVisited = new Set<string>();
    for (const basinKey of basinTileSet) {
      if (localVisited.has(basinKey)) {
        continue;
      }
      const componentQueue = [basinKey];
      const component: string[] = [];
      localVisited.add(basinKey);
      while (componentQueue.length > 0) {
        const current = componentQueue.shift() as string;
        component.push(current);
        const [cx, cy] = parseTileKey(current);
        for (const [dx, dy] of AXIAL_DIRECTIONS) {
          const neighborKey = worldTileKey(cx + dx, cy + dy);
          if (!basinTileSet.has(neighborKey) || localVisited.has(neighborKey)) {
            continue;
          }
          localVisited.add(neighborKey);
          componentQueue.push(neighborKey);
        }
      }

      if (component.length < MIN_LAKE_COMPONENT_TILES) {
        for (const keyToOcean of component) {
          oceanWorld.add(keyToOcean);
        }
        continue;
      }

      const componentSet = new Set<string>(component);
      let perimeter = 0;
      for (const compKey of component) {
        const [cx, cy] = parseTileKey(compKey);
        for (const [dx, dy] of AXIAL_DIRECTIONS) {
          if (!componentSet.has(worldTileKey(cx + dx, cy + dy))) {
            perimeter += 1;
          }
        }
      }
      const compactness = (perimeter * perimeter) / Math.max(component.length, 1);
      if (compactness > MAX_LAKE_COMPACTNESS) {
        for (const keyToOcean of component) {
          oceanWorld.add(keyToOcean);
        }
        continue;
      }

      const basinId = nextLakeBasinId;
      nextLakeBasinId += 1;
      for (const lakeKey of component) {
        lakeWorld.add(lakeKey);
        lakeBasinIdWorld.set(lakeKey, basinId);
      }
    }
  }

  const ocean = new Set<string>();
  const lake = new Set<string>();
  const lakeBasinId = new Map<string, number>();
  for (let y = roiStartY; y <= roiEndY; y += 1) {
    for (let x = roiStartX; x <= roiEndX; x += 1) {
      const key = worldTileKey(x, y);
      if (!waterCandidates.has(key)) {
        continue;
      }
      const local = localTileKey(x - roiStartX, y - roiStartY);
      if (lakeWorld.has(key)) {
        lake.add(local);
        const basinId = lakeBasinIdWorld.get(key);
        if (basinId !== undefined) {
          lakeBasinId.set(local, basinId);
        }
      } else if (oceanWorld.has(key)) {
        ocean.add(local);
      }
    }
  }

  const built: HydroRegionData = {
    roiStartX,
    roiStartY,
    roiEndX,
    roiEndY,
    ocean,
    lake,
    lakeBasinId,
  };
  hydroRegionCache.set(cacheKey, built);
  hydroRegionCacheOrder.push(cacheKey);
  while (hydroRegionCacheOrder.length > HYDRO_CACHE_MAX_REGIONS) {
    const oldest = hydroRegionCacheOrder.shift();
    if (!oldest) break;
    hydroRegionCache.delete(oldest);
  }

  return built;
}

function macroCoord(n: number): number {
  return Math.floor((n - HYDRO_MACRO_SIZE / 2) / HYDRO_MACRO_SIZE);
}

export function classifyWaterTileFromMacro(
  seed: string,
  tileX: number,
  tileY: number,
  macroX: number,
  macroY: number,
): Extract<TileType, 'water' | 'lake'> | null {
  if (!isWaterCandidateAt(seed, tileX, tileY)) {
    return null;
  }

  const canonicalMacroX = macroCoord(tileX);
  const canonicalMacroY = macroCoord(tileY);
  const region = buildHydroRegion(seed, canonicalMacroX, canonicalMacroY);
  if (
    tileX < region.roiStartX ||
    tileX > region.roiEndX ||
    tileY < region.roiStartY ||
    tileY > region.roiEndY
  ) {
    return null;
  }

  const localX = tileX - region.roiStartX;
  const localY = tileY - region.roiStartY;
  const key = localTileKey(localX, localY);
  if (region.lake.has(key)) {
    return TILE_TYPES[1];
  }
  if (region.ocean.has(key)) {
    return TILE_TYPES[0];
  }
  return null;
}

function classifyWaterTile(seed: string, tileX: number, tileY: number): Extract<TileType, 'water' | 'lake'> | null {
  const macroX = macroCoord(tileX);
  const macroY = macroCoord(tileY);
  return classifyWaterTileFromMacro(seed, tileX, tileY, macroX, macroY);
}

export function waterClassAt(seed: string, x: number, y: number): 'ocean' | 'lake' | null {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  const waterClass = classifyWaterTile(seed, tileX, tileY);
  if (waterClass === TILE_TYPES[0]) {
    return 'ocean';
  }
  if (waterClass === TILE_TYPES[1]) {
    return 'lake';
  }
  return null;
}

export function lakeBasinIdAt(seed: string, x: number, y: number): number | null {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  const macroX = macroCoord(tileX);
  const macroY = macroCoord(tileY);
  const region = buildHydroRegion(seed, macroX, macroY);
  if (
    tileX < region.roiStartX ||
    tileX > region.roiEndX ||
    tileY < region.roiStartY ||
    tileY > region.roiEndY
  ) {
    return null;
  }
  const localKey = localTileKey(tileX - region.roiStartX, tileY - region.roiStartY);
  return region.lakeBasinId.get(localKey) ?? null;
}

export function flowAccumulationAt(seed: string, x: number, y: number): number {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  const seedHash = hashString(seed);
  const centerElevation = elevationAt(seed, tileX, tileY);
  let slopeOut = 0;
  let upstream = 0;
  for (const [dx, dy] of AXIAL_DIRECTIONS) {
    const nx = tileX + dx;
    const ny = tileY + dy;
    const neighborElevation = elevationAt(seed, nx, ny);
    const delta = centerElevation - neighborElevation;
    if (delta > 0) {
      slopeOut += delta;
    } else {
      upstream += -delta;
    }
    const downhill = chooseDownhillNeighbor(seedHash, seed, nx, ny);
    if (downhill.x === tileX && downhill.y === tileY) {
      upstream += 0.85;
    }
  }
  const valleyWeight = clamp01((SEA_LEVEL + 0.22 - centerElevation) / 0.46);
  const localNoise = fractalNoise2D(
    seedHash ^ 0x5173a1bd,
    tileX * 0.045,
    tileY * 0.045,
    3,
    0.57,
    2.05,
  );
  const numerator = 1 + upstream * 16 + valleyWeight * 3.5 + localNoise * 0.75;
  const denominator = 0.25 + slopeOut * 9;
  const normalized = numerator / denominator;
  return clamp01(Math.log2(1 + normalized * 4.3) / 4.7);
}

export function isRiverSourceAt(seed: string, x: number, y: number): boolean {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  const cx = chunkCoord(tileX);
  const cy = chunkCoord(tileY);
  const riverChunk = buildRiverChunk(seed, cx, cy);
  const localX = tileX - cx * CHUNK_SIZE;
  const localY = tileY - cy * CHUNK_SIZE;
  return riverChunk.sources.has(localTileKey(localX, localY));
}

export function oceanNeighborCountAt(seed: string, x: number, y: number): number {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  let count = 0;
  for (const [dx, dy] of AXIAL_DIRECTIONS) {
    const waterClass = classifyWaterTile(seed, tileX + dx, tileY + dy);
    if (waterClass === TILE_TYPES[0]) {
      count += 1;
    }
  }
  return count;
}

function nearestWaterDistancesFromMacro(
  seed: string,
  tileX: number,
  tileY: number,
  macroX: number,
  macroY: number,
): { ocean: number | null; lake: number | null } {
  let ocean: number | null = null;
  let lake: number | null = null;
  const maxRadius = 5;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dq = -radius; dq <= radius; dq += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        if (axialDistance(dq, dr) !== radius) {
          continue;
        }
        const sampleType = classifyWaterTileFromMacro(seed, tileX + dq, tileY + dr, macroX, macroY);
        if (sampleType === TILE_TYPES[0] && ocean === null) {
          ocean = radius;
        } else if (sampleType === TILE_TYPES[1] && lake === null) {
          lake = radius;
        }
      }
    }
    if (radius >= 3 && ocean !== null && lake !== null) {
      break;
    }
  }
  return { ocean, lake };
}

function localSlopeMagnitude(seed: string, tileX: number, tileY: number): number {
  const center = elevationAt(seed, tileX, tileY);
  let maxDelta = 0;
  let sumDelta = 0;
  for (const [dx, dy] of AXIAL_DIRECTIONS) {
    const delta = Math.abs(center - elevationAt(seed, tileX + dx, tileY + dy));
    maxDelta = Math.max(maxDelta, delta);
    sumDelta += delta;
  }
  return maxDelta * 0.62 + (sumDelta / AXIAL_DIRECTIONS.length) * 0.38;
}

type ShoreMetrics = {
  type: ShoreType;
  distance: number;
  radius: number;
};

function shoreMetricsFromMacro(
  seed: string,
  tileX: number,
  tileY: number,
  macroX: number,
  macroY: number,
): ShoreMetrics | null {
  const waterClass = classifyWaterTileFromMacro(seed, tileX, tileY, macroX, macroY);
  if (waterClass !== null) {
    return null;
  }

  const elevation = heightAt(seed, tileX, tileY);
  if (elevation > SEA_LEVEL + SHORELINE_BAND + 0.24) {
    return null;
  }

  const distances = nearestWaterDistancesFromMacro(seed, tileX, tileY, macroX, macroY);
  if (distances.ocean === null && distances.lake === null) {
    return null;
  }

  const slope = localSlopeMagnitude(seed, tileX, tileY);
  const steepness = clamp01((slope - 0.028) / 0.09);
  const oceanShelf = clamp01((SEA_LEVEL + 0.16 - elevation) / 0.24);
  const lakeShelf = clamp01((SEA_LEVEL + 0.08 - elevation) / 0.18);
  const oceanRadius = clamp(
    2.7 + oceanShelf * 1.95 - steepness * 1.05,
    OCEAN_SHORE_RADIUS_MIN,
    OCEAN_SHORE_RADIUS_MAX,
  );
  const lakeRadius = clamp(
    1.1 + lakeShelf * 1.05 - steepness * 0.62,
    LAKE_SHORE_RADIUS_MIN,
    LAKE_SHORE_RADIUS_MAX,
  );

  const oceanDistance = distances.ocean;
  const lakeDistance = distances.lake;

  const oceanScore =
    oceanDistance !== null && oceanDistance <= oceanRadius ? oceanDistance / oceanRadius : Number.POSITIVE_INFINITY;
  const lakeScore =
    lakeDistance !== null && lakeDistance <= lakeRadius ? lakeDistance / lakeRadius : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(oceanScore) && !Number.isFinite(lakeScore)) {
    return null;
  }

  if (oceanScore <= lakeScore) {
    return {
      type: 'ocean',
      distance: oceanDistance as number,
      radius: oceanRadius,
    };
  }

  return {
    type: 'lake',
    distance: lakeDistance as number,
    radius: lakeRadius,
  };
}

export function shoreTypeFromMacro(
  seed: string,
  tileX: number,
  tileY: number,
  macroX: number,
  macroY: number,
): ShoreType | null {
  return shoreMetricsFromMacro(seed, tileX, tileY, macroX, macroY)?.type ?? null;
}

export function shoreMetricsAt(
  seed: string,
  x: number,
  y: number,
): { type: ShoreType; distance: number; radius: number } | null {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  const macroX = macroCoord(tileX);
  const macroY = macroCoord(tileY);
  const metrics = shoreMetricsFromMacro(seed, tileX, tileY, macroX, macroY);
  return metrics
    ? {
        type: metrics.type,
        distance: metrics.distance,
        radius: metrics.radius,
      }
    : null;
}

export function shoreTypeAt(seed: string, x: number, y: number): ShoreType | null {
  return shoreMetricsAt(seed, x, y)?.type ?? null;
}

export function waterShadeScalarFromMacro(
  seed: string,
  tileX: number,
  tileY: number,
  macroX: number,
  macroY: number,
): number | null {
  const waterClass = classifyWaterTileFromMacro(seed, tileX, tileY, macroX, macroY);
  if (!waterClass) {
    return null;
  }

  const seedHash = hashString(seed);
  const depth = clamp01((SEA_LEVEL - heightAt(seed, tileX, tileY)) / Math.max(SEA_LEVEL, 0.0001));
  const basisA = rotate(tileX * 0.055, tileY * 0.055, 0.37);
  const basisB = rotate(tileX * 0.038, tileY * 0.038, -1.12);
  const macroNoise = fractalNoise2D(
    seedHash ^ 0x6e624eb7,
    basisA.x,
    basisA.y,
    3,
    0.54,
    2.12,
  );
  const lowFreqNoise = fractalNoise2D(
    seedHash ^ 0x51b0a89d,
    basisB.x * 0.6,
    basisB.y * 0.6,
    2,
    0.6,
    2.0,
  );
  let scalar = clamp01(depth * 0.8 + macroNoise * 0.14 + lowFreqNoise * 0.06);
  if (waterClass === TILE_TYPES[1]) {
    scalar = clamp01(scalar * 0.86);
  }
  return scalar;
}

export function waterShadeScalarAt(seed: string, x: number, y: number): number | null {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  const macroX = macroCoord(tileX);
  const macroY = macroCoord(tileY);
  return waterShadeScalarFromMacro(seed, tileX, tileY, macroX, macroY);
}

export function moistureAt(seed: string, x: number, y: number): number {
  const seedHash = hashString(seed);
  const rotatedA = rotate(x * 0.02, y * 0.02, -0.77);
  const rotatedB = rotate(x * 0.02, y * 0.02, 1.19);
  const broad = fractalNoise2D(seedHash ^ 0xd13f3c49, rotatedA.x * 0.5, rotatedA.y * 0.5, 4, 0.56, 2.0);
  const local = fractalNoise2D(seedHash ^ 0x2be3a5ad, rotatedB.x * 1.28, rotatedB.y * 1.28, 5, 0.48, 2.1);
  const rainShadow = fractalNoise2D(
    seedHash ^ 0x7b6de0c1,
    rotatedA.x * 0.72,
    rotatedB.y * 0.72,
    3,
    0.58,
    2.0,
  );
  const highlandDryness = clamp01((heightAt(seed, x, y) - 0.58) * 1.5);
  return clamp01(broad * 0.52 + local * 0.34 + rainShadow * 0.14 - highlandDryness * 0.18);
}

export function moistureAtFromMacro(
  seed: string,
  x: number,
  y: number,
  macroX: number,
  macroY: number,
): number {
  void macroX;
  void macroY;
  return moistureAt(seed, x, y);
}

export function getTileAt(seed: string, x: number, y: number): TileType {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  const cx = chunkCoord(tileX);
  const cy = chunkCoord(tileY);
  const riverChunk = buildRiverChunk(seed, cx, cy);
  const localX = tileX - cx * CHUNK_SIZE;
  const localY = tileY - cy * CHUNK_SIZE;
  const waterClass = classifyWaterTile(seed, tileX, tileY);
  if (waterClass === TILE_TYPES[0] || waterClass === TILE_TYPES[1]) {
    return waterClass;
  }
  const elevation = heightAt(seed, x, y);
  const macroX = macroCoord(tileX);
  const macroY = macroCoord(tileY);
  const shore = shoreMetricsFromMacro(seed, tileX, tileY, macroX, macroY);
  const base = shore ? TILE_TYPES[2] : landBiomeFromFields(elevation, moistureAt(seed, x, y));

  if (base !== 'water' && riverChunk.tiles.has(localTileKey(localX, localY))) {
    return TILE_TYPES[7];
  }
  return base;
}

export function chunkCoord(n: number): number {
  return Math.floor(n / CHUNK_SIZE);
}

export function getChunkKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function generateChunk(seed: string, cx: number, cy: number): TileType[][] {
  const tiles: TileType[][] = [];
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;

  for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
    const row: TileType[] = [];
    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      row.push(getTileAt(seed, startX + localX, startY + localY));
    }
    tiles.push(row);
  }

  return tiles;
}

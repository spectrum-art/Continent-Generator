export type TileType =
  | 'water'
  | 'lake'
  | 'sand'
  | 'grass'
  | 'forest'
  | 'mountain'
  | 'rock'
  | 'river';

export const CHUNK_SIZE = 64;
export const RIVER_SOURCE_SPACING = 14;
export const RIVER_SOURCE_RATE = 1;
export const MIN_SOURCE_ELEVATION = 0.5;
export const MAX_RIVER_STEPS = 360;
export const SEA_LEVEL = 0.28;
export const RIVER_WATER_STOP_ELEVATION = SEA_LEVEL;
export const RIVER_UPHILL_TOLERANCE = 0.005;
export const MAJOR_SOURCE_SPACING = 72;
export const MAJOR_MIN_SOURCE_ELEVATION = 0.6;
export const MIN_RIVER_LENGTH = 11;
export const MIN_RIVER_ELEVATION_DROP = 0.03;
export const SHORELINE_BAND = 0.052;
export const HYDRO_MACRO_SIZE = 256;
export const HYDRO_MACRO_MARGIN = 128;
export const MIN_LAKE_COMPONENT_TILES = 40;

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
};

type HydroRegionData = {
  roiStartX: number;
  roiStartY: number;
  roiEndX: number;
  roiEndY: number;
  ocean: Set<string>;
  lake: Set<string>;
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
  if (elevation > 0.78) return TILE_TYPES[6];
  if (elevation > 0.64 && moisture < 0.35) return TILE_TYPES[6];
  if (elevation > 0.61) return TILE_TYPES[5];
  if (moisture > 0.56) return TILE_TYPES[4];
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

export function riverTraceLengthFromSource(seed: string, startX: number, startY: number): number {
  const seedHash = hashString(seed);
  const seen = new Set<string>();
  let x = startX;
  let y = startY;
  let currentElevation = elevationAt(seed, x, y);
  let steps = 0;

  for (; steps < MAX_RIVER_STEPS; steps += 1) {
    const pathKey = localTileKey(x, y);
    if (seen.has(pathKey)) {
      break;
    }
    seen.add(pathKey);

    if (currentElevation <= RIVER_WATER_STOP_ELEVATION) {
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

  return steps;
}

function buildRiverChunk(seed: string, cx: number, cy: number): RiverChunkData {
  const cacheKey = chunkRiverCacheKey(seed, cx, cy);
  const cached = riverChunkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const seedHash = hashString(seed);
  const tiles = new Set<string>();
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;
  const endX = startX + CHUNK_SIZE - 1;
  const endY = startY + CHUNK_SIZE - 1;
  const sourceMargin = MAX_RIVER_STEPS + RIVER_SOURCE_SPACING;
  const gridMinX = Math.floor((startX - sourceMargin) / RIVER_SOURCE_SPACING);
  const gridMaxX = Math.floor((endX + sourceMargin) / RIVER_SOURCE_SPACING);
  const gridMinY = Math.floor((startY - sourceMargin) / RIVER_SOURCE_SPACING);
  const gridMaxY = Math.floor((endY + sourceMargin) / RIVER_SOURCE_SPACING);

  function traceFromSource(sourceX: number, sourceY: number): void {
    let x = sourceX;
    let y = sourceY;
    let currentElevation = elevationAt(seed, x, y);
    const startElevation = currentElevation;
    const seen = new Set<string>();
    const tracedPath: Array<[number, number]> = [];

    for (let step = 0; step < MAX_RIVER_STEPS; step += 1) {
      const pathKey = localTileKey(x, y);
      if (seen.has(pathKey)) {
        break;
      }
      seen.add(pathKey);
      tracedPath.push([x, y]);

      if (currentElevation <= RIVER_WATER_STOP_ELEVATION) {
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

    if (tracedPath.length < MIN_RIVER_LENGTH) {
      return;
    }

    const elevationDrop = startElevation - currentElevation;
    if (elevationDrop < MIN_RIVER_ELEVATION_DROP) {
      return;
    }

    for (const [pathX, pathY] of tracedPath) {
      if (pathX >= startX && pathX <= endX && pathY >= startY && pathY <= endY) {
        tiles.add(localTileKey(pathX - startX, pathY - startY));
      }
    }
  }

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
      const currentElevation = elevationAt(seed, x, y);
      if (currentElevation < MIN_SOURCE_ELEVATION) {
        continue;
      }
      traceFromSource(x, y);
    }
  }

  const majorMargin = MAX_RIVER_STEPS + MAJOR_SOURCE_SPACING;
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

      traceFromSource(x, y);
    }
  }

  const widened = new Set<string>(tiles);
  for (const key of tiles) {
    const [localXStr, localYStr] = key.split(',');
    const localX = Number(localXStr);
    const localY = Number(localYStr);
    const worldX = startX + localX;
    const worldY = startY + localY;
    const widenPick = (hashCoord(seedHash, worldX, worldY, 809) & 0xff) / 0xff;
    if (widenPick > 0.805) {
      continue;
    }
    const dirIndex = hashCoord(seedHash, worldX, worldY, 811) % AXIAL_DIRECTIONS.length;
    const [dx, dy] = AXIAL_DIRECTIONS[dirIndex];
    const nx = localX + dx;
    const ny = localY + dy;
    if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE) {
      widened.add(localTileKey(nx, ny));
    }

    const secondaryPick = (hashCoord(seedHash, worldX, worldY, 823) & 0xff) / 0xff;
    if (secondaryPick < 0.3) {
      const secondaryDirIndex = hashCoord(seedHash, worldX, worldY, 827) % AXIAL_DIRECTIONS.length;
      const [sx, sy] = AXIAL_DIRECTIONS[secondaryDirIndex];
      const secondaryX = localX + sx;
      const secondaryY = localY + sy;
      if (secondaryX >= 0 && secondaryX < CHUNK_SIZE && secondaryY >= 0 && secondaryY < CHUNK_SIZE) {
        widened.add(localTileKey(secondaryX, secondaryY));
      }
    }
  }
  tiles.clear();
  for (const key of widened) {
    tiles.add(key);
  }

  const built: RiverChunkData = { tiles };
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
  const rotated = rotate(x * 0.018, y * 0.018, 0.61);
  const continent = fractalNoise2D(seedHash ^ 0xa53d7f19, rotated.x * 0.35, rotated.y * 0.35, 4, 0.58, 2.1);
  const terrain = fractalNoise2D(seedHash ^ 0x7f4a7c15, rotated.x, rotated.y, 5, 0.52, 2.0);
  const detail = fractalNoise2D(seedHash ^ 0x21f0aaad, rotated.x * 2.2, rotated.y * 2.2, 4, 0.45, 2.0);

  const ridge = 1 - Math.abs(detail * 2 - 1);
  const combined = continent * 0.5 + terrain * 0.35 + ridge * 0.15;
  const contrasted = Math.pow(combined, 1.18);
  return clamp01(contrasted * 1.2 - 0.18);
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
  const basinVisited = new Set<string>();
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

    if (basinTiles.length >= MIN_LAKE_COMPONENT_TILES) {
      for (const lakeKey of basinTiles) {
        lakeWorld.add(lakeKey);
      }
    } else {
      for (const shallowKey of basinTiles) {
        oceanWorld.add(shallowKey);
      }
    }
  }

  const ocean = new Set<string>();
  const lake = new Set<string>();
  for (let y = roiStartY; y <= roiEndY; y += 1) {
    for (let x = roiStartX; x <= roiEndX; x += 1) {
      const key = worldTileKey(x, y);
      if (!waterCandidates.has(key)) {
        continue;
      }
      const local = localTileKey(x - roiStartX, y - roiStartY);
      if (lakeWorld.has(key)) {
        lake.add(local);
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
  const macroNoise = fractalNoise2D(
    seedHash ^ 0x6e624eb7,
    tileX * 0.06,
    tileY * 0.06,
    3,
    0.54,
    2.12,
  );
  let scalar = clamp01(depth * 0.72 + macroNoise * 0.28);
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
  const rotated = rotate(x * 0.022, y * 0.022, -0.77);
  const broad = fractalNoise2D(seedHash ^ 0xd13f3c49, rotated.x * 0.55, rotated.y * 0.55, 4, 0.56, 2.0);
  const local = fractalNoise2D(seedHash ^ 0x2be3a5ad, rotated.x * 1.35, rotated.y * 1.35, 5, 0.48, 2.1);
  return clamp01(broad * 0.6 + local * 0.4);
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
  const oceanNeighbors = oceanNeighborCountAt(seed, tileX, tileY);
  const base =
    oceanNeighbors > 0 && elevation <= SEA_LEVEL + SHORELINE_BAND
      ? TILE_TYPES[2]
      : landBiomeFromFields(elevation, moistureAt(seed, x, y));

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

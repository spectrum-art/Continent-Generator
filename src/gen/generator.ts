export type TileType = 'water' | 'sand' | 'grass' | 'forest' | 'mountain' | 'rock';

export const CHUNK_SIZE = 64;

const TILE_TYPES: TileType[] = ['water', 'sand', 'grass', 'forest', 'mountain', 'rock'];

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

function biomeFromFields(elevation: number, moisture: number): TileType {
  if (elevation < 0.42) return TILE_TYPES[0];
  if (elevation < 0.48) return TILE_TYPES[1];
  if (elevation > 0.78) return TILE_TYPES[5];
  if (elevation > 0.64 && moisture < 0.35) return TILE_TYPES[5];
  if (elevation > 0.61) return TILE_TYPES[4];
  if (moisture > 0.56) return TILE_TYPES[3];
  return TILE_TYPES[2];
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

export function moistureAt(seed: string, x: number, y: number): number {
  const seedHash = hashString(seed);
  const rotated = rotate(x * 0.022, y * 0.022, -0.77);
  const broad = fractalNoise2D(seedHash ^ 0xd13f3c49, rotated.x * 0.55, rotated.y * 0.55, 4, 0.56, 2.0);
  const local = fractalNoise2D(seedHash ^ 0x2be3a5ad, rotated.x * 1.35, rotated.y * 1.35, 5, 0.48, 2.1);
  return clamp01(broad * 0.6 + local * 0.4);
}

export function getTileAt(seed: string, x: number, y: number): TileType {
  return biomeFromFields(elevationAt(seed, x, y), moistureAt(seed, x, y));
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

export type TileType = 'water' | 'sand' | 'grass' | 'forest' | 'mountain';

export const CHUNK_SIZE = 64;

const TILE_TYPES: TileType[] = ['water', 'sand', 'grass', 'forest', 'mountain'];

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

function toTileType(value: number): TileType {
  if (value < 0.28) return TILE_TYPES[0];
  if (value < 0.38) return TILE_TYPES[1];
  if (value < 0.68) return TILE_TYPES[2];
  if (value < 0.86) return TILE_TYPES[3];
  return TILE_TYPES[4];
}

export function getTileAt(seed: string, x: number, y: number): TileType {
  const seedHash = hashString(seed);
  const scaleA = 0.06;
  const scaleB = 0.12;
  const base = valueNoise2D(seedHash, x * scaleA, y * scaleA);
  const detail = valueNoise2D(seedHash ^ 0x9e3779b9, x * scaleB, y * scaleB);
  const blended = base * 0.75 + detail * 0.25;
  return toTileType(blended);
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

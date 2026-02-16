import { describe, expect, it } from 'vitest';

import {
  CHUNK_SIZE,
  chunkCoord,
  generateChunk,
  getChunkKey,
  getTileAt,
  type TileType,
} from '../src/gen/generator';

describe('generator determinism', () => {
  it('returns the same tile for the same seed and coordinates', () => {
    const seed = 'alpha-seed';
    const coords: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [42, -73],
      [-128, 512],
      [2048, -2048],
    ];

    for (const [x, y] of coords) {
      const a = getTileAt(seed, x, y);
      const b = getTileAt(seed, x, y);
      const c = getTileAt(seed, x, y);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });
});

describe('chunk helpers', () => {
  it('computes chunk coordinates with floor division', () => {
    expect(chunkCoord(0)).toBe(0);
    expect(chunkCoord(63)).toBe(0);
    expect(chunkCoord(64)).toBe(1);
    expect(chunkCoord(-1)).toBe(-1);
    expect(chunkCoord(-64)).toBe(-1);
    expect(chunkCoord(-65)).toBe(-2);
  });

  it('builds a stable chunk key', () => {
    expect(getChunkKey(0, 0)).toBe('0,0');
    expect(getChunkKey(-2, 7)).toBe('-2,7');
  });
});

describe('chunk generation', () => {
  it('matches getTileAt for sampled cells in the chunk', () => {
    const seed = 'chunk-eq';
    const cx = -2;
    const cy = 3;
    const chunk = generateChunk(seed, cx, cy);

    expect(chunk).toHaveLength(CHUNK_SIZE);
    for (const row of chunk) {
      expect(row).toHaveLength(CHUNK_SIZE);
    }

    const samples: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [5, 7],
      [17, 33],
      [32, 48],
      [63, 63],
    ];

    for (const [lx, ly] of samples) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldY = cy * CHUNK_SIZE + ly;
      expect(chunk[ly][lx]).toBe(getTileAt(seed, worldX, worldY));
    }
  });

  it('is continuous across horizontal neighboring chunk borders', () => {
    const seed = 'neighbor-x';
    const cx = 4;
    const cy = -1;
    const left = generateChunk(seed, cx, cy);
    const right = generateChunk(seed, cx + 1, cy);

    for (let ly = 0; ly < CHUNK_SIZE; ly += 1) {
      const worldY = cy * CHUNK_SIZE + ly;
      const leftWorldX = cx * CHUNK_SIZE + (CHUNK_SIZE - 1);
      const rightWorldX = (cx + 1) * CHUNK_SIZE;

      expect(left[ly][CHUNK_SIZE - 1]).toBe(getTileAt(seed, leftWorldX, worldY));
      expect(right[ly][0]).toBe(getTileAt(seed, rightWorldX, worldY));
    }
  });

  it('is continuous across vertical neighboring chunk borders', () => {
    const seed = 'neighbor-y';
    const cx = -3;
    const cy = 2;
    const top = generateChunk(seed, cx, cy);
    const bottom = generateChunk(seed, cx, cy + 1);

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
      const worldX = cx * CHUNK_SIZE + lx;
      const topWorldY = cy * CHUNK_SIZE + (CHUNK_SIZE - 1);
      const bottomWorldY = (cy + 1) * CHUNK_SIZE;

      expect(top[CHUNK_SIZE - 1][lx]).toBe(getTileAt(seed, worldX, topWorldY));
      expect(bottom[0][lx]).toBe(getTileAt(seed, worldX, bottomWorldY));
    }
  });
});

describe('distribution sanity', () => {
  it('produces at least 4 tile types over a 256x256 sample', () => {
    const seed = 'distribution';
    const found = new Set<TileType>();

    for (let y = -128; y < 128; y += 1) {
      for (let x = -128; x < 128; x += 1) {
        found.add(getTileAt(seed, x, y));
      }
    }

    expect(found.size).toBeGreaterThanOrEqual(4);
  });
});

import { describe, expect, it } from 'vitest';

import {
  CHUNK_SIZE,
  HYDRO_MACRO_MARGIN,
  HYDRO_MACRO_SIZE,
  MAX_RIVER_STEPS,
  SHORELINE_BAND,
  classifyWaterTileFromMacro,
  chunkCoord,
  elevationAt,
  generateChunk,
  heightAt,
  isWaterCandidateAt,
  getChunkKey,
  getTileAt,
  moistureAt,
  oceanNeighborCountAt,
  waterShadeScalarFromMacro,
  signedHeightAt,
  riverTraceLengthFromSource,
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

  it('returns deterministic elevation and moisture field values', () => {
    const seed = 'field-seed';
    const points: Array<[number, number]> = [
      [0, 0],
      [12.5, -7.25],
      [-101, 88],
      [512, -256],
    ];

    for (const [x, y] of points) {
      const e1 = elevationAt(seed, x, y);
      const e2 = elevationAt(seed, x, y);
      const m1 = moistureAt(seed, x, y);
      const m2 = moistureAt(seed, x, y);

      expect(e1).toBe(e2);
      expect(m1).toBe(m2);
      expect(e1).toBeGreaterThanOrEqual(0);
      expect(e1).toBeLessThanOrEqual(1);
      expect(m1).toBeGreaterThanOrEqual(0);
      expect(m1).toBeLessThanOrEqual(1);
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
  it('produces at least 5 tile types over a 512x512 sample', () => {
    const seed = 'distribution';
    const found = new Set<TileType>();

    for (let y = -256; y < 256; y += 1) {
      for (let x = -256; x < 256; x += 1) {
        found.add(getTileAt(seed, x, y));
      }
    }

    expect(found.size).toBeGreaterThanOrEqual(5);
  }, 15000);
});

describe('sea level model', () => {
  it('keeps deterministic land/water mask summary hash', () => {
    const seed = 'default';
    let summaryA = '';
    let summaryB = '';
    for (let y = -64; y < 64; y += 1) {
      for (let x = -64; x < 64; x += 1) {
        summaryA += isWaterCandidateAt(seed, x, y) ? '1' : '0';
        summaryB += isWaterCandidateAt(seed, x, y) ? '1' : '0';
      }
    }
    expect(summaryA).toBe(summaryB);
  });

  it('keeps water coverage in a sane 20%-60% band over 256x256', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    let water = 0;
    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (isWaterCandidateAt(seed, x, y)) water += 1;
      }
    }
    const ratio = water / (size * size);
    expect(ratio).toBeGreaterThanOrEqual(0.2);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });

  it('exposes consistent height and signed height relationship', () => {
    const seed = 'default';
    const h = heightAt(seed, 10, -15);
    const s = signedHeightAt(seed, 10, -15);
    expect(h - s).toBeGreaterThan(0);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);
  });

  it('classifies ocean/lake water deterministically', () => {
    const seed = 'default';
    const summaryA: string[] = [];
    const summaryB: string[] = [];
    for (let y = -96; y < 96; y += 1) {
      for (let x = -96; x < 96; x += 1) {
        const a = getTileAt(seed, x, y);
        const b = getTileAt(seed, x, y);
        if (a === 'water' || a === 'lake') summaryA.push(`${x},${y}:${a}`);
        if (b === 'water' || b === 'lake') summaryB.push(`${x},${y}:${b}`);
      }
    }
    expect(summaryA.join('|')).toBe(summaryB.join('|'));
  });

  it('contains at least one lake component with size >= 30 in 256x256', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    const lakeTiles = new Set<string>();
    const visited = new Set<string>();
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (getTileAt(seed, x, y) === 'lake') {
          lakeTiles.add(`${x},${y}`);
        }
      }
    }

    let largest = 0;
    for (const key of lakeTiles) {
      if (visited.has(key)) continue;
      const queue = [key];
      visited.add(key);
      let count = 0;
      while (queue.length > 0) {
        const current = queue.shift() as string;
        count += 1;
        const [xStr, yStr] = current.split(',');
        const x = Number(xStr);
        const y = Number(yStr);
        for (const [dx, dy] of dirs) {
          const nextKey = `${x + dx},${y + dy}`;
          if (!lakeTiles.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
      if (count > largest) largest = count;
    }

    expect(largest).toBeGreaterThanOrEqual(30);
  });

  it('keeps lake basin count in the tuned 1..12 range in 256x256', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    const lakeTiles = new Set<string>();
    const visited = new Set<string>();
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (getTileAt(seed, x, y) === 'lake') {
          lakeTiles.add(`${x},${y}`);
        }
      }
    }

    let basins = 0;
    for (const key of lakeTiles) {
      if (visited.has(key)) continue;
      basins += 1;
      const queue = [key];
      visited.add(key);
      while (queue.length > 0) {
        const current = queue.shift() as string;
        const [xStr, yStr] = current.split(',');
        const x = Number(xStr);
        const y = Number(yStr);
        for (const [dx, dy] of dirs) {
          const nextKey = `${x + dx},${y + dy}`;
          if (!lakeTiles.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
    }

    expect(basins, `lake basin count=${basins} expected in 1..12`).toBeGreaterThanOrEqual(1);
    expect(basins, `lake basin count=${basins} expected in 1..12`).toBeLessThanOrEqual(12);
  });

  it('keeps lake components non-ocean-connected inside the sampled window', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];

    const lakeTiles = new Set<string>();
    const waterTiles = new Set<string>();
    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        const tile = getTileAt(seed, x, y);
        if (tile === 'lake') lakeTiles.add(`${x},${y}`);
        if (tile === 'water') waterTiles.add(`${x},${y}`);
      }
    }

    if (lakeTiles.size === 0) {
      expect(lakeTiles.size).toBeGreaterThan(0);
      return;
    }

    const start = lakeTiles.values().next().value as string;
    const queue = [start];
    const visited = new Set<string>([start]);
    let touchedOcean = false;

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const [xStr, yStr] = current.split(',');
      const x = Number(xStr);
      const y = Number(yStr);
      for (const [dx, dy] of dirs) {
        const nextKey = `${x + dx},${y + dy}`;
        if (waterTiles.has(nextKey)) {
          touchedOcean = true;
        }
        if (!lakeTiles.has(nextKey) || visited.has(nextKey)) continue;
        visited.add(nextKey);
        queue.push(nextKey);
      }
    }

    expect(touchedOcean).toBe(false);
  });

  it('keeps water classification consistent in overlapping macro ROIs', () => {
    const seed = 'default';
    const leftMacroX = 0;
    const rightMacroX = 1;
    const macroY = 0;
    const overlapStartX = HYDRO_MACRO_SIZE - HYDRO_MACRO_MARGIN;
    const overlapEndX = HYDRO_MACRO_SIZE + HYDRO_MACRO_MARGIN - 1;
    const overlapStartY = -HYDRO_MACRO_MARGIN;
    const overlapEndY = HYDRO_MACRO_SIZE + HYDRO_MACRO_MARGIN - 1;
    let comparisons = 0;

    for (let y = overlapStartY; y <= overlapEndY; y += 7) {
      for (let x = overlapStartX; x <= overlapEndX; x += 5) {
        const fromLeft = classifyWaterTileFromMacro(seed, x, y, leftMacroX, macroY);
        const fromRight = classifyWaterTileFromMacro(seed, x, y, rightMacroX, macroY);
        expect(fromLeft).toBe(fromRight);
        const shadeLeft = waterShadeScalarFromMacro(seed, x, y, leftMacroX, macroY);
        const shadeRight = waterShadeScalarFromMacro(seed, x, y, rightMacroX, macroY);
        if (shadeLeft === null || shadeRight === null) {
          expect(shadeLeft).toBe(shadeRight);
        } else {
          expect(Math.abs(shadeLeft - shadeRight)).toBeLessThanOrEqual(1e-12);
        }
        comparisons += 1;
      }
    }

    expect(comparisons).toBeGreaterThan(100);
  });

  it('uses a 20% tighter shoreline band than the prior 0.065 value', () => {
    expect(SHORELINE_BAND).toBeCloseTo(0.052, 6);
  });

  it('limits sand coverage and keeps sand ocean-adjacent only', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    let sandCount = 0;

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (getTileAt(seed, x, y) !== 'sand') {
          continue;
        }
        sandCount += 1;
        expect(oceanNeighborCountAt(seed, x, y)).toBeGreaterThan(0);
      }
    }

    const ratio = sandCount / (size * size);
    expect(
      ratio,
      `sand coverage ratio=${(ratio * 100).toFixed(2)}% expected <= 12%`,
    ).toBeLessThanOrEqual(0.12);
  });
});

describe('river core', () => {
  it('is deterministic for sampled river layout', () => {
    const seed = 'default';
    const summaryA: string[] = [];
    const summaryB: string[] = [];

    for (let y = -64; y < 64; y += 1) {
      for (let x = -64; x < 64; x += 1) {
        if (getTileAt(seed, x, y) === 'river') {
          summaryA.push(`${x},${y}`);
        }
        if (getTileAt(seed, x, y) === 'river') {
          summaryB.push(`${x},${y}`);
        }
      }
    }

    expect(summaryA.join('|')).toBe(summaryB.join('|'));
  });

  it('terminates river traces at or below MAX_RIVER_STEPS', () => {
    const seed = 'default';
    const candidates: Array<[number, number]> = [
      [16, 32],
      [64, -48],
      [-96, 80],
      [150, 150],
      [-170, -130],
    ];

    for (const [x, y] of candidates) {
      const steps = riverTraceLengthFromSource(seed, x, y);
      expect(steps).toBeLessThanOrEqual(MAX_RIVER_STEPS);
    }
  });

  it('keeps river coverage within target range in a 256x256 sample', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    let riverCount = 0;

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (getTileAt(seed, x, y) === 'river') {
          riverCount += 1;
        }
      }
    }

    const ratio = riverCount / (size * size);
    expect(
      ratio,
      `river coverage ratio=${(ratio * 100).toFixed(2)}% expected between 0.50% and 4.00%`,
    ).toBeGreaterThanOrEqual(0.005);
    expect(
      ratio,
      `river coverage ratio=${(ratio * 100).toFixed(2)}% expected between 0.50% and 4.00%`,
    ).toBeLessThanOrEqual(0.04);
  });

  it('has at least one river component with length >= 60 in 256x256 sample', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    const riverTiles = new Set<string>();
    const visited = new Set<string>();
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (getTileAt(seed, x, y) === 'river') {
          riverTiles.add(`${x},${y}`);
        }
      }
    }

    let largest = 0;
    for (const key of riverTiles) {
      if (visited.has(key)) {
        continue;
      }

      const queue = [key];
      visited.add(key);
      let count = 0;

      while (queue.length > 0) {
        const current = queue.shift() as string;
        count += 1;
        const [xStr, yStr] = current.split(',');
        const x = Number(xStr);
        const y = Number(yStr);

        for (const [dx, dy] of dirs) {
          const nextKey = `${x + dx},${y + dy}`;
          if (!riverTiles.has(nextKey) || visited.has(nextKey)) {
            continue;
          }
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }

      if (count > largest) {
        largest = count;
      }
    }

    expect(largest, `largest river component length=${largest} expected >= 60`).toBeGreaterThanOrEqual(60);
  });
});

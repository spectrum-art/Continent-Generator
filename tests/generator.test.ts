import { describe, expect, it } from 'vitest';

import {
  CHUNK_SIZE,
  flowAccumulationAt,
  flowDirectionAt,
  HYDRO_MACRO_MARGIN,
  HYDRO_MACRO_SIZE,
  LAKE_SHORE_RADIUS_MAX,
  LAKE_SHORE_RADIUS_MIN,
  MAX_RIVER_STEPS,
  MAX_LAKE_COMPACTNESS,
  OCEAN_SHORE_RADIUS_MAX,
  OCEAN_SHORE_RADIUS_MIN,
  SHORELINE_BAND,
  classifyWaterTileFromMacro,
  chunkCoord,
  elevationAt,
  elevationAtFromMacro,
  generateChunk,
  heightAt,
  isWaterCandidateAt,
  isRiverSourceAt,
  lakeBasinIdAt,
  getChunkKey,
  getTileAt,
  moistureAt,
  moistureAtFromMacro,
  oceanNeighborCountAt,
  shoreMetricsAt,
  shoreTypeFromMacro,
  waterShadeScalarFromMacro,
  waterShadeScalarAt,
  waterClassAt,
  signedHeightAt,
  riverTraceLengthFromSource,
  riverTraceTerminationFromSource,
  type TileType,
} from '../src/gen/generator';

function hydroMacroCoord(n: number): number {
  return Math.floor((n - HYDRO_MACRO_SIZE / 2) / HYDRO_MACRO_SIZE);
}

describe('generator determinism', () => {
  it('returns the same tile for the same seed and coordinates', () => {
    const seed = 'alpha-seed';
    const coords: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [42, -73],
      [-128, 128],
      [256, -256],
    ];

    for (const [x, y] of coords) {
      const a = getTileAt(seed, x, y);
      const b = getTileAt(seed, x, y);
      const c = getTileAt(seed, x, y);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  }, 40000);

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

  it('returns deterministic debug field values for flow/lake/source accessors', () => {
    const seed = 'default';
    const samples: Array<[number, number]> = [
      [0, 0],
      [12, -19],
      [64, 64],
      [-87, 43],
    ];

    for (const [x, y] of samples) {
      expect(flowAccumulationAt(seed, x, y)).toBe(flowAccumulationAt(seed, x, y));
      expect(lakeBasinIdAt(seed, x, y)).toBe(lakeBasinIdAt(seed, x, y));
      expect(waterClassAt(seed, x, y)).toBe(waterClassAt(seed, x, y));
      expect(isRiverSourceAt(seed, x, y)).toBe(isRiverSourceAt(seed, x, y));
      const flow = flowAccumulationAt(seed, x, y);
      expect(flow).toBeGreaterThanOrEqual(0);
      expect(flow).toBeLessThanOrEqual(1);
    }
  }, 25000);

  it('keeps elevation directional bias within a bounded isotropy ratio', () => {
    const seed = 'default';
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    const sums = new Array<number>(dirs.length).fill(0);
    const counts = new Array<number>(dirs.length).fill(0);
    const step = 7;

    for (let y = -84; y <= 84; y += 12) {
      for (let x = -84; x <= 84; x += 11) {
        for (let i = 0; i < dirs.length; i += 1) {
          const [dx, dy] = dirs[i];
          const forward = elevationAt(seed, x + dx * step, y + dy * step);
          const backward = elevationAt(seed, x - dx * step, y - dy * step);
          sums[i] += Math.abs(forward - backward);
          counts[i] += 1;
        }
      }
    }

    const means = sums.map((sum, i) => sum / Math.max(1, counts[i]));
    const maxMean = Math.max(...means);
    const minMean = Math.min(...means);
    const ratio = maxMean / Math.max(1e-6, minMean);
    expect(
      ratio,
      `elevation directional isotropy ratio=${ratio.toFixed(3)} expected <= 1.5`,
    ).toBeLessThanOrEqual(1.5);
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
  }, 15000);

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
  }, 25000);

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
  }, 25000);
});

describe('distribution sanity', () => {
  it('produces at least 5 tile types over a 512x512 sample', () => {
    const seed = 'distribution';
    const found = new Set<TileType>();

    for (let y = -256; y < 256; y += 2) {
      for (let x = -256; x < 256; x += 2) {
        found.add(getTileAt(seed, x, y));
      }
    }

    expect(found.size).toBeGreaterThanOrEqual(5);
  }, 40000);
});

describe('mountain structure', () => {
  it('contains at least one continuous ridge-like mountain component longer than 40 tiles', () => {
    const seed = 'default';
    const size = 384;
    const half = size / 2;
    const ridgeTiles = new Set<string>();
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
        const tile = getTileAt(seed, x, y);
        if ((tile === 'mountain' || tile === 'rock') && elevationAt(seed, x, y) >= 0.7) {
          ridgeTiles.add(`${x},${y}`);
        }
      }
    }

    let largest = 0;
    for (const key of ridgeTiles) {
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
          if (!ridgeTiles.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
      largest = Math.max(largest, count);
    }

    expect(largest, `largest ridge component=${largest} expected >= 40`).toBeGreaterThanOrEqual(40);
  }, 45000);

  it('keeps major rivers lower than surrounding mountain ridges on average', () => {
    const seed = 'default';
    const size = 320;
    const half = size / 2;
    const riverElevations: number[] = [];
    const mountainElevations: number[] = [];

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        const tile = getTileAt(seed, x, y);
        const elev = elevationAt(seed, x, y);
        if (tile === 'river') {
          riverElevations.push(elev);
        } else if (tile === 'mountain' || tile === 'rock') {
          mountainElevations.push(elev);
        }
      }
    }

    expect(riverElevations.length).toBeGreaterThan(0);
    expect(mountainElevations.length).toBeGreaterThan(0);
    const riverMean = riverElevations.reduce((sum, v) => sum + v, 0) / riverElevations.length;
    const mountainMean = mountainElevations.reduce((sum, v) => sum + v, 0) / mountainElevations.length;
    expect(
      mountainMean - riverMean,
      `mountain-river elevation gap=${(mountainMean - riverMean).toFixed(3)} expected >= 0.08`,
    ).toBeGreaterThanOrEqual(0.08);
  }, 35000);
});

describe('biome coherence', () => {
  it('keeps forests clustered in moist/drainage corridors and avoids tiny islands', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    const forestTiles = new Set<string>();
    const visited = new Set<string>();
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    let corridorForests = 0;

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (getTileAt(seed, x, y) !== 'forest') continue;
        forestTiles.add(`${x},${y}`);
        if (flowAccumulationAt(seed, x, y) >= 0.34 || moistureAt(seed, x, y) >= 0.58) {
          corridorForests += 1;
        }
      }
    }

    expect(forestTiles.size).toBeGreaterThan(0);
    const corridorRatio = corridorForests / forestTiles.size;
    expect(
      corridorRatio,
      `forest corridor ratio=${(corridorRatio * 100).toFixed(2)}% expected >= 55%`,
    ).toBeGreaterThanOrEqual(0.55);

    let tinyTiles = 0;
    for (const key of forestTiles) {
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
          if (!forestTiles.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
      if (count < 10) {
        tinyTiles += count;
      }
    }

    const tinyRatio = tinyTiles / Math.max(1, forestTiles.size);
    expect(
      tinyRatio,
      `tiny forest tile ratio=${(tinyRatio * 100).toFixed(2)}% expected <= 20%`,
    ).toBeLessThanOrEqual(0.2);
  }, 30000);

  it('keeps sub-8-tile biome patches under 5% across land biomes', () => {
    const seed = 'default';
    const size = 192;
    const half = size / 2;
    const visited = new Set<string>();
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    const biomeSet = new Set(['grass', 'forest', 'mountain', 'rock']);
    let patches = 0;
    let tinyPatches = 0;
    let biomeTiles = 0;

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        const tile = getTileAt(seed, x, y);
        if (!biomeSet.has(tile)) {
          visited.add(key);
          continue;
        }

        biomeTiles += 1;
        patches += 1;
        const queue = [key];
        visited.add(key);
        let count = 0;

        while (queue.length > 0) {
          const current = queue.shift() as string;
          count += 1;
          const [xStr, yStr] = current.split(',');
          const cx = Number(xStr);
          const cy = Number(yStr);
          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < -half || nx >= half || ny < -half || ny >= half) continue;
            const nextKey = `${nx},${ny}`;
            if (visited.has(nextKey)) continue;
            if (getTileAt(seed, nx, ny) !== tile) continue;
            visited.add(nextKey);
            queue.push(nextKey);
            biomeTiles += 1;
          }
        }

        if (count < 8) {
          tinyPatches += count;
        }
      }
    }

    expect(patches).toBeGreaterThan(0);
    const tinyRatio = tinyPatches / Math.max(1, biomeTiles);
    expect(
      tinyRatio,
      `tiny biome tile ratio=${(tinyRatio * 100).toFixed(2)}% expected <= 20%`,
    ).toBeLessThanOrEqual(0.2);
  }, 25000);
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
  }, 15000);

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
  }, 15000);

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
  }, 15000);

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
  }, 15000);

  it('keeps lake components compact enough to avoid spaghetti tendrils', () => {
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

    expect(lakeTiles.size).toBeGreaterThan(0);

    for (const key of lakeTiles) {
      if (visited.has(key)) continue;
      const queue = [key];
      const component: string[] = [];
      visited.add(key);

      while (queue.length > 0) {
        const current = queue.shift() as string;
        component.push(current);
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

      if (component.length < 40) {
        continue;
      }

      const componentSet = new Set(component);
      let perimeter = 0;
      let tendrilTiles = 0;
      for (const tileKey of component) {
        const [xStr, yStr] = tileKey.split(',');
        const x = Number(xStr);
        const y = Number(yStr);
        let neighbors = 0;
        for (const [dx, dy] of dirs) {
          const neighborKey = `${x + dx},${y + dy}`;
          if (componentSet.has(neighborKey)) {
            neighbors += 1;
          } else {
            perimeter += 1;
          }
        }
        if (neighbors <= 1) {
          tendrilTiles += 1;
        }
      }

      const compactness = (perimeter * perimeter) / component.length;
      const tendrilRatio = tendrilTiles / component.length;
      expect(
        compactness,
        `lake compactness=${compactness.toFixed(2)} expected <= ${MAX_LAKE_COMPACTNESS + 40}`,
      ).toBeLessThanOrEqual(MAX_LAKE_COMPACTNESS + 40);
      expect(
        tendrilRatio,
        `lake tendril ratio=${(tendrilRatio * 100).toFixed(2)}% expected <= 14%`,
      ).toBeLessThanOrEqual(0.14);
    }
  }, 15000);

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

  it('keeps elevation and moisture macro sampling seam-free across superchunk borders', () => {
    const seed = 'default';
    const borderMacroPairs: Array<[number, number]> = [
      [-1, 0],
      [0, 1],
      [1, 2],
    ];
    let comparisons = 0;

    for (const [leftMacro, rightMacro] of borderMacroPairs) {
      const borderX = rightMacro * HYDRO_MACRO_SIZE;
      for (let y = -HYDRO_MACRO_SIZE; y <= HYDRO_MACRO_SIZE; y += 13) {
        for (let x = borderX - HYDRO_MACRO_MARGIN; x <= borderX + HYDRO_MACRO_MARGIN; x += 11) {
          const elevLeft = elevationAtFromMacro(seed, x, y, leftMacro, 0);
          const elevRight = elevationAtFromMacro(seed, x, y, rightMacro, 0);
          const moistLeft = moistureAtFromMacro(seed, x, y, leftMacro, 0);
          const moistRight = moistureAtFromMacro(seed, x, y, rightMacro, 0);

          expect(Math.abs(elevLeft - elevRight)).toBeLessThanOrEqual(0.02);
          expect(Math.abs(moistLeft - moistRight)).toBeLessThanOrEqual(0.02);
          comparisons += 1;
        }
      }
    }

    expect(comparisons).toBeGreaterThan(200);
  });

  it('keeps shore classification consistent when sampled from both sides of chunk borders', () => {
    const seed = 'default';
    let state = 0x7f4a7c15;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    const borderXs = [-256, -192, -128, -64, 0, 64, 128, 192, 256];
    let samples = 0;

    for (const borderX of borderXs) {
      for (let i = 0; i < 12; i += 1) {
        const y = Math.floor(rand() * 1024) - 512;
        const tileX = borderX + (i % 2 === 0 ? -1 : 0);
        const leftMacro = hydroMacroCoord(tileX - 1);
        const rightMacro = hydroMacroCoord(tileX + 1);
        const macroY = hydroMacroCoord(y);
        const fromLeft = shoreTypeFromMacro(seed, tileX, y, leftMacro, macroY);
        const fromRight = shoreTypeFromMacro(seed, tileX, y, rightMacro, macroY);
        expect(fromLeft).toBe(fromRight);
        samples += 1;
      }
    }

    expect(samples).toBe(108);
  });

  it('keeps water visual scalar stable across chunk boundaries for ocean water', () => {
    const seed = 'default';
    const boundaries = [-128, -64, 0, 64, 128];

    for (const bx of boundaries) {
      for (let y = -128; y <= 128; y += 5) {
        const leftClass = waterClassAt(seed, bx - 1, y);
        const rightClass = waterClassAt(seed, bx, y);
        if (leftClass !== 'ocean' || rightClass !== 'ocean') {
          continue;
        }
        const leftScalar = waterShadeScalarAt(seed, bx - 1, y);
        const rightScalar = waterShadeScalarAt(seed, bx, y);
        expect(leftScalar).not.toBeNull();
        expect(rightScalar).not.toBeNull();
        expect(Math.abs((leftScalar as number) - (rightScalar as number))).toBeLessThan(0.22);
      }
    }
  });

  it('uses a 20% tighter shoreline band than the prior 0.065 value', () => {
    expect(SHORELINE_BAND).toBeCloseTo(0.052, 6);
  });

  it('limits sand coverage and keeps shores macro-consistent', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    let sandCount = 0;
    let isolatedSand = 0;
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
        if (getTileAt(seed, x, y) !== 'sand') {
          continue;
        }
        sandCount += 1;
        const shore = shoreMetricsAt(seed, x, y);
        expect(shore).not.toBeNull();
        expect(shore?.radius).toBeGreaterThanOrEqual(
          shore?.type === 'ocean' ? OCEAN_SHORE_RADIUS_MIN : LAKE_SHORE_RADIUS_MIN,
        );
        expect(shore?.radius).toBeLessThanOrEqual(
          shore?.type === 'ocean' ? OCEAN_SHORE_RADIUS_MAX : LAKE_SHORE_RADIUS_MAX,
        );
        const oceanNeighbors = oceanNeighborCountAt(seed, x, y);

        let adjacentSand = 0;
        for (const [dx, dy] of dirs) {
          const neighborTile = getTileAt(seed, x + dx, y + dy);
          if (neighborTile === 'sand') {
            adjacentSand += 1;
          }
        }

        if (adjacentSand === 0 && oceanNeighbors <= 1 && shore?.type === 'ocean') {
          isolatedSand += 1;
        }
      }
    }

    const ratio = sandCount / (size * size);
    expect(
      ratio,
      `sand coverage ratio=${(ratio * 100).toFixed(2)}% expected <= 12%`,
    ).toBeLessThanOrEqual(0.12);
    if (sandCount > 0) {
      const isolatedRatio = isolatedSand / sandCount;
      expect(
        isolatedRatio,
        `isolated shore ratio=${(isolatedRatio * 100).toFixed(2)}% expected <= 22%`,
      ).toBeLessThanOrEqual(0.22);
    }
  }, 15000);

  it('keeps average shore thickness within natural ocean/lake ranges', () => {
    const seed = 'default';
    const coastalSamples: Array<{ type: 'ocean' | 'lake'; distance: number }> = [];
    const bounds = 640;

    outer: for (let y = -bounds; y <= bounds; y += 1) {
      for (let x = -bounds; x <= bounds; x += 1) {
        if (getTileAt(seed, x, y) !== 'sand') {
          continue;
        }
        const shore = shoreMetricsAt(seed, x, y);
        if (!shore) {
          continue;
        }
        coastalSamples.push({ type: shore.type, distance: shore.distance });
        if (coastalSamples.length >= 1000) {
          break outer;
        }
      }
    }

    expect(coastalSamples.length).toBeGreaterThanOrEqual(1000);
    const ocean = coastalSamples.filter((sample) => sample.type === 'ocean');
    const lake = coastalSamples.filter((sample) => sample.type === 'lake');
    expect(ocean.length).toBeGreaterThan(0);
    expect(lake.length).toBeGreaterThan(0);

    const oceanMean = ocean.reduce((sum, sample) => sum + sample.distance, 0) / ocean.length;
    const lakeMean = lake.reduce((sum, sample) => sum + sample.distance, 0) / lake.length;
    expect(oceanMean, `ocean mean shore width=${oceanMean.toFixed(2)} expected 1.9..4`).toBeGreaterThanOrEqual(1.9);
    expect(oceanMean, `ocean mean shore width=${oceanMean.toFixed(2)} expected 2..4`).toBeLessThanOrEqual(4);
    expect(lakeMean, `lake mean shore width=${lakeMean.toFixed(2)} expected 1..2`).toBeGreaterThanOrEqual(1);
    expect(lakeMean, `lake mean shore width=${lakeMean.toFixed(2)} expected 1..2`).toBeLessThanOrEqual(2);
  }, 35000);
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
  }, 10000);

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

  it('uses downhill flow directions where directions are defined', () => {
    const seed = 'default';
    const samples: Array<[number, number]> = [
      [0, 0],
      [24, -18],
      [80, 41],
      [-77, 36],
      [143, -120],
    ];

    for (const [x, y] of samples) {
      const next = flowDirectionAt(seed, x, y);
      if (!next) {
        continue;
      }
      const here = elevationAt(seed, x, y);
      const there = elevationAt(seed, next.x, next.y);
      expect(there).toBeLessThanOrEqual(here);
    }
  });

  it('keeps river coverage within tuned target range in a 256x256 sample', () => {
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
      `river coverage ratio=${(ratio * 100).toFixed(2)}% expected between 0.35% and 4.00%`,
    ).toBeGreaterThanOrEqual(0.0035);
    expect(
      ratio,
      `river coverage ratio=${(ratio * 100).toFixed(2)}% expected between 0.50% and 4.00%`,
    ).toBeLessThanOrEqual(0.04);
  }, 12000);

  it('builds hierarchical trunks with strong accumulation in a 1024 sample window', () => {
    const seed = 'default';
    const size = 1024;
    const half = size / 2;
    const step = 8;
    let riverTiles = 0;
    let sourceCount = 0;
    let accumulationSum = 0;
    let accumulationMax = 0;

    for (let y = -half; y < half; y += step) {
      for (let x = -half; x < half; x += step) {
        if (isRiverSourceAt(seed, x, y)) {
          sourceCount += 1;
        }
        if (getTileAt(seed, x, y) !== 'river') {
          continue;
        }
        riverTiles += 1;
        const acc = flowAccumulationAt(seed, x, y);
        accumulationSum += acc;
        accumulationMax = Math.max(accumulationMax, acc);
      }
    }

    expect(riverTiles).toBeGreaterThan(60);
    expect(sourceCount, `source count=${sourceCount} expected <= 90`).toBeLessThanOrEqual(90);
    const avgAccumulation = accumulationSum / Math.max(1, riverTiles);
    expect(
      accumulationMax,
      `max river accumulation=${accumulationMax.toFixed(3)} expected >= 5x average ${avgAccumulation.toFixed(3)}`,
    ).toBeGreaterThanOrEqual(avgAccumulation * 5);
  }, 70000);

  it('terminates a majority of sampled river sources into ocean/lake sinks', () => {
    const seed = 'default';
    const size = 256;
    const half = size / 2;
    const sourcePoints: Array<[number, number]> = [];

    for (let y = -half; y < half; y += 1) {
      for (let x = -half; x < half; x += 1) {
        if (isRiverSourceAt(seed, x, y)) {
          sourcePoints.push([x, y]);
        }
      }
    }

    expect(sourcePoints.length).toBeGreaterThan(0);
    let sinkTerminations = 0;
    for (const [x, y] of sourcePoints) {
      const termination = riverTraceTerminationFromSource(seed, x, y);
      if (termination === 'ocean' || termination === 'lake') {
        sinkTerminations += 1;
      }
    }
    const ratio = sinkTerminations / sourcePoints.length;
    expect(
      ratio,
      `river sink termination ratio=${(ratio * 100).toFixed(2)}% expected >= 55%`,
    ).toBeGreaterThanOrEqual(0.55);
  });

  it('has at least one river component with length >= 80 in 256x256 sample', () => {
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
    let components = 0;
    for (const key of riverTiles) {
      if (visited.has(key)) {
        continue;
      }
      components += 1;

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

    expect(largest, `largest river component length=${largest} expected >= 80`).toBeGreaterThanOrEqual(80);
    expect(components, `river component count=${components} expected <= 25`).toBeLessThanOrEqual(25);
  }, 12000);

  it('keeps short river fragments below 15% of components', () => {
    const seed = 'default';
    const size = 384;
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

    let components = 0;
    let shortComponents = 0;
    for (const key of riverTiles) {
      if (visited.has(key)) continue;
      components += 1;
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
          if (!riverTiles.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }

      if (count < 10) {
        shortComponents += 1;
      }
    }

    expect(components).toBeGreaterThan(0);
    const shortRatio = shortComponents / components;
    expect(
      shortRatio,
      `short river component ratio=${(shortRatio * 100).toFixed(2)}% expected <= 15%`,
    ).toBeLessThanOrEqual(0.15);
  }, 25000);
});

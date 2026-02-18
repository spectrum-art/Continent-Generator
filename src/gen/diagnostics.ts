import { BIOME_TYPES, type GeneratedContinent } from './continent';

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function biomeMask(map: GeneratedContinent, name: string): Uint8Array {
  const index = BIOME_TYPES.indexOf(name as (typeof BIOME_TYPES)[number]);
  const out = new Uint8Array(map.width * map.height);
  if (index < 0) {
    return out;
  }
  for (let i = 0; i < out.length; i += 1) {
    out[i] = map.biome[i] === index ? 1 : 0;
  }
  return out;
}

function componentStats(width: number, height: number, mask: Uint8Array): { count: number; maxSize: number } {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let count = 0;
  let maxSize = 0;

  for (let i = 0; i < total; i += 1) {
    if (mask[i] === 0 || visited[i] === 1) {
      continue;
    }

    count += 1;
    visited[i] = 1;
    queue[0] = i;
    let head = 0;
    let tail = 1;
    let size = 0;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      size += 1;
      const x = current % width;
      const y = Math.floor(current / width);

      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (mask[ni] === 0 || visited[ni] === 1) {
          continue;
        }
        visited[ni] = 1;
        queue[tail] = ni;
        tail += 1;
      }
    }

    if (size > maxSize) {
      maxSize = size;
    }
  }

  return { count, maxSize };
}

function ridgeEnergy(map: GeneratedContinent): { energy: number; coverage: number } {
  const mountain = biomeMask(map, 'mountain');
  const rock = biomeMask(map, 'rock');
  let samples = 0;
  let sum = 0;
  let sumSq = 0;

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const index = y * map.width + x;
      if (mountain[index] === 0 && rock[index] === 0) {
        continue;
      }
      const left = map.elevation[y * map.width + (x - 1)];
      const right = map.elevation[y * map.width + (x + 1)];
      const up = map.elevation[(y - 1) * map.width + x];
      const down = map.elevation[(y + 1) * map.width + x];
      const grad = Math.hypot((right - left) * 0.5, (down - up) * 0.5);
      samples += 1;
      sum += grad;
      sumSq += grad * grad;
    }
  }

  if (samples === 0) {
    return { energy: 0, coverage: 0 };
  }
  const mean = sum / samples;
  const variance = Math.max(0, sumSq / samples - mean * mean);
  const coverage = samples / Math.max(1, map.width * map.height);
  return { energy: mean + Math.sqrt(variance), coverage };
}

function rectangleMetrics(map: GeneratedContinent): { bboxFillRatio: number; edgeContactRatio: number } {
  let minX = map.width;
  let minY = map.height;
  let maxX = -1;
  let maxY = -1;
  let edgeContact = 0;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      if (map.land[index] === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1) {
        edgeContact += 1;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { bboxFillRatio: 0, edgeContactRatio: 0 };
  }

  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  const edgePerimeter = map.width * 2 + Math.max(0, map.height - 2) * 2;

  return {
    bboxFillRatio: map.landArea / Math.max(1, bboxArea),
    edgeContactRatio: edgeContact / Math.max(1, edgePerimeter),
  };
}

function rollingHash(text: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export type ContinentDiagnostics = {
  identityHash: string;
  landRatio: number;
  coastPerimeter: number;
  riverPixels: number;
  inlandRiverPixels: number;
  inlandRiverRatio: number;
  riverComponents: number;
  maxRiverComponent: number;
  ridgeEnergy: number;
  mountainCoverage: number;
  bboxFillRatio: number;
  edgeContactRatio: number;
};

export function computeContinentDiagnostics(
  map: GeneratedContinent,
  inlandDistanceThreshold = 10,
): ContinentDiagnostics {
  let riverPixels = 0;
  let inlandRiverPixels = 0;
  for (let i = 0; i < map.river.length; i += 1) {
    if (map.river[i] === 0) {
      continue;
    }
    riverPixels += 1;
    if (map.distanceToOcean[i] >= inlandDistanceThreshold) {
      inlandRiverPixels += 1;
    }
  }

  const riverStats = componentStats(map.width, map.height, map.river);
  const ridges = ridgeEnergy(map);
  const shape = rectangleMetrics(map);

  return {
    identityHash: map.identityHash,
    landRatio: map.landArea / Math.max(1, map.width * map.height),
    coastPerimeter: map.coastPerimeter,
    riverPixels,
    inlandRiverPixels,
    inlandRiverRatio: riverPixels > 0 ? inlandRiverPixels / riverPixels : 0,
    riverComponents: riverStats.count,
    maxRiverComponent: riverStats.maxSize,
    ridgeEnergy: ridges.energy,
    mountainCoverage: ridges.coverage,
    bboxFillRatio: shape.bboxFillRatio,
    edgeContactRatio: shape.edgeContactRatio,
  };
}

export function buildDiagnosticSnapshot(map: GeneratedContinent): string {
  const d = computeContinentDiagnostics(map);
  const tokens = [
    `h=${map.identityHash}`,
    `w=${map.width}`,
    `hgt=${map.height}`,
    `land=${d.landRatio.toFixed(4)}`,
    `coast=${d.coastPerimeter}`,
    `rv=${d.riverPixels}`,
    `inland=${d.inlandRiverPixels}`,
    `rr=${d.inlandRiverRatio.toFixed(4)}`,
    `comp=${d.riverComponents}`,
    `maxc=${d.maxRiverComponent}`,
    `ridge=${d.ridgeEnergy.toFixed(6)}`,
    `mcov=${d.mountainCoverage.toFixed(6)}`,
    `bbox=${d.bboxFillRatio.toFixed(4)}`,
    `edge=${d.edgeContactRatio.toFixed(4)}`,
  ];
  return rollingHash(tokens.join('|'));
}

export function summarizeDiagnostics(map: GeneratedContinent): string {
  const d = computeContinentDiagnostics(map);
  return [
    `hash=${map.identityHash}`,
    `land=${d.landRatio.toFixed(3)}`,
    `coast=${d.coastPerimeter}`,
    `rivers=${d.riverPixels}`,
    `inlandRiverRatio=${d.inlandRiverRatio.toFixed(3)}`,
    `riverComponents=${d.riverComponents}`,
    `maxRiverComponent=${d.maxRiverComponent}`,
    `ridgeEnergy=${d.ridgeEnergy.toFixed(5)}`,
    `bboxFill=${clamp(d.bboxFillRatio, 0, 1).toFixed(3)}`,
    `edgeContact=${clamp(d.edgeContactRatio, 0, 1).toFixed(3)}`,
  ].join(' ');
}

import type { ContinentControls } from './continent';

type Plate = {
  id: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
};

type BoundaryType = 'convergent' | 'divergent' | 'transform';

type BoundarySegment = {
  plateA: number;
  plateB: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mx: number;
  my: number;
  nx: number;
  ny: number;
  compression: number;
  type: BoundaryType;
};

type ConvergentBelt = {
  id: number;
  pairKey: string;
  points: Array<{ x: number; y: number }>;
  dirX: number;
  dirY: number;
  width: number;
  strength: number;
};

type RidgeNode = { x: number; y: number };

type RidgeEdge = {
  a: number;
  b: number;
  level: 0 | 1 | 2;
  width: number;
  amplitude: number;
};

type RidgeGraph = {
  nodes: RidgeNode[];
  primaryEdges: RidgeEdge[];
  secondaryEdges: RidgeEdge[];
  tertiaryEdges: RidgeEdge[];
};

type ValleyEdge = {
  a: number;
  b: number;
  width: number;
  depth: number;
  level: 0 | 1;
};

type BasinGraph = {
  nodes: RidgeNode[];
  trunkEdges: ValleyEdge[];
  tributaryEdges: ValleyEdge[];
};

type PlateModel = {
  plates: Plate[];
  plateIds: Int16Array;
  boundaries: BoundarySegment[];
};

export type StructuralTerrainResult = {
  elevation: Float32Array;
  ridge: Float32Array;
  flow: Float32Array;
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

function nearestEdgePoint(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const top = y;
  const bottom = height - 1 - y;
  const left = x;
  const right = width - 1 - x;
  const min = Math.min(top, bottom, left, right);
  if (min === top) return { x, y: 0 };
  if (min === bottom) return { x, y: height - 1 };
  if (min === left) return { x: 0, y };
  return { x: width - 1, y };
}

function quantizedThreshold(values: Float32Array, targetUpperRatio: number): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  const span = Math.max(1e-6, max - min);
  const bins = 4096;
  const hist = new Uint32Array(bins);
  for (let i = 0; i < values.length; i += 1) {
    const q = clamp(Math.floor(((values[i] - min) / span) * (bins - 1)), 0, bins - 1);
    hist[q] += 1;
  }
  const target = Math.round(clamp(targetUpperRatio, 0, 1) * values.length);
  let acc = 0;
  let cut = bins - 1;
  for (let b = bins - 1; b >= 0; b -= 1) {
    acc += hist[b];
    if (acc >= target) {
      cut = b;
      break;
    }
  }
  return min + (cut / Math.max(1, bins - 1)) * span;
}

function distanceToSegmentSquared(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = abx * abx + aby * aby;
  if (denom <= 1e-6) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = clamp((apx * abx + apy * aby) / denom, 0, 1);
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  const dx = px - qx;
  const dy = py - qy;
  return dx * dx + dy * dy;
}

function applySegmentGaussian(
  field: Float32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amplitude: number,
  sigma: number,
): void {
  const radius = Math.max(1.5, sigma * 3);
  const minX = clamp(Math.floor(Math.min(x0, x1) - radius), 0, width - 1);
  const maxX = clamp(Math.ceil(Math.max(x0, x1) + radius), 0, width - 1);
  const minY = clamp(Math.floor(Math.min(y0, y1) - radius), 0, height - 1);
  const maxY = clamp(Math.ceil(Math.max(y0, y1) + radius), 0, height - 1);
  const invSigma2 = 1 / Math.max(1e-6, sigma * sigma * 2);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d2 = distanceToSegmentSquared(x + 0.5, y + 0.5, x0, y0, x1, y1);
      const weight = Math.exp(-d2 * invSigma2);
      field[y * width + x] += amplitude * weight;
    }
  }
}

function generatePlates(width: number, height: number, seed: number, controls: ContinentControls): Plate[] {
  const rng = mulberry32(seed ^ 0x8a5f4d31);
  const baseCount = controls.size === 'isle' ? 3 : controls.size === 'region' ? 4 : controls.size === 'subcontinent' ? 6 : 8;
  const tweak = Math.round((controls.plateCount || 0) * 2);
  const count = clamp(baseCount + tweak, 3, 8);
  const plates: Plate[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    plates.push({
      id: i,
      cx: (0.1 + rng() * 0.8) * width,
      cy: (0.1 + rng() * 0.8) * height,
      vx: Math.cos(angle) * (0.6 + rng() * 0.8),
      vy: Math.sin(angle) * (0.6 + rng() * 0.8),
    });
  }
  return plates;
}

function buildPlateModel(width: number, height: number, plates: Plate[]): PlateModel {
  const plateIds = new Int16Array(width * height);
  const aspect = width / Math.max(1, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < plates.length; i += 1) {
        const p = plates[i];
        const dx = ((x + 0.5) - p.cx) / width * aspect;
        const dy = ((y + 0.5) - p.cy) / height;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      plateIds[y * width + x] = best;
    }
  }

  const boundaries: BoundarySegment[] = [];

  const addBoundary = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    a: number,
    b: number,
  ): void => {
    const pa = plates[a];
    const pb = plates[b];
    const tx = x1 - x0;
    const ty = y1 - y0;
    let nx = -ty;
    let ny = tx;
    const cenX = pb.cx - pa.cx;
    const cenY = pb.cy - pa.cy;
    if (nx * cenX + ny * cenY < 0) {
      nx *= -1;
      ny *= -1;
    }
    const nLen = Math.hypot(nx, ny) || 1;
    nx /= nLen;
    ny /= nLen;
    const rvx = pb.vx - pa.vx;
    const rvy = pb.vy - pa.vy;
    const projected = rvx * nx + rvy * ny;
    const type: BoundaryType = projected < -0.08 ? 'convergent' : projected > 0.08 ? 'divergent' : 'transform';
    boundaries.push({
      plateA: a,
      plateB: b,
      x0,
      y0,
      x1,
      y1,
      mx: (x0 + x1) * 0.5,
      my: (y0 + y1) * 0.5,
      nx,
      ny,
      compression: Math.abs(projected),
      type,
    });
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const current = plateIds[i];
      if (x + 1 < width) {
        const right = plateIds[i + 1];
        if (right !== current) {
          addBoundary(x + 0.5, y, x + 0.5, y + 1, current, right);
        }
      }
      if (y + 1 < height) {
        const down = plateIds[i + width];
        if (down !== current) {
          addBoundary(x, y + 0.5, x + 1, y + 0.5, current, down);
        }
      }
    }
  }

  return { plates, plateIds, boundaries };
}

function principalDirection(points: Array<{ x: number; y: number }>): { dirX: number; dirY: number } {
  if (points.length < 2) {
    return { dirX: 1, dirY: 0 };
  }
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }

  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  return { dirX: Math.cos(theta), dirY: Math.sin(theta) };
}

function smoothPolyline(points: Array<{ x: number; y: number }>, passes: number): Array<{ x: number; y: number }> {
  let out = points.map((p) => ({ ...p }));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = out.map((p) => ({ ...p }));
    for (let i = 1; i < out.length - 1; i += 1) {
      next[i].x = (out[i - 1].x + out[i].x * 2 + out[i + 1].x) * 0.25;
      next[i].y = (out[i - 1].y + out[i].y * 2 + out[i + 1].y) * 0.25;
    }
    out = next;
  }
  return out;
}

function buildConvergentBelts(
  width: number,
  height: number,
  boundaries: BoundarySegment[],
  reliefNorm: number,
  seed: number,
): { belts: ConvergentBelt[]; divergent: BoundarySegment[] } {
  const grouped = new Map<string, BoundarySegment[]>();
  const divergent: BoundarySegment[] = [];
  for (const segment of boundaries) {
    if (segment.type === 'divergent') {
      divergent.push(segment);
    }
    if (segment.type !== 'convergent') {
      continue;
    }
    const a = Math.min(segment.plateA, segment.plateB);
    const b = Math.max(segment.plateA, segment.plateB);
    const key = `${a}:${b}`;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(segment);
    } else {
      grouped.set(key, [segment]);
    }
  }

  const belts: ConvergentBelt[] = [];
  let beltId = 0;

  for (const [pairKey, segments] of grouped) {
    if (segments.length < 18) {
      continue;
    }
    const points = segments.map((s) => ({ x: s.mx, y: s.my }));
    const dir = principalDirection(points);
    const sorted = [...points].sort((a, b) => (a.x * dir.dirX + a.y * dir.dirY) - (b.x * dir.dirX + b.y * dir.dirY));

    const sampled: Array<{ x: number; y: number }> = [];
    const step = clamp(Math.floor(sorted.length / 72), 1, 8);
    for (let i = 0; i < sorted.length; i += step) {
      const p = sorted[i];
      if (sampled.length === 0) {
        sampled.push({ ...p });
        continue;
      }
      const last = sampled[sampled.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1.1) {
        sampled.push({ ...p });
      }
    }
    if (sampled.length < 4) {
      continue;
    }

    const ordered: Array<{ x: number; y: number }> = [sampled[0]];
    const remaining = sampled.slice(1);
    while (remaining.length > 0) {
      const tail = ordered[ordered.length - 1];
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i += 1) {
        const p = remaining[i];
        const d = (p.x - tail.x) * (p.x - tail.x) + (p.y - tail.y) * (p.y - tail.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      ordered.push(remaining[best]);
      remaining.splice(best, 1);
    }

    const smooth = smoothPolyline(ordered, 2);
    const widthCells = clamp(
      Math.min(width, height) * (0.05 + reliefNorm * 0.1),
      Math.min(width, height) * 0.05,
      Math.min(width, height) * 0.15,
    );
    let strengthSum = 0;
    for (const s of segments) {
      strengthSum += s.compression;
    }

    belts.push({
      id: beltId,
      pairKey,
      points: smooth,
      dirX: dir.dirX,
      dirY: dir.dirY,
      width: widthCells,
      strength: strengthSum / Math.max(1, segments.length),
    });
    beltId += 1;
  }

  if (belts.length === 0) {
    const rng = mulberry32(seed ^ 0x7142a91f);
    const y = lerp(height * 0.2, height * 0.8, rng());
    belts.push({
      id: 0,
      pairKey: 'fallback',
      points: smoothPolyline([
        { x: width * 0.12, y },
        { x: width * 0.35, y: y + lerp(-height * 0.08, height * 0.08, rng()) },
        { x: width * 0.62, y: y + lerp(-height * 0.08, height * 0.08, rng()) },
        { x: width * 0.88, y: y + lerp(-height * 0.08, height * 0.08, rng()) },
      ], 1),
      dirX: 1,
      dirY: 0,
      width: Math.min(width, height) * (0.08 + reliefNorm * 0.06),
      strength: 1,
    });
  }

  return { belts, divergent };
}

function addNode(nodes: RidgeNode[], x: number, y: number, width: number, height: number): number {
  nodes.push({ x: clamp(x, 1, width - 2), y: clamp(y, 1, height - 2) });
  return nodes.length - 1;
}

function buildRidgeGraph(
  width: number,
  height: number,
  belts: ConvergentBelt[],
  seed: number,
  reliefNorm: number,
  peakNorm: number,
): RidgeGraph {
  const nodes: RidgeNode[] = [];
  const degree: number[] = [];
  const primaryEdges: RidgeEdge[] = [];
  const secondaryEdges: RidgeEdge[] = [];
  const tertiaryEdges: RidgeEdge[] = [];

  const pushNode = (x: number, y: number): number => {
    const id = addNode(nodes, x, y, width, height);
    degree[id] = degree[id] ?? 0;
    return id;
  };

  const linkDegree = (a: number, b: number): void => {
    degree[a] = (degree[a] ?? 0) + 1;
    degree[b] = (degree[b] ?? 0) + 1;
  };

  for (const belt of belts) {
    const beltNodeIds: number[] = [];
    let bendAcc = 0;
    for (let i = 0; i < belt.points.length; i += 1) {
      const p = belt.points[i];
      bendAcc += (valueNoise(seed ^ (belt.id * 977 + 37), i * 0.22, belt.id * 0.7) - 0.5) * 0.12;
      bendAcc *= 0.82;
      const jitter = (valueNoise(seed ^ (belt.id * 977 + 71), i * 0.31, belt.id * 0.41) - 0.5) * belt.width * 0.08;
      const curve = Math.sin((i / Math.max(1, belt.points.length - 1)) * Math.PI * 2 + bendAcc) * belt.width * 0.06;
      const x = p.x - belt.dirY * (jitter + curve);
      const y = p.y + belt.dirX * (jitter + curve);
      beltNodeIds.push(pushNode(x, y));
    }

    const primaryAmplitude = (0.48 + reliefNorm * 0.52 + peakNorm * 0.4) * (0.8 + belt.strength * 0.6);
    for (let i = 0; i < beltNodeIds.length - 1; i += 1) {
      primaryEdges.push({
        a: beltNodeIds[i],
        b: beltNodeIds[i + 1],
        level: 0,
        width: belt.width * 0.56,
        amplitude: primaryAmplitude,
      });
      linkDegree(beltNodeIds[i], beltNodeIds[i + 1]);
    }

    const stride = clamp(Math.floor(beltNodeIds.length / 10), 2, 6);
    for (let i = 2; i < beltNodeIds.length - 2; i += stride) {
      const r = valueNoise(seed ^ (belt.id * 211 + i * 17), i * 0.19, belt.id * 0.37);
      if (r < 0.35) {
        continue;
      }
      if ((degree[beltNodeIds[i]] ?? 0) > 3) {
        continue;
      }
      const prev = nodes[beltNodeIds[i - 1]];
      const cur = nodes[beltNodeIds[i]];
      const next = nodes[beltNodeIds[i + 1]];
      const tx0 = next.x - prev.x;
      const ty0 = next.y - prev.y;
      const tLen = Math.hypot(tx0, ty0) || 1;
      const tx = tx0 / tLen;
      const ty = ty0 / tLen;

      const sign = valueNoise(seed ^ (belt.id * 431 + i * 37), i * 0.43, 0.71) < 0.5 ? -1 : 1;
      const baseAngle = (42 + valueNoise(seed ^ (belt.id * 991 + i * 13), i * 0.31, 0.43) * 20) * (Math.PI / 180) * sign;
      const cosA = Math.cos(baseAngle);
      const sinA = Math.sin(baseAngle);
      let dx = tx * cosA - ty * sinA;
      let dy = tx * sinA + ty * cosA;
      const dLen = Math.hypot(dx, dy) || 1;
      dx /= dLen;
      dy /= dLen;

      const branchSegments = clamp(2 + Math.floor(valueNoise(seed ^ (i * 311 + belt.id * 19), i * 0.13, 0.29) * 3), 2, 4);
      const stepLength = belt.width * 0.34;
      let parentId = beltNodeIds[i];
      let lastSecondaryNode = -1;

      for (let seg = 0; seg < branchSegments; seg += 1) {
        const bend = (valueNoise(seed ^ (seg * 571 + i * 43), seg * 0.33, i * 0.11) - 0.5) * 0.18;
        const bcos = Math.cos(bend);
        const bsin = Math.sin(bend);
        const ndx = dx * bcos - dy * bsin;
        const ndy = dx * bsin + dy * bcos;
        dx = ndx;
        dy = ndy;

        const parent = nodes[parentId];
        const childId = pushNode(parent.x + dx * stepLength, parent.y + dy * stepLength);
        secondaryEdges.push({
          a: parentId,
          b: childId,
          level: 1,
          width: belt.width * 0.34,
          amplitude: primaryAmplitude * 0.54 * (1 - seg * 0.12),
        });
        linkDegree(parentId, childId);
        parentId = childId;
        lastSecondaryNode = childId;
      }

      if (lastSecondaryNode >= 0 && valueNoise(seed ^ (belt.id * 131 + i * 97), i * 0.27, 0.91) > 0.72) {
        const mirrorSign = -sign;
        const mirrorAngle = (28 + valueNoise(seed ^ (belt.id * 719 + i * 29), i * 0.09, 0.77) * 18) * (Math.PI / 180) * mirrorSign;
        const cA = Math.cos(mirrorAngle);
        const sA = Math.sin(mirrorAngle);
        const mdx0 = tx * cA - ty * sA;
        const mdy0 = tx * sA + ty * cA;
        const parent = nodes[beltNodeIds[i]];
        const mChild = pushNode(parent.x + mdx0 * stepLength * 0.9, parent.y + mdy0 * stepLength * 0.9);
        secondaryEdges.push({
          a: beltNodeIds[i],
          b: mChild,
          level: 1,
          width: belt.width * 0.3,
          amplitude: primaryAmplitude * 0.38,
        });
        linkDegree(beltNodeIds[i], mChild);
      }

      if (lastSecondaryNode >= 0 && valueNoise(seed ^ (i * 887 + belt.id * 29), i * 0.17, 0.61) > 0.45) {
        const tertiarySegments = 2;
        const step = belt.width * 0.22;
        let parent = lastSecondaryNode;
        let tx1 = -dy;
        let ty1 = dx;
        const sign2 = valueNoise(seed ^ (i * 1919 + belt.id * 7), i * 0.23, 0.17) < 0.5 ? -1 : 1;
        tx1 *= sign2;
        ty1 *= sign2;
        for (let t = 0; t < tertiarySegments; t += 1) {
          const p = nodes[parent];
          const child = pushNode(p.x + tx1 * step, p.y + ty1 * step);
          tertiaryEdges.push({
            a: parent,
            b: child,
            level: 2,
            width: belt.width * 0.2,
            amplitude: primaryAmplitude * 0.28 * (1 - t * 0.18),
          });
          linkDegree(parent, child);
          parent = child;
        }
      }
    }
  }

  return { nodes, primaryEdges, secondaryEdges, tertiaryEdges };
}

function buildBasinGraph(width: number, height: number, ridge: RidgeGraph, seed: number): BasinGraph {
  const nodes: RidgeNode[] = [];
  const trunkEdges: ValleyEdge[] = [];
  const tributaryEdges: ValleyEdge[] = [];

  const add = (x: number, y: number): number => {
    nodes.push({ x: clamp(x, 1, width - 2), y: clamp(y, 1, height - 2) });
    return nodes.length - 1;
  };

  const trunkNodeIds: number[] = [];

  for (let i = 0; i < ridge.primaryEdges.length; i += 1) {
    const edge = ridge.primaryEdges[i];
    const a = ridge.nodes[edge.a];
    const b = ridge.nodes[edge.b];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const nx = -ty / tLen;
    const ny = tx / tLen;
    const side = valueNoise(seed ^ (i * 151 + 17), i * 0.17, 0.41) < 0.5 ? -1 : 1;
    const offset = edge.width * 0.46;

    const va = add(a.x + nx * offset * side, a.y + ny * offset * side);
    const vb = add(b.x + nx * offset * side, b.y + ny * offset * side);
    trunkNodeIds.push(va, vb);
    trunkEdges.push({
      a: va,
      b: vb,
      level: 0,
      width: edge.width * 0.62,
      depth: edge.amplitude * 0.64,
    });

    if (i % 9 === 0) {
      const mid = nodes[vb];
      const out = nearestEdgePoint(mid.x, mid.y, width, height);
      const bend = add(lerp(mid.x, out.x, 0.55), lerp(mid.y, out.y, 0.55));
      const outlet = add(out.x, out.y);
      trunkEdges.push({
        a: vb,
        b: bend,
        level: 0,
        width: edge.width * 0.68,
        depth: edge.amplitude * 0.58,
      });
      trunkEdges.push({
        a: bend,
        b: outlet,
        level: 0,
        width: edge.width * 0.72,
        depth: edge.amplitude * 0.5,
      });
      trunkNodeIds.push(bend, outlet);
    }
  }

  for (let i = 0; i + 3 < trunkNodeIds.length; i += 3) {
    const a = trunkNodeIds[i];
    const b = trunkNodeIds[i + 3];
    const pa = nodes[a];
    const pb = nodes[b];
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (d < Math.min(width, height) * 0.18) {
      trunkEdges.push({
        a,
        b,
        level: 0,
        width: Math.min(width, height) * 0.04,
        depth: 0.36,
      });
    }
  }

  if (trunkNodeIds.length > 0) {
    for (let i = 0; i < ridge.secondaryEdges.length; i += 2) {
      const edge = ridge.secondaryEdges[i];
      const a = ridge.nodes[edge.a];
      const b = ridge.nodes[edge.b];
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;

      let nearest = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (let k = 0; k < trunkNodeIds.length; k += 1) {
        const nid = trunkNodeIds[k];
        const n = nodes[nid];
        const d = (n.x - mx) * (n.x - mx) + (n.y - my) * (n.y - my);
        if (d < bestD) {
          bestD = d;
          nearest = nid;
        }
      }
      if (nearest < 0) {
        continue;
      }
      const source = add(mx, my);
      const bend = add(lerp(mx, nodes[nearest].x, 0.55), lerp(my, nodes[nearest].y, 0.55));
      tributaryEdges.push({
        a: source,
        b: bend,
        level: 1,
        width: edge.width * 0.88,
        depth: edge.amplitude * 0.35,
      });
      tributaryEdges.push({
        a: bend,
        b: nearest,
        level: 1,
        width: edge.width * 0.74,
        depth: edge.amplitude * 0.31,
      });
    }
  }

  return { nodes, trunkEdges, tributaryEdges };
}

function rasterizeStructuralDem(
  width: number,
  height: number,
  seed: number,
  reliefNorm: number,
  fragmentationNorm: number,
  landFractionNorm: number,
  belts: ConvergentBelt[],
  divergent: BoundarySegment[],
  ridge: RidgeGraph,
  basins: BasinGraph,
): { elevation: Float32Array; ridgeField: Float32Array } {
  const elevation = new Float32Array(width * height);
  const ridgeField = new Float32Array(width * height);
  const aspect = width / Math.max(1, height);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const cx = (nx - 0.5) * aspect;
      const cy = ny - 0.5;
      const radius = Math.hypot(cx, cy);
      const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny);
      const continentMask = 1 - smoothstep((radius - (0.36 + landFractionNorm * 0.24)) / 0.27);
      const edgeOcean = smoothstep((edgeDist - 0.01) / (0.13 + landFractionNorm * 0.06));
      const baseMacro = (fbm(seed ^ 0x2f9d31a5, nx * 1.4, ny * 1.4, 3, 0.57, 2.0) - 0.5) * 0.08;
      const baseRegional = (fbm(seed ^ 0x9c7d52ab, nx * 3.1, ny * 3.1, 2, 0.56, 2.1) - 0.5) * 0.05;
      const base = -0.6 + continentMask * (0.82 + landFractionNorm * 0.54) * edgeOcean + baseMacro + baseRegional;
      elevation[y * width + x] = base;
    }
  }

  for (const belt of belts) {
    const upliftAmp = (0.16 + reliefNorm * 0.38) * (0.72 + belt.strength * 0.85);
    const sigma = belt.width * 0.52;
    for (let i = 0; i < belt.points.length - 1; i += 1) {
      const a = belt.points[i];
      const b = belt.points[i + 1];
      applySegmentGaussian(elevation, width, height, a.x, a.y, b.x, b.y, upliftAmp, sigma);
    }
  }

  const applyRidgeEdge = (edge: RidgeEdge, levelFactor: number): void => {
    const a = ridge.nodes[edge.a];
    const b = ridge.nodes[edge.b];
    const amplitude = edge.amplitude * levelFactor;
    const sigma = Math.max(1.1, edge.width * (edge.level === 0 ? 0.18 : edge.level === 1 ? 0.15 : 0.12));
    applySegmentGaussian(elevation, width, height, a.x, a.y, b.x, b.y, amplitude, sigma);
    applySegmentGaussian(ridgeField, width, height, a.x, a.y, b.x, b.y, amplitude, sigma * 1.05);
  };

  for (const edge of ridge.primaryEdges) {
    applyRidgeEdge(edge, 0.74);
  }
  for (const edge of ridge.secondaryEdges) {
    applyRidgeEdge(edge, 0.5);
  }
  for (const edge of ridge.tertiaryEdges) {
    applyRidgeEdge(edge, 0.38);
  }

  const applyValleyEdge = (edge: ValleyEdge, factor: number): void => {
    const a = basins.nodes[edge.a];
    const b = basins.nodes[edge.b];
    const sigma = Math.max(1.2, edge.width * (edge.level === 0 ? 0.23 : 0.18));
    const amplitude = edge.depth * factor;
    applySegmentGaussian(elevation, width, height, a.x, a.y, b.x, b.y, -amplitude, sigma);
  };

  for (const edge of basins.trunkEdges) {
    applyValleyEdge(edge, 0.58 + reliefNorm * 0.42);
  }
  for (const edge of basins.tributaryEdges) {
    applyValleyEdge(edge, 0.33 + fragmentationNorm * 0.14);
  }

  const stride = clamp(Math.floor(divergent.length / 260), 1, 12);
  for (let i = 0; i < divergent.length; i += stride) {
    const d = divergent[i];
    const sigma = Math.min(width, height) * 0.018;
    const amp = -(0.015 + d.compression * 0.05);
    applySegmentGaussian(elevation, width, height, d.x0, d.y0, d.x1, d.y1, amp, sigma);
  }

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const index = y * width + x;
      const fine = (fbm(seed ^ 0x5af31b6d, nx * 8.2, ny * 8.2, 2, 0.55, 2.2) - 0.5) * 0.03;
      elevation[index] += fine;
    }
  }

  let ridgeMax = 1e-6;
  for (let i = 0; i < ridgeField.length; i += 1) {
    ridgeMax = Math.max(ridgeMax, ridgeField[i]);
  }
  for (let i = 0; i < ridgeField.length; i += 1) {
    ridgeField[i] = clamp01(ridgeField[i] / ridgeMax);
  }

  return { elevation, ridgeField };
}

function computeFlowAccumulation(width: number, height: number, elevation: Float32Array): {
  downstream: Int32Array;
  accumulation: Float32Array;
  flowNorm: Float32Array;
} {
  const total = width * height;
  const downstream = new Int32Array(total);
  downstream.fill(-1);
  const accumulation = new Float32Array(total);
  const flowNorm = new Float32Array(total);

  for (let i = 0; i < total; i += 1) {
    accumulation[i] = 1;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < total; i += 1) {
    min = Math.min(min, elevation[i]);
    max = Math.max(max, elevation[i]);
  }
  const span = Math.max(1e-6, max - min);
  const bins = 1024;
  const buckets: number[][] = Array.from({ length: bins }, () => []);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let best = -1;
      let bestElevation = elevation[index];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
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
      }
      downstream[index] = best;
      const q = clamp(Math.floor(((elevation[index] - min) / span) * (bins - 1)), 0, bins - 1);
      buckets[q].push(index);
    }
  }

  for (let b = bins - 1; b >= 0; b -= 1) {
    const bucket = buckets[b];
    for (let i = 0; i < bucket.length; i += 1) {
      const index = bucket[i];
      const out = downstream[index];
      if (out >= 0) {
        accumulation[out] += accumulation[index];
      }
    }
  }

  let maxAccum = 1;
  for (let i = 0; i < total; i += 1) {
    maxAccum = Math.max(maxAccum, accumulation[i]);
  }
  const logDenom = Math.log1p(maxAccum);
  for (let i = 0; i < total; i += 1) {
    flowNorm[i] = clamp01(Math.log1p(accumulation[i]) / Math.max(1e-6, logDenom));
  }

  return { downstream, accumulation, flowNorm };
}

function applyStructuralErosion(
  width: number,
  height: number,
  elevation: Float32Array,
  reliefNorm: number,
): Float32Array {
  const iterations = clamp(5 + Math.round(reliefNorm * 4), 5, 10);
  let flowNorm = new Float32Array(width * height);

  for (let pass = 0; pass < iterations; pass += 1) {
    const flow = computeFlowAccumulation(width, height, elevation);
    flowNorm = flow.flowNorm;

    const next = elevation.slice();
    const k = 0.0036 + reliefNorm * 0.0044;
    const m = 0.46;
    const n = 1.08;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const out = flow.downstream[index];
        if (out < 0) {
          continue;
        }
        const drop = Math.max(0, elevation[index] - elevation[out]);
        if (drop <= 1e-6) {
          continue;
        }
        const area = Math.max(1, flow.accumulation[index]);
        const incision = k * Math.pow(area, m) * Math.pow(drop, n);
        next[index] -= clamp(incision, 0, 0.055);
      }
    }

    elevation.set(next);
  }

  return flowNorm;
}

export function seaLevelForLandFraction(elevation: Float32Array, landFractionNorm: number): number {
  const targetLand = clamp(0.12 + landFractionNorm * 0.7, 0.08, 0.86);
  return quantizedThreshold(elevation, targetLand);
}

export function smoothCoastFromElevation(
  width: number,
  height: number,
  elevation: Float32Array,
  seaLevel: number,
  smoothing: number,
): void {
  const smooth = (smoothing - 1) / 9;
  const passes = clamp(Math.round(1 + smooth * 3), 1, 4);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < elevation.length; i += 1) {
    min = Math.min(min, elevation[i]);
    max = Math.max(max, elevation[i]);
  }
  const span = Math.max(1e-6, max - min);
  const band = lerp(span * 0.03, span * 0.11, smooth);

  let current = elevation.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const distance = Math.abs(current[index] - seaLevel);
        if (distance > band) {
          continue;
        }
        const avg = (
          current[index - 1] +
          current[index + 1] +
          current[index - width] +
          current[index + width] +
          current[index - width - 1] +
          current[index - width + 1] +
          current[index + width - 1] +
          current[index + width + 1]
        ) / 8;
        const t = 1 - distance / Math.max(1e-6, band);
        const strength = smoothstep(t) * (0.06 + smooth * 0.22);
        next[index] = lerp(current[index], avg, strength);
      }
    }
    current = next;
  }

  elevation.set(current);
}

export function generateStructuralTerrain(
  width: number,
  height: number,
  seed: number,
  controls: ContinentControls,
): StructuralTerrainResult {
  const reliefNorm = (controls.relief - 1) / 9;
  const fragNorm = (controls.fragmentation - 1) / 9;
  const peakNorm = (controls.mountainPeakiness - 1) / 9;
  const landFractionNorm = (controls.landFraction - 1) / 9;

  const plates = generatePlates(width, height, seed, controls);
  const plateModel = buildPlateModel(width, height, plates);
  const beltsModel = buildConvergentBelts(width, height, plateModel.boundaries, reliefNorm, seed);
  const ridgeGraph = buildRidgeGraph(width, height, beltsModel.belts, seed, reliefNorm, peakNorm);
  const basinGraph = buildBasinGraph(width, height, ridgeGraph, seed);

  const raster = rasterizeStructuralDem(
    width,
    height,
    seed,
    reliefNorm,
    fragNorm,
    landFractionNorm,
    beltsModel.belts,
    beltsModel.divergent,
    ridgeGraph,
    basinGraph,
  );

  const flow = applyStructuralErosion(width, height, raster.elevation, reliefNorm);

  return {
    elevation: raster.elevation,
    ridge: raster.ridgeField,
    flow,
  };
}

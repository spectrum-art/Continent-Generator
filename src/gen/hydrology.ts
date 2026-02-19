export type HydrologyPolicy = 'drain-mostly' | 'allow-lakes';

export type FlowFields = {
  downstream: Int32Array;
  accumulation: Float32Array;
  flowNorm: Float32Array;
  sinkMask: Uint8Array;
  sinkCount: number;
};

export type HydrologyConditionResult = {
  elevation: Float32Array;
  sinkCount: number;
  sinkMask: Uint8Array;
};

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

class MinHeap {
  private readonly values: number[] = [];

  public get size(): number {
    return this.values.length;
  }

  push(cell: number, elevation: number): void {
    const packed = [cell, elevation] as [number, number];
    this.values.push(packed[0], packed[1]);
    this.siftUp(this.values.length / 2 - 1);
  }

  pop(): [number, number] | null {
    if (this.values.length === 0) {
      return null;
    }
    const lastCell = this.values[this.values.length - 2];
    const lastElevation = this.values[this.values.length - 1];
    const outCell = this.values[0];
    const outElevation = this.values[1];
    this.values.pop();
    this.values.pop();
    if (this.values.length > 0) {
      this.values[0] = lastCell;
      this.values[1] = lastElevation;
      this.siftDown(0);
    }
    return [outCell, outElevation];
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      const ie = this.values[i * 2 + 1];
      const pe = this.values[parent * 2 + 1];
      if (ie >= pe) {
        break;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const count = this.values.length / 2;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;

      if (left < count && this.values[left * 2 + 1] < this.values[smallest * 2 + 1]) {
        smallest = left;
      }
      if (right < count && this.values[right * 2 + 1] < this.values[smallest * 2 + 1]) {
        smallest = right;
      }
      if (smallest === i) {
        break;
      }
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const ai = a * 2;
    const bi = b * 2;
    const ac = this.values[ai];
    const ae = this.values[ai + 1];
    this.values[ai] = this.values[bi];
    this.values[ai + 1] = this.values[bi + 1];
    this.values[bi] = ac;
    this.values[bi + 1] = ae;
  }
}

function defaultOutletMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    mask[x] = 1;
    mask[(height - 1) * width + x] = 1;
  }
  for (let y = 0; y < height; y += 1) {
    mask[y * width] = 1;
    mask[y * width + width - 1] = 1;
  }
  return mask;
}

function computeSinkMask(
  width: number,
  height: number,
  elevation: Float32Array,
  outletMask: Uint8Array,
): { sinkMask: Uint8Array; sinkCount: number } {
  const sinkMask = new Uint8Array(width * height);
  let sinkCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (outletMask[index] === 1) {
        continue;
      }
      const current = elevation[index];
      let hasLower = false;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        if (elevation[ni] < current - 1e-8) {
          hasLower = true;
          break;
        }
      }
      if (!hasLower) {
        sinkMask[index] = 1;
        sinkCount += 1;
      }
    }
  }

  return { sinkMask, sinkCount };
}

export function conditionHydrology(
  width: number,
  height: number,
  elevation: Float32Array,
  policy: HydrologyPolicy,
  outletMask?: Uint8Array,
): HydrologyConditionResult {
  const total = width * height;
  const conditioned = elevation.slice();
  const visited = new Uint8Array(total);
  const mask = outletMask ?? defaultOutletMask(width, height);
  const heap = new MinHeap();

  for (let i = 0; i < total; i += 1) {
    if (mask[i] === 1) {
      visited[i] = 1;
      heap.push(i, conditioned[i]);
    }
  }

  while (heap.size > 0) {
    const popped = heap.pop();
    if (!popped) {
      break;
    }
    const [cell, cellElevation] = popped;
    const x = cell % width;
    const y = Math.floor(cell / width);

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const ni = ny * width + nx;
      if (visited[ni] === 1) {
        continue;
      }
      visited[ni] = 1;
      let nextElevation = conditioned[ni];
      if (policy === 'drain-mostly' && nextElevation <= cellElevation) {
        nextElevation = cellElevation + 1e-5;
      }
      conditioned[ni] = nextElevation;
      heap.push(ni, nextElevation);
    }
  }

  const sinks = computeSinkMask(width, height, conditioned, mask);
  return {
    elevation: conditioned,
    sinkCount: sinks.sinkCount,
    sinkMask: sinks.sinkMask,
  };
}

export function computeFlowFields(
  width: number,
  height: number,
  elevation: Float32Array,
  outletMask?: Uint8Array,
): FlowFields {
  const total = width * height;
  const downstream = new Int32Array(total);
  const accumulation = new Float32Array(total);
  const flowNorm = new Float32Array(total);
  const mask = outletMask ?? defaultOutletMask(width, height);

  for (let i = 0; i < total; i += 1) {
    downstream[i] = -1;
    accumulation[i] = 1;
  }

  const bins = 4096;
  const buckets: number[][] = Array.from({ length: bins }, () => []);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < total; i += 1) {
    min = Math.min(min, elevation[i]);
    max = Math.max(max, elevation[i]);
  }
  const span = Math.max(1e-6, max - min);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = elevation[index];
      if (mask[index] === 1) {
        const b = clamp(Math.floor(((current - min) / span) * (bins - 1)), 0, bins - 1);
        buckets[b].push(index);
        continue;
      }

      let best = -1;
      let bestElevation = Number.POSITIVE_INFINITY;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = ny * width + nx;
        const neighbor = elevation[ni];
        if (neighbor < bestElevation - 1e-8 || (Math.abs(neighbor - bestElevation) <= 1e-8 && ni < best)) {
          bestElevation = neighbor;
          best = ni;
        }
      }
      if (best >= 0 && bestElevation <= current - 1e-8) {
        downstream[index] = best;
      } else if (best >= 0 && mask[best] === 1) {
        downstream[index] = best;
      } else {
        downstream[index] = best;
      }

      const b = clamp(Math.floor(((current - min) / span) * (bins - 1)), 0, bins - 1);
      buckets[b].push(index);
    }
  }

  for (let b = bins - 1; b >= 0; b -= 1) {
    const bucket = buckets[b];
    for (let i = 0; i < bucket.length; i += 1) {
      const index = bucket[i];
      const out = downstream[index];
      if (out >= 0 && out !== index) {
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
    flowNorm[i] = Math.log1p(accumulation[i]) / Math.max(1e-6, logDenom);
  }

  const sinks = computeSinkMask(width, height, elevation, mask);
  return {
    downstream,
    accumulation,
    flowNorm,
    sinkMask: sinks.sinkMask,
    sinkCount: sinks.sinkCount,
  };
}

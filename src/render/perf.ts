export const PERF_BUCKETS = [
  'input',
  'camera',
  'visibleRange',
  'rangeDiff',
  'chunkGenerate',
  'chunkBuild',
  'renderSubmit',
  'minimap',
  'overlay',
] as const;

export type PerfBucket = (typeof PERF_BUCKETS)[number];

type CounterTotals = {
  chunkRequests: number;
  chunkCacheHits: number;
  chunksGenerated: number;
  chunksRebuilt: number;
  tilesProcessed: number;
};

type CounterSample = CounterTotals & {
  secondStartMs: number;
  secondEndMs: number;
};

type SceneCounts = {
  loadedChunks: number;
  displayObjects: number;
  graphicsObjects: number;
  spriteObjects: number;
  renderTextureObjects: number;
};

type FrameStats = {
  fps1s: number;
  fps5s: number;
  avgMs: number;
  p95Ms: number;
  slowFrames: number;
  slowFrameRate: number;
  sampleCount: number;
};

type BucketSnapshot = Record<
  PerfBucket,
  {
    avgMs: number;
    p95Ms: number;
  }
>;

type CounterSnapshot = {
  loadedChunks: number;
  generatedPerSecond: number;
  rebuiltPerSecond: number;
  tilesProcessedPerSecond: number;
  chunkRequestsPerSecond: number;
  cacheHitRate: number;
  rollingGeneratedPerSecond: number;
  rollingRebuiltPerSecond: number;
  rollingTilesProcessedPerSecond: number;
  rollingChunkRequestsPerSecond: number;
  rollingCacheHitRate: number;
  displayObjects: number;
  graphicsObjects: number;
  spriteObjects: number;
  renderTextureObjects: number;
};

export type PerfSnapshot = {
  label: string;
  capturedAtMs: number;
  frame: FrameStats;
  buckets: BucketSnapshot;
  counters: CounterSnapshot;
  totals: CounterTotals;
};

const FRAME_WINDOW = 300;
const COUNTER_SAMPLE_WINDOW = 12;
const LOG_WINDOW = 32;

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function p95(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * 0.95);
  return sorted[index];
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createBucketRecord(initial: number): Record<PerfBucket, number> {
  return {
    input: initial,
    camera: initial,
    visibleRange: initial,
    rangeDiff: initial,
    chunkGenerate: initial,
    chunkBuild: initial,
    renderSubmit: initial,
    minimap: initial,
    overlay: initial,
  };
}

function createCounterTotals(): CounterTotals {
  return {
    chunkRequests: 0,
    chunkCacheHits: 0,
    chunksGenerated: 0,
    chunksRebuilt: 0,
    tilesProcessed: 0,
  };
}

export class PerfProfiler {
  private frameStartMs = 0;
  private frameDurations: number[] = [];
  private frameEndTimes: number[] = [];
  private frameBucketTotals = createBucketRecord(0);
  private bucketSeries: Record<PerfBucket, number[]> = {
    input: [],
    camera: [],
    visibleRange: [],
    rangeDiff: [],
    chunkGenerate: [],
    chunkBuild: [],
    renderSubmit: [],
    minimap: [],
    overlay: [],
  };
  private totals: CounterTotals = createCounterTotals();
  private countersThisSecond: CounterTotals = createCounterTotals();
  private secondSamples: CounterSample[] = [];
  private secondStartMs = 0;
  private sceneCounts: SceneCounts = {
    loadedChunks: 0,
    displayObjects: 0,
    graphicsObjects: 0,
    spriteObjects: 0,
    renderTextureObjects: 0,
  };
  private logs: PerfSnapshot[] = [];

  beginFrame(nowMs: number): void {
    if (this.secondStartMs <= 0) {
      this.secondStartMs = nowMs;
    }
    this.frameStartMs = nowMs;
    this.frameBucketTotals = createBucketRecord(0);
  }

  mark(bucket: PerfBucket, durationMs: number): void {
    this.frameBucketTotals[bucket] += Math.max(0, durationMs);
  }

  measure<T>(bucket: PerfBucket, task: () => T): T {
    const start = performance.now();
    const result = task();
    this.mark(bucket, performance.now() - start);
    return result;
  }

  endFrame(nowMs: number): void {
    if (this.frameStartMs <= 0) {
      return;
    }
    const frameDuration = Math.max(0, nowMs - this.frameStartMs);
    this.pushBounded(this.frameDurations, frameDuration, FRAME_WINDOW);
    this.pushBounded(this.frameEndTimes, nowMs, FRAME_WINDOW);
    for (const bucket of PERF_BUCKETS) {
      this.pushBounded(this.bucketSeries[bucket], this.frameBucketTotals[bucket], FRAME_WINDOW);
    }
    this.flushSecondCounters(nowMs);
  }

  addChunkRequest(cacheHit: boolean): void {
    this.countersThisSecond.chunkRequests += 1;
    this.totals.chunkRequests += 1;
    if (cacheHit) {
      this.countersThisSecond.chunkCacheHits += 1;
      this.totals.chunkCacheHits += 1;
    }
  }

  addChunkGenerated(tileCount: number): void {
    this.countersThisSecond.chunksGenerated += 1;
    this.countersThisSecond.tilesProcessed += tileCount;
    this.totals.chunksGenerated += 1;
    this.totals.tilesProcessed += tileCount;
  }

  addChunkRebuilt(tileCount: number): void {
    this.countersThisSecond.chunksRebuilt += 1;
    this.countersThisSecond.tilesProcessed += tileCount;
    this.totals.chunksRebuilt += 1;
    this.totals.tilesProcessed += tileCount;
  }

  setSceneCounts(partial: Partial<SceneCounts>): void {
    this.sceneCounts = { ...this.sceneCounts, ...partial };
  }

  getSnapshot(label = 'live'): PerfSnapshot {
    const frame = this.getFrameStats();
    const buckets: BucketSnapshot = {
      input: this.getBucketStats('input'),
      camera: this.getBucketStats('camera'),
      visibleRange: this.getBucketStats('visibleRange'),
      rangeDiff: this.getBucketStats('rangeDiff'),
      chunkGenerate: this.getBucketStats('chunkGenerate'),
      chunkBuild: this.getBucketStats('chunkBuild'),
      renderSubmit: this.getBucketStats('renderSubmit'),
      minimap: this.getBucketStats('minimap'),
      overlay: this.getBucketStats('overlay'),
    };

    const activeSecondDurationMs = Math.max(1, performance.now() - this.secondStartMs);
    const activeSeconds = clampNumber(activeSecondDurationMs / 1000, 0.1, 1);
    const generatedPerSecond = this.countersThisSecond.chunksGenerated / activeSeconds;
    const rebuiltPerSecond = this.countersThisSecond.chunksRebuilt / activeSeconds;
    const tilesProcessedPerSecond = this.countersThisSecond.tilesProcessed / activeSeconds;
    const chunkRequestsPerSecond = this.countersThisSecond.chunkRequests / activeSeconds;

    const rollingSeconds = this.secondSamples.length > 0
      ? this.secondSamples.reduce((sum, sample) => sum + (sample.secondEndMs - sample.secondStartMs), 0) / 1000
      : 0;
    const rollingTotals = this.secondSamples.reduce(
      (acc, sample) => {
        acc.chunkRequests += sample.chunkRequests;
        acc.chunkCacheHits += sample.chunkCacheHits;
        acc.chunksGenerated += sample.chunksGenerated;
        acc.chunksRebuilt += sample.chunksRebuilt;
        acc.tilesProcessed += sample.tilesProcessed;
        return acc;
      },
      createCounterTotals(),
    );
    const safeRollingSeconds = Math.max(rollingSeconds, 1);
    const counters: CounterSnapshot = {
      loadedChunks: this.sceneCounts.loadedChunks,
      generatedPerSecond,
      rebuiltPerSecond,
      tilesProcessedPerSecond,
      chunkRequestsPerSecond,
      cacheHitRate: ratio(this.totals.chunkCacheHits, this.totals.chunkRequests),
      rollingGeneratedPerSecond: rollingTotals.chunksGenerated / safeRollingSeconds,
      rollingRebuiltPerSecond: rollingTotals.chunksRebuilt / safeRollingSeconds,
      rollingTilesProcessedPerSecond: rollingTotals.tilesProcessed / safeRollingSeconds,
      rollingChunkRequestsPerSecond: rollingTotals.chunkRequests / safeRollingSeconds,
      rollingCacheHitRate: ratio(rollingTotals.chunkCacheHits, rollingTotals.chunkRequests),
      displayObjects: this.sceneCounts.displayObjects,
      graphicsObjects: this.sceneCounts.graphicsObjects,
      spriteObjects: this.sceneCounts.spriteObjects,
      renderTextureObjects: this.sceneCounts.renderTextureObjects,
    };
    return {
      label,
      capturedAtMs: performance.now(),
      frame,
      buckets,
      counters,
      totals: { ...this.totals },
    };
  }

  captureSnapshot(label: string): PerfSnapshot {
    const snapshot = this.getSnapshot(label);
    this.pushBounded(this.logs, snapshot, LOG_WINDOW);
    return snapshot;
  }

  getLog(): readonly PerfSnapshot[] {
    return this.logs;
  }

  exportLogJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  clearLog(): void {
    this.logs.length = 0;
  }

  reset(): void {
    this.frameDurations.length = 0;
    this.frameEndTimes.length = 0;
    for (const bucket of PERF_BUCKETS) {
      this.bucketSeries[bucket].length = 0;
    }
    this.logs.length = 0;
    this.totals = createCounterTotals();
    this.countersThisSecond = createCounterTotals();
    this.secondSamples.length = 0;
    this.secondStartMs = performance.now();
  }

  private getBucketStats(bucket: PerfBucket): { avgMs: number; p95Ms: number } {
    const values = this.bucketSeries[bucket];
    return {
      avgMs: average(values),
      p95Ms: p95(values),
    };
  }

  private getFrameStats(): FrameStats {
    const frames = this.frameDurations;
    const slowFrames = frames.filter((ms) => ms > 33).length;
    return {
      fps1s: this.fpsForWindow(1000),
      fps5s: this.fpsForWindow(5000),
      avgMs: average(frames),
      p95Ms: p95(frames),
      slowFrames,
      slowFrameRate: ratio(slowFrames, Math.max(frames.length, 1)),
      sampleCount: frames.length,
    };
  }

  private fpsForWindow(windowMs: number): number {
    let accumulatedMs = 0;
    let frames = 0;
    for (let i = this.frameDurations.length - 1; i >= 0; i -= 1) {
      accumulatedMs += this.frameDurations[i];
      frames += 1;
      if (accumulatedMs >= windowMs) {
        break;
      }
    }
    if (accumulatedMs <= 0 || frames <= 0) {
      return 0;
    }
    return (frames * 1000) / accumulatedMs;
  }

  private flushSecondCounters(nowMs: number): void {
    if (this.secondStartMs <= 0) {
      this.secondStartMs = nowMs;
      return;
    }
    const elapsed = nowMs - this.secondStartMs;
    if (elapsed < 1000) {
      return;
    }
    const sample: CounterSample = {
      ...this.countersThisSecond,
      secondStartMs: this.secondStartMs,
      secondEndMs: nowMs,
    };
    this.pushBounded(this.secondSamples, sample, COUNTER_SAMPLE_WINDOW);
    this.countersThisSecond = createCounterTotals();
    this.secondStartMs = nowMs;
  }

  private pushBounded<T>(values: T[], value: T, max: number): void {
    values.push(value);
    while (values.length > max) {
      values.shift();
    }
  }
}


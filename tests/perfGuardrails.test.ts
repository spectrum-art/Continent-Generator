import { describe, expect, it } from 'vitest';
import { LruCache, getOrCreateCached } from '../src/render/lruCache';
import {
  allowedChunkLoadsForFrame,
  shouldDrawOutlines,
  shouldUseLodMode,
} from '../src/render/perfPolicy';

describe('render perf guardrails', () => {
  it('uses cache entries instead of rebuilding existing chunk payloads', () => {
    const cache = new LruCache<number>(3);
    let builds = 0;

    const first = getOrCreateCached(cache, 'default:0:0', () => {
      builds += 1;
      return 101;
    });
    const second = getOrCreateCached(cache, 'default:0:0', () => {
      builds += 1;
      return 102;
    });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(first.value).toBe(101);
    expect(second.value).toBe(101);
    expect(builds).toBe(1);
  });

  it('enforces chunk load budget per frame', () => {
    expect(allowedChunkLoadsForFrame(0, 1)).toBe(0);
    expect(allowedChunkLoadsForFrame(0.9, 1)).toBe(0);
    expect(allowedChunkLoadsForFrame(1.1, 1)).toBe(1);
    expect(allowedChunkLoadsForFrame(5.9, 1)).toBe(1);
    expect(allowedChunkLoadsForFrame(5.9, 2)).toBe(2);
    expect(allowedChunkLoadsForFrame(5.9, 0)).toBe(0);
  });

  it('selects LOD and outline policies by zoom thresholds', () => {
    expect(shouldUseLodMode(0.6, 0.8)).toBe(true);
    expect(shouldUseLodMode(0.8, 0.8)).toBe(false);
    expect(shouldUseLodMode(1.2, 0.8)).toBe(false);

    expect(shouldDrawOutlines(true, 1.0, 1.35)).toBe(false);
    expect(shouldDrawOutlines(true, 1.35, 1.35)).toBe(true);
    expect(shouldDrawOutlines(false, 2.0, 1.35)).toBe(false);
  });
});

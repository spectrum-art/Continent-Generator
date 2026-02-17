# Performance Diagnosis (Milestone 11)

## Method
- Runtime: `npm run dev -- --host 127.0.0.1 --port 4173`
- Tooling: in-app Perf HUD + Scenario Runner
- Automation: headless Playwright script clicks `Show Perf HUD` and `Run all`, then reads the HUD report.
- Seed/camera start state is deterministic per scenario runner implementation.

## Baseline Scenario Output (Before C* Fixes)
### Scenario 1: idle 10s
- `fps1s=1.2`, `fps5s=0.6`
- `frameP95=867.3ms`
- `slowRate=100.0%`
- `chunksGenerated=16`, `maxLoaded=16`
- bucket p95: `minimap=853.2ms`

### Scenario 2: pan 10s
- `fps1s=1.2`, `fps5s=0.6`
- `frameP95=844.4ms`
- `slowRate=100.0%`
- `chunksGenerated=16`, `maxLoaded=16`
- bucket p95: `minimap=844.2ms`

### Scenario 3: zoomed-out pan 10s
- `fps1s=0.2`, `fps5s=0.2`
- `frameP95=870.1ms`
- `slowRate=100.0%`
- `chunksGenerated=24`, `maxLoaded=24`
- bucket p95: `minimap=836.5ms`

### Scenario 4: stress autopan 15s
- `fps1s=0.1`, `fps5s=0.1`
- `frameP95=6227.6ms`
- `slowRate=100.0%`
- `chunksGenerated=29`, `maxLoaded=16`
- bucket p95: `rangeDiff=5380.8ms`, `chunkGenerate=4447.0ms`, `chunkBuild=933.3ms`, `minimap=839.7ms`

## Differential Diagnosis
Top bottleneck 1 (dominant in idle/pan):
- **Minimap is overwhelmingly expensive**.
- Evidence: minimap p95 around `840-853ms` even in idle/pan scenarios where chunk generation/build are near zero.
- Root cause: minimap sampling calls `getTileAt` per minimap sample cell, repeatedly, during normal frame loop cadence.

Top bottleneck 2 (dominant in stress and boundary-crossing):
- **Synchronous chunk churn/generation spikes**.
- Evidence: stress scenario p95 `rangeDiff=5380.8ms`, `chunkGenerate=4447.0ms`, `chunkBuild=933.3ms`.
- Root cause: missing chunk loads are generated and built immediately in one update pass with no budget cap; unload/load diff also runs synchronously.

Secondary contributor:
- **Chunk build complexity at low zoom** (heavy per-tile shading path) amplifies generation spikes when many chunks are required.

## Chosen Fix Plan (C*)
1. Minimap decoupling/caching:
- update minimap at lower fixed cadence and only when camera/seed changes enough.
- add minimap tile-sample cache keyed by `(seed,q,r)` for the minimap viewport.

2. Chunk streaming budget and hysteresis:
- compute required chunk set each update, but load/build missing chunks through a queue with `MAX_NEW_CHUNKS_PER_FRAME` cap.
- apply unload hysteresis (keep a margin beyond load bounds) to reduce boundary thrash.

3. Chunk data cache:
- keep generated chunk tile arrays in an LRU cache keyed by `(seed,cq,cr,debug,outline/LOD relevant key)` where possible.
- reuse cache for re-entry so generation spikes are reduced.

4. Low-zoom render simplification:
- keep chunk-level representation and avoid expensive per-tile shading path when zoom is low (use base palette or reduced shading).

5. Verify after each C* change with scenario runner and compare against Milestone 11 thresholds.

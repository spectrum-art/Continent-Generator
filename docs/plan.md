# Map Explorer Plan

## Milestone 10: Terrain Coherence, River Hierarchy, and Seam Fixes

- [x] `10A` seam + shore consistency:
- [x] Keep seam-safe global/macro basis for sampled terrain fields.
- [x] Keep chunk-border shoreline consistency checks passing.
- [x] Gate with `npm test` and `npm run build`.

- [x] `10B` river hierarchy + accumulation:
- [x] Keep deterministic downhill/accumulation river model with source pruning.
- [x] Keep hierarchy checks passing (`1024` sample, accumulation `>= 5x` average, long component + short-fragment constraints).
- [x] Gate with `npm test` and `npm run build`.

- [x] `10C` mountain structure + shading:
- [x] Strengthen ridge-like mountain shaping in elevation field.
- [x] Add slope-aware land shading in renderer and mountain structure tests.
- [x] Gate with `npm test` and `npm run build`.

- [x] `10D` terrain-driven biomes:
- [x] Drive forests/grass by moisture + elevation + drainage weighting.
- [x] Keep biome smoothing/anti-speckle checks green.
- [x] Gate with `npm test` and `npm run build`.

- [x] `10E` river visual integration:
- [x] Blend river color toward aquatic and terrain bank tones.
- [x] Keep renderer/test/build stability after style change.
- [x] Gate with `npm test` and `npm run build`.

- [x] `10F` docs update:
- [x] Refresh `docs/spec.md` with Milestone 10 acceptance criteria and constants.
- [x] Update this checklist with completed checkpoints.

## Milestone 11: Performance Differential Diagnosis + Tooling + Fix Plan

- [x] `11A1` perf HUD + profiler timers/counters/export:
- [x] Add frame timing, p95 bucket timings, rolling counters, and clipboard snapshot export.
- [x] Add collapsible HUD surface with live metrics.
- [x] Gate with `npm test` and `npm run build`.

- [x] `11A2` scenario runner + perf report output:
- [x] Add deterministic scenario automation (`idle10`, `pan10`, `zoomPan10`, `stress15`).
- [x] Emit per-scenario acceptance report to HUD and console.
- [x] Gate with `npm test` and `npm run build`.

- [x] `11B1` diagnosis + plan selection:
- [x] Record baseline metrics and top bottlenecks in `docs/perf.md`.
- [x] Document chosen C* optimization path from evidence.

- [x] `11C1` streaming/minimap/cache optimization pass:
- [x] Add queued chunk loading with token budget and per-frame cap.
- [x] Add bounded LRU caches for chunk tiles and minimap colors.
- [x] Tighten minimap cadence and sample density for lower update cost.
- [x] Start scenario measurement only after warmup + queue drain.
- [x] Gate with `npm test` and `npm run build`.

- [x] `11C2` threshold validation:
- [x] Re-run all four scenarios and confirm strict threshold compliance.
- [x] Keep low-zoom chunk-sprite LOD mode active.

- [x] `11D` docs + guardrails:
- [x] Add `tests/perfGuardrails.test.ts` for cache reuse/load budget/LOD policy invariants.
- [x] Update `docs/spec.md` and `docs/perf.md` with final thresholds and tuning constants.

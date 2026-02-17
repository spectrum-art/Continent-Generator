# Map Explorer Spec

## Scope
Static deterministic hex map explorer in TypeScript + Vite + PixiJS with infinite chunk streaming, debug overlay, minimap, and stress/performance observability.

## Non-Goals
- No backend/network APIs
- No runtime AI features
- No platform-specific dependencies

## Milestone 10 Acceptance Criteria
1. Seam and shore consistency:
- elevation/moisture macro seam checks pass.
- chunk-border shore classification checks pass.
- no deterministic chunk-edge shoreline discontinuity in tests.
2. Natural shore width targets:
- ocean shore mean width stays in `1.9..4.0` sampled tiles.
- lake shore mean width stays in `1.0..2.0` sampled tiles.
3. River hierarchy and drainage:
- deterministic river layout per seed.
- accumulation hierarchy check: max sampled river accumulation is at least `5x` sampled average in a `1024x1024` window.
- river coherence checks pass: largest sampled component `>= 80`, short-component ratio `<= 15%`, majority of sampled sources terminate to ocean/lake.
4. Mountain structure and readability:
- at least one continuous mountain/rock ridge component `>= 40` tiles in sample.
- mountain elevations stay meaningfully above river elevations on average.
- slope-aware land shading is enabled in renderer.
5. Terrain-driven biomes:
- forest placement depends on moisture/elevation/drainage weighting.
- biome smoothing reduces speckling and tiny isolated patches (guarded in generator tests).
6. River visual integration:
- river color is blended toward aquatic tones and terrain bank tones (not high-contrast overlay styling).
7. Core behavior remains unchanged:
- deterministic seeded generator and pure `src/gen/*`.
- existing pan/zoom/chunk streaming/minimap/stress systems stay intact.
- `npm test` and `npm run build` are green at checkpoint gates.

## Tuned Constants (Milestone 10)
- `SEA_LEVEL = 0.45`
- `SHORELINE_BAND = 0.052`
- `HYDRO_MACRO_SIZE = 256`
- `HYDRO_MACRO_MARGIN = 128`
- `MIN_LAKE_COMPONENT_TILES = 40`
- `MAX_LAKE_COMPACTNESS = 220`
- `LAKE_TENDRIL_PRUNE_PASSES = 3`
- `RIVER_SOURCE_SPACING = 22`
- `RIVER_SOURCE_RATE = 0.78`
- `RIVER_SOURCE_MARGIN = 176`
- `MAX_RIVER_STEPS = 420`
- `MIN_RIVER_LENGTH = 12`
- `MIN_RIVER_ELEVATION_DROP = 0.02`
- River coverage/coherence guardrails in tests:
- `256x256` coverage target `0.35%..4%`
- `256x256` largest component `>= 80`
- sampled short-fragment ratio `<= 15%`
- sampled sink termination ratio `>= 55%`

## Milestone 11 A1: Perf HUD + Profiler Usage
1. Perf HUD availability:
- Debug overlay includes a `Show Perf HUD` toggle.
- Perf HUD displays rolling frame metrics (`FPS 1s`, `FPS 5s`, `avg ms`, `p95 ms`, slow-frame counts over the frame window).
- Perf HUD displays per-bucket timing (`input`, `camera`, `visibleRange`, `rangeDiff`, `chunkGenerate`, `chunkBuild`, `renderSubmit`, `minimap`, `overlay`) as `avg` and `p95`.
2. Counter visibility:
- HUD exposes chunk/cache counters (chunk requests, cache hit rate, generated/rebuilt chunks per second and rolling values, processed tiles per second and rolling values).
- HUD exposes scene complexity counters (loaded chunks, display object count, graphics object count, sprite count, render texture estimate).
3. Export workflow:
- `Copy perf snapshot` captures a live snapshot and appends it to an internal rolling log buffer.
- Button copies the rolling log buffer JSON to clipboard for external analysis.
- HUD shows copy status feedback.
4. Determinism and behavior:
- Instrumentation does not modify seed/world determinism.
- Existing streaming/camera behavior remains functional while profiling is active.

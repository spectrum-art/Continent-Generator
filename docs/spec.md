# Map Explorer Spec

## Scope
Build a static procedural hex-map explorer in TypeScript + Vite + PixiJS with deterministic generation, chunk streaming, debug overlay, and stress-run visibility.

## Non-Goals
- No backend/network APIs
- No runtime AI features
- No platform-specific dependencies
- No mandatory lake simulation in Milestone 6 (rivers prioritized)

## Milestone 6 Acceptance Criteria
1. `npm run dev` launches full-screen pointy-top hex rendering with pan/zoom and streaming.
2. Generator in `src/gen/` remains pure/deterministic and includes river tiles.
3. River generation is deterministic and bounded:
   - source spacing/rate/elevation thresholds are constants
   - traces terminate at/before `MAX_RIVER_STEPS`
4. River coverage in a `256x256` sample around origin for seed `default` is in the strong target band (`0.5%..4%`).
5. River connectivity has at least one component length >= `50` tiles (floor accepted after 8 tuning iterations).
6. Hex skew remains corrected via axial sampling transform (`axialToSample`) and hex math symmetry tests.
7. Visual polish includes at least three items:
   - elevation-based shading
   - shoreline tinting for land adjacent to water/river
   - zoom-dependent outline behavior with overlay mode toggle (`auto/on/off`)
8. Minimap remains throttled (<= 5 updates/sec target; configured 4/s), has center marker, and displays an update-rate label.
9. Overlay includes seed apply, URL sharing behavior (`?seed=` read + `replaceState` on apply), legend text, stress controls, and runtime counters.
10. Stress mode supports auto-pan, optional zoom oscillation, elapsed timer, loaded chunk count, total chunks generated, chunk-band telemetry after warm-up, and perf EMA (`ms`/`fps`) with reset.
11. Chunk streaming remains bounded by viewport+margin and unloads out-of-range chunks (no monotonic loaded-chunk growth expected in stress mode).
12. All milestone checkpoints keep `npm test` and `npm run build` passing.

## Locked River Tuning Constants
- `RIVER_SOURCE_SPACING = 12`
- `RIVER_SOURCE_RATE = 1`
- `MIN_SOURCE_ELEVATION = 0.5`
- `MAX_RIVER_STEPS = 360`
- `RIVER_WATER_STOP_ELEVATION = 0.42`
- `RIVER_UPHILL_TOLERANCE = 0.005`
- `MAJOR_SOURCE_SPACING = 72`
- `MAJOR_MIN_SOURCE_ELEVATION = 0.6`

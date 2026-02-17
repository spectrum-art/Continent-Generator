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

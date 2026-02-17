# Map Explorer Spec

## Scope
Static deterministic hex map explorer in TypeScript + Vite + PixiJS with infinite chunk streaming, debug overlay, minimap, and stress/performance observability.

## Non-Goals
- No backend/network APIs
- No runtime AI features
- No platform-specific dependencies

## Milestone 9 Acceptance Criteria
1. Terrain debug render modes are available in overlay + keybind:
- `normal`, `elevation`, `moisture`, `ocean-mask`, `flow`, `lake-basin`, `river-trace`
- deterministic per seed and compatible with chunk streaming.
2. Water visuals are seam-safe:
- macro overlap classification tests remain green.
- water visual scalar seam checks pass across chunk boundaries.
3. Hydrology v3 (deterministic trace rivers):
- sparse deterministic sources and downhill tracing with merge support.
- traces terminate to ocean/lake/merge or are pruned by minimum quality.
- river tests validate determinism, max step bound, minimum long component, and sink-termination ratio.
4. Lakes v3 basin constraints:
- ocean/lake split uses macro-connected flood fill.
- tendril pruning and compactness checks prevent spaghetti lakes.
- tests enforce basin presence/count bounds and compactness/tendril limits.
5. Shoreline coherence:
- shoreline remains ocean-only and tightened (`SHORELINE_BAND = 0.052`).
- tests enforce ocean adjacency, coverage cap, and isolated-thread guard.
6. Elevation readability + bias guard:
- stronger main-view land shading contrast.
- directional isotropy sanity test guards against strong axis bias in elevation sampling.
- minimap remains base-palette-only (no elevation modulation).
7. Palette separation + river integration:
- water/lake/river/rock hues are clearly separated via single-source palette.
- river shading is softened to read as terrain-integrated water.
8. Low-zoom LOD, stress mode, and existing controls remain intact.
9. `npm test` and `npm run build` pass for each checkpoint commit.

## Tuned Constants (Milestone 9)
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
- River coverage/coherence guardrails in tests (`256x256` sample):
- coverage `0.35%..4%`
- largest component `>= 80`
- sink termination ratio `>= 55%` (sampled sources)

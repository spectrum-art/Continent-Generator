# Map Explorer Spec

## Scope
Build and iterate a static procedural hex-map explorer in TypeScript + Vite + PixiJS with deterministic generation, chunk streaming, minimap/overlay tooling, and stress telemetry.

## Non-Goals
- No backend/network APIs
- No runtime AI features
- No platform-specific dependencies

## Milestone 7.5 Acceptance Criteria
1. Minimap renders at `192x192` internal resolution and displays at `128x128` CSS size for smoother appearance.
2. Legend is hidden by default and toggled via a compact key button; hidden state consumes no layout space.
3. Water/lake classification is based on world-anchored hydro macro tiles (not render chunk-local coordinates), with overlap consistency test coverage.
4. River generation is deterministic, bounded, and tuned to be less noisy:
   - source density and pruning constants are explicit
   - minimum path length and elevation drop are enforced
   - traces terminate at/before `MAX_RIVER_STEPS`
5. Lakes are derived as enclosed basin components on the same macro basis, with minimum basin size filtering.
6. Generator tests assert:
   - river coverage in `256x256` around origin for seed `default` in `0.5%..4%`
   - at least one river component length `>= 60`
   - lake basin count in `1..12` for the same sample
   - deterministic water/lake and river layout behavior
7. WASD navigation is available:
   - `W/A/S/D` pans camera
   - movement scales with zoom
   - `Shift` boosts speed
   - `Space` pauses/resumes stress autopan when stress mode is active
8. Renderer keeps one chunk `Graphics` object per chunk and uses per-chunk tile caching to reduce repeated tile sampling.
9. Outline behavior is controlled as a zoom-gated feature (`Auto borders (zoomed-in only)`), defaulting to hidden at low zoom.
10. Stress overlay exposes chunk-band and perf health (`ok/warn/idle`) using chunk stability and frame-time/FPS guardrails.
11. `npm test` and `npm run build` pass after each checkpoint commit.

## Tuned Constants (Milestone 7.5)
- `RIVER_SOURCE_SPACING = 14`
- `RIVER_SOURCE_RATE = 1`
- `MIN_SOURCE_ELEVATION = 0.5`
- `MIN_RIVER_LENGTH = 11`
- `MIN_RIVER_ELEVATION_DROP = 0.03`
- `MAX_RIVER_STEPS = 360`
- `HYDRO_MACRO_SIZE = 256`
- `HYDRO_MACRO_MARGIN = 128`
- `MIN_LAKE_COMPONENT_TILES = 40`

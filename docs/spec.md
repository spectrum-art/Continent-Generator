# Map Explorer Spec

## Scope
Static deterministic hex map explorer in TypeScript + Vite + PixiJS with infinite chunk streaming, debug overlay, minimap, and stress/performance observability.

## Non-Goals
- No backend/network APIs
- No runtime AI features
- No platform-specific dependencies

## Milestone 8 Acceptance Criteria
1. Snapshot tooling exists and is deterministic:
- `npm run snapshot` writes PNG artifacts (`main` + `minimap`) under `artifacts/`.
- Filenames encode seed/zoom/center coordinates.
- Snapshot run validates deterministic bytes by hashing repeated renders.
2. Minimap remains supersampled (`192x192` internal, `128x128` display) and uses only base biome palette colors (no elevation modulation).
3. Shoreline/sand behavior:
- shoreline band tightened by 20% (`0.065 -> 0.052`)
- shoreline classification uses ocean adjacency only (not lake/river adjacency)
- tests enforce sand coverage ceiling and ocean-adjacent-only sand placement.
4. Water seam correctness:
- ocean/lake classification remains macro-anchored and overlap-consistent.
- water shading scalar is deterministic and overlap-consistent across macro boundaries.
5. Rivers are constrained for coherence:
- random secondary widening removed to reduce confetti branches.
- tests enforce coverage band (`0.5%..4%`), at least one component length `>= 80`, and component count `<= 25` in a `256x256` sample.
6. Main-view shading:
- stronger elevation response for land.
- water/lake shading driven by deterministic depth-like scalar.
- minimap remains unshaded palette-only.
7. Low-zoom LOD:
- renderer switches to `cacheAsTexture` chunk rendering below `LOD_ZOOM_THRESHOLD = 0.8`.
- overlay exposes draw mode (`hex`/`lod`), chunk sprite count, and approximate tile draw count.
8. UI polish:
- outline control is a checkbox labeled `Show tile borders when zoomed`.
- legend toggle uses Material Symbols key icon (not text label).
9. Runtime controls retained:
- mouse pan/zoom, WASD + Shift movement, Space stress pause, seed URL sharing, stress telemetry.
10. `npm test` and `npm run build` remain green after each committed checkpoint.

## Tuned Constants (Milestone 8)
- `SHORELINE_BAND = 0.052`
- `HYDRO_MACRO_SIZE = 256`
- `HYDRO_MACRO_MARGIN = 128`
- `MIN_LAKE_COMPONENT_TILES = 40`
- River coverage/coherence guardrails verified by tests:
- coverage `0.5%..4%`
- largest component `>= 80`
- component count `<= 25`

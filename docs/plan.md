# Map Explorer Plan

## Milestone 8: Visual Correctness + Verification + LOD

- [x] `A` snapshot harness:
- [x] Add deterministic main/minimap raster renderer.
- [x] Add `npm run snapshot` command.
- [x] Write PNG artifacts with stable names to `artifacts/`.
- [x] Verify repeated renders hash-identically.
- [x] Gate with `npm test`, `npm run build`, and `npm run snapshot`.

- [x] `B` minimap color correctness:
- [x] Keep minimap supersampling (`192 -> 128` display).
- [x] Route minimap sampling through a palette-only helper.
- [x] Add automated minimap color-set test (no per-tile shading).
- [x] Gate with `npm test` and `npm run build`.

- [x] `C` shore tightening and correctness:
- [x] Tighten shoreline band by 20% (`0.052`).
- [x] Restrict sand classification to ocean-adjacent land.
- [x] Add sand coverage cap + ocean-adjacency generator tests.
- [x] Gate with `npm test` and `npm run build`.

- [x] `D` water seam scalar verification:
- [x] Add deterministic water shading scalar in generator.
- [x] Extend overlap test to compare both classification and shading scalar.
- [x] Use scalar in renderer water/lake shading path.
- [x] Gate with `npm test` and `npm run build`.

- [x] `E` river coherence:
- [x] Remove secondary random widening branch pass.
- [x] Raise coherence tests: largest component `>= 80`, component count `<= 25`.
- [x] Keep coverage test in `0.5%..4%` band.
- [x] Gate with `npm test` and `npm run build`.

- [ ] `F` lake morphology compactness pass.
Deferred in Milestone 8. Current lake control remains deterministic basin filtering (`MIN_LAKE_COMPONENT_TILES`).

- [x] `G` low-zoom LOD:
- [x] Add `LOD_ZOOM_THRESHOLD` draw-mode switch.
- [x] Use chunk `cacheAsTexture` when zoomed out.
- [x] Add overlay counters: draw mode, chunk sprites, approx tile draws.
- [x] Gate with `npm test` and `npm run build`.

- [x] `H` UI polish:
- [x] Replace outline toggle button with checkbox.
- [x] Replace text legend toggle with Material Symbols key icon.
- [x] Gate with `npm test` and `npm run build`.

- [x] `I` docs update for Milestone 8 scope and verification criteria.

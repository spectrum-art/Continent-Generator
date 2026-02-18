# Map Explorer Plan

## Milestone 15: Erosion, Shading, Resolution, and Coastal Realism

- [x] `ms15_resolution_upgrade`: raise effective map resolution with upsampled output fields.
- [x] `ms15_directional_hillshade`: strengthen NW directional relief shading from elevation gradients.
- [x] `ms15_river_incision`: carve river valleys with two incision passes and post-carve flow recompute.
- [x] `ms15_coastal_variation`: add slope/drainage/relief/noise variation to coastal moisture.
- [x] `ms15_edge_falloff`: enforce stronger edge-to-ocean transition to avoid clipped borders.
- [x] `ms15_coastal_smoothing_rewrite`: make smoothing modify coastline contour while beach width stays stable.
- [x] `ms15_erosion_feedback_pass`: add post-carve smoothing and post-biome blending feedback passes.
- [x] `ms15_river_distribution_fix`: bias source selection inland and keep longer coherent rivers.
- [x] `ms15_docs_and_tests`: update docs and add inland-river coverage assertion.
- [x] Validate determinism + identity behaviors remain intact.
- [x] Keep bounded-map ocean-edge guarantee passing.
- [x] Keep `npm test` green.
- [x] Keep `npm run build` green.

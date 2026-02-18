# Map Explorer Spec

## Milestone 15: Erosion, Shading, Resolution, and Coastal Realism

## Product Scope
- Finite, deterministic continent generator artifact.
- Terrain-first pipeline only (`plates -> elevation -> sea level -> climate -> rivers -> biomes`).
- No preset system and no user-facing perf tooling buttons.
- Parameter surface remains the controls defined in `docs/continent-generator-controls.csv`.

## Milestone 15 Pipeline
1. Generate base tectonic elevation in aspect-aware generation space.
2. Upsample elevation to output resolution (`2x` per axis) for higher effective detail.
3. Apply edge falloff so borders trend to ocean before sea-level classification.
4. Compute sea level from `Land Fraction`, classify land/water, and flood ocean connectivity.
5. Build climate fields from latitude, ocean distance, elevation, rain shadow, and local variation.
6. Compute flow field and select inland-aware river sources.
7. Trace rivers downhill, then run two river-incision passes into elevation.
8. Recompute land/water/ocean/lake + flow after incision.
9. Apply coastal moisture variation (distance, slope, drainage, relief, noise).
10. Classify biomes with stable beach width and ocean-aware shoreline logic.
11. Run feedback smoothing passes to reduce tectonic hard edges and biome seams.

## Visual + Behavior Acceptance
- Directional hillshade uses NW lighting and is driven by elevation gradients.
- Mountains show visible furrowing/valley cues from incision + relief shading.
- Coastlines are less pixelated due to upsampled output fields.
- Coastal smoothing changes coastline geometry instead of primarily widening beaches.
- Map edges remain ocean (no clipped land silhouettes).
- Rivers include inland systems, not only near-coast traces.
- Coastal biome belts are varied rather than uniform wet halos.

## Determinism + Identity
- Seed normalization is case-insensitive.
- Same seed + controls => same identity hash and map fields.
- Aspect ratio affects generation-space geometry and identity hash (no stretch clones).
- Export/import round-trips controls and reproduces identity exactly.

## Rendering + Performance Guardrails
- Existing LOD rendering remains active for low/mid/high zoom bands.
- Performance targets remain:
- Mid zoom `>= 60 FPS`.
- Full-continent zoom `>= 30 FPS`.
- Milestone 15 changes must not regress deterministic generation or build/test stability.

# Map Explorer Spec

## Milestone 14: Terrain-First Coastlines and Realistic Relief

## Product Scope
- Static, deterministic continent generator artifact.
- Finite atlas map only (no infinite world streaming).
- Parameter-driven generation via controls in `docs/continent-generator-controls.csv`.
- Visual output: atlas-style terrain with stronger relief readability, ridge structure, coherent coastlines, and deterministic rivers/lakes.

## Required Controls
- Top-level controls: `Seed`, `Size`, `Aspect Ratio`.
- Primary geography sliders: `Land Fraction`, `Relief`, `Fragmentation`, `Coastal Smoothing`.
- Biome mix sliders: `Rivers`, `Grassland`, `Temperate Forest`, `Rainforest`, `Desert`, `Mountains`, `Tundra`.
- Buttons: `Generate`, `Reroll`, `Randomize`, `Reset`, `Save as PNG`.
- Advanced section: `Import`, `Export`, `Latitude Center`, `Latitude Span`, `Plate Count`, `Mountain Peakiness`, `Climate Bias`, `Island Density`, `Lat/Long Grid`.
- `Reset Biome Mix` and `Toggle Advanced Mode` are available.

## Terrain-First Pipeline (Bounded)
1. Plate centers + motion vectors produce boundary stress (convergent/divergent/transform).
2. Continuous multi-scale elevation is synthesized in final aspect-ratio space.
3. Sea level is chosen from `Land Fraction` (quantile threshold on elevation).
4. Coastline emerges from elevation relative to sea level (no mask-first land sculpting).
5. Coastal smoothing operates on elevation near sea level (local contour erosion/diffusion).
6. Climate fields (temperature + moisture) derive from latitude, ocean distance, elevation, and rain shadow.
7. Rivers trace downhill from accumulation-based sources and terminate into ocean/lakes.
8. Biomes derive from climate + elevation + relief context.

## Determinism
- Seed normalization is case-insensitive.
- Same seed + controls produce identical map hashes.
- Human-readable seed generation is `AdjectiveNoun`.
- Identity hash includes normalized seed + size/aspect/controls plus key field checksums.
- Changing aspect ratio changes identity (generation-time geometry, no stretch clones).

## Finite-Map Constraints
- Map dimensions are derived from `Size` + `Aspect Ratio`.
- Outer map boundaries are guaranteed ocean.
- No infinite panning assumptions and no chunk-streaming dependency for world growth.

## Export / Import
- Export emits a compact URL-safe string with seed + parameters.
- Import restores controls deterministically.
- Export format is compact encoded key/value payload (not raw JSON).

## PNG Export
- `Save as PNG` exports the current map at high resolution independent of viewport size.

## Rendering + LOD
- Atlas render now prebuilds LOD rasters:
- Low zoom raster (`~0.6x`) for full-continent view.
- Base raster (`1x`) for mid-zoom.
- High-detail raster (`2x`) for close zoom.
- Runtime selects raster by zoom band, keeping generation off the hot render loop.

## Performance Threshold Targets
- Mid zoom target: `>= 60 FPS`.
- Full-continent target: `>= 30 FPS`.
- LOD must remain enabled so low-zoom views do not render full-detail terrain every frame.

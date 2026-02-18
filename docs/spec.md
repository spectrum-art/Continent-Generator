# Map Explorer Spec

## Milestone 12: Continent Generator Artifact Pivot

## Product Scope
- Static, deterministic continent generator artifact.
- Finite atlas map only (no infinite world streaming).
- Parameter-driven generation via controls in `docs/continent-generator-controls.csv`.
- Visual output: clean atlas-style terrain with readable coasts, rivers, and biomes.

## Required Controls
- Top-level controls: `Seed`, `Preset`, `Size`, `Aspect Ratio`.
- Primary geography sliders: `Land Fraction`, `Relief`, `Fragmentation`, `Coastal Smoothing`.
- Biome mix sliders: `Rivers`, `Grassland`, `Temperate Forest`, `Rainforest`, `Desert`, `Mountains`, `Tundra`.
- Buttons: `Generate`, `Reroll`, `Randomize`, `Reset`, `Save as PNG`.
- Advanced section: `Import`, `Export`, `Latitude Center`, `Latitude Span`, `Plate Count`, `Mountain Peakiness`, `Climate Bias`, `Island Density`.
- `Reset Biome Mix` and `Toggle Advanced Mode` are available.

## Generation Pipeline (Bounded)
1. Plate field and boundary influence generation.
2. Base elevation synthesis from plates + multi-frequency noise.
3. Land/ocean thresholding with ocean-enforced edge falloff.
4. Coastal smoothing/fragmentation shaping.
5. Climate fields (temperature/moisture from latitude/elevation/proximity).
6. River tracing from downhill flow accumulation.
7. Biome assignment (terrain + climate + biome mix targets).

## Determinism
- Seed normalization is case-insensitive.
- Same seed + controls produce identical map hashes.
- Human-readable seed generation is `AdjectiveNoun`.

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

## Performance Acceptance
- Rendering uses prebuilt atlas rasters and camera transform redraw (not per-tile regeneration per frame).
- Performance probe method uses `requestAnimationFrame` over 3 seconds of auto-pan:
- Mid zoom target: `>= 60 FPS`.
- Full-continent zoom target: `>= 30 FPS`.

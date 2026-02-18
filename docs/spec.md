# Map Explorer Spec

## Milestone 13: Atlas-Grade Geometry + Rendering Overhaul

## Product Scope
- Static, deterministic continent generator artifact.
- Finite atlas map only (no infinite world streaming).
- Parameter-driven generation via controls in `docs/continent-generator-controls.csv`.
- Visual output: atlas-style terrain with stronger relief readability, ridge structure, coherent coastlines, and deterministic rivers/lakes.

## Required Controls
- Top-level controls: `Seed`, `Preset`, `Size`, `Aspect Ratio`.
- Primary geography sliders: `Land Fraction`, `Relief`, `Fragmentation`, `Coastal Smoothing`.
- Biome mix sliders: `Rivers`, `Grassland`, `Temperate Forest`, `Rainforest`, `Desert`, `Mountains`, `Tundra`.
- Buttons: `Generate`, `Reroll`, `Randomize`, `Reset`, `Save as PNG`.
- Advanced section: `Import`, `Export`, `Latitude Center`, `Latitude Span`, `Plate Count`, `Mountain Peakiness`, `Climate Bias`, `Island Density`, `Lat/Long Grid`.
- `Reset Biome Mix` and `Toggle Advanced Mode` are available.

## Generation Pipeline (Bounded)
1. Plate field and boundary influence generation.
2. Base elevation synthesis from plates + multi-frequency noise.
3. Land/ocean thresholding with ocean-enforced edge falloff.
4. Coastal smoothing/fragmentation shaping.
5. Climate fields (temperature/moisture from latitude/elevation/proximity).
6. River tracing from downhill flow accumulation.
7. Biome assignment (terrain + climate + biome mix targets).
8. Coast cleanup pass that prunes tiny land/water artifacts for smoother high-smoothing coastlines.

## Preset Distinctness
- Presets are expected to have recognizable signatures, not only slider differences.
- Distinctness verification compares feature vectors for:
- `archipelago` vs `earth-like`
- `broken-coast` vs `earth-like`
- `archipelago` vs `broken-coast`
- Each pair must separate on at least 3 metrics (land ratio/coast complexity/islands/ridge/river/bbox metrics).

## Determinism
- Seed normalization is case-insensitive.
- Same seed + controls produce identical map hashes.
- Human-readable seed generation is `AdjectiveNoun`.
- Identity hash includes normalized seed + size/aspect/preset/controls plus key field checksums.
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

## Verification Tooling
- In-app buttons:
- `Run Perf Suite` executes deterministic autopan probes (`mid`, `full`, `high`) and reports avg/p95/worst/hitches.
- `Preset Distinctness` runs deterministic preset-separation checks on fixed seeds.
- API hooks on `window.__continentTool` expose:
- `runPerfProbe(mode)`
- `runValidationPerfSuite()`
- `runDistinctnessSuite(seeds)`

## Performance Threshold Targets
- Probe duration: 3 seconds per mode (`requestAnimationFrame` sampling).
- Mid zoom pan target: `avg FPS >= 55`, `p95 <= 22ms`.
- Full-continent pan target: `avg FPS >= 45`, `p95 <= 28ms`.
- High zoom pan target: `avg FPS >= 55`, `p95 <= 22ms`.
- Hitch budget: `<= 1` frame over `80ms` per 3-second probe.

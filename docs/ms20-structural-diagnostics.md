# MS20 Baseline Structural Diagnostics

## Baseline Snapshot
- Command: `npm run snapshot`
- Output: `artifacts/ms18/2026-02-19T15-03-27-259Z`
- Summary: `cases=6 pass=6 fail=0`

## Structural Pipeline Entry Points
- `generateContinent()` chooses structural path in `src/gen/continent.ts`:
  - `generateStructuralTerrain(width, height, seed, controls)`
  - `seaLevelForLandFraction(elevation, landFractionNorm)`
  - `smoothCoastFromElevation(width, height, elevation, seaLevel, controls.coastalSmoothing)`
- Structural build orchestration in `src/gen/structureTerrain.ts`:
  - plates + boundaries: `buildPlateModel()`
  - convergent belts: `buildConvergentBelts()`
  - crest graph: `buildRidgeGraph()`
  - basin graph: `buildBasinGraph()`
  - DEM rasterization: `rasterizeStructuralDem()`
  - erosion: `applyStructuralErosion()`

## Current Artifact Risks (Pre-MS20)
1. Land/coast shape uses scalar threshold from a radial+noise macro base, then thresholded to binary land.
   - Risk: staircase-like axis-aligned boundary runs at raster resolution and occasional cutout-looking corners.
2. Ridge rasterization uses segment-distance Gaussian accumulation (`applySegmentGaussian`) with mostly edge-constant width/amplitude.
   - Risk: tube/glow ridges with weak along-crest variation.
3. Junction handling in graph generation caps degree but does not explicitly suppress near-symmetric branching geometry.
   - Risk: hub-like intersections and plus/cross signatures.

## MS20 Repair Plan
1. Replace coast/land threshold handling with robust land-potential + boundary SDF checks and anti-jagged coast transition.
2. Replace ridge contribution with arc-length parameterized variable width/amplitude and asymmetric non-Gaussian cross-sections.
3. Add explicit junction symmetry suppression/continuation rules.
4. Replace current gates with 3-5 strong structural tests:
   - coastline orthogonality
   - ridge tube-ness
   - junction symmetry
   - (optional) resolution consistency invariants

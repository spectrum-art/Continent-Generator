# Map Explorer Spec

## Milestone 20: Structural Raster Bug Fixes + Ridge De-Tubing

## Scope
- Deterministic bounded continent generator (case-insensitive seed normalization).
- Preserve MS19 structure-first core and remove visible structural artifacts:
  - blocky/axis-aligned coastline raster artifacts
  - tube-like uniform ridge glows
  - symmetric junction hub signatures
- No new user-facing UI controls.

## MS20 Terrain Updates
1. Land/coast shape uses authoritative continuous `landPotential` at the final map resolution.
2. Sea-level target may be solved against `landPotential` and then refined by coast-elevation smoothing.
3. Crestline rasterization now varies along edge arc length:
  - variable amplitude with massif/saddle envelopes
  - variable width with independent low-frequency modulation
  - asymmetric cross-section via coherent side bias
  - non-Gaussian profile blend to avoid uniform tube glow
4. Junction suppression keeps continuity through nodes and downgrades branch-like spokes.
5. Structural diagnostics are emitted from generator internals for realism gates.

## Outputs
- `buildElevationRgba`: grayscale DEM render.
- `buildNormalRgba`: normal map derived from DEM gradients.
- `buildAtlasRgba`: shaded-relief grayscale atlas render.
- Snapshot harness remains `npm run snapshot` and writes:
  - `dem.png`
  - `normal.png`
  - `hillshade.png`
  - `metrics.json`

## Realism Gates (MS20)
Programmatic gates (arrays/graphs only):
- coastline orthogonality:
  - axis-aligned boundary orientation ratio
  - longest axis-aligned coastline run ratio
- ridge tube-ness:
  - ridge width coefficient-of-variation
  - ridge amplitude coefficient-of-variation
- junction symmetry:
  - high-degree node count (strong edges only)
  - degree-3 angle symmetry score
- resolution consistency:
  - authoritative field dimensions and valid structural diagnostics

`evaluateDemRealism()` returns gate booleans + reasons and is used by tests and snapshot reporting.

## Determinism
- Same controls + seed always produce same map identity hash and realism metrics.
- Export/import roundtrip preserves map identity.

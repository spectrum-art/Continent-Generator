# Map Explorer Spec

## Milestone 18: DEM-First Geological Rebuild

## Product Focus
- Single bounded continent artifact driven by deterministic controls.
- Terrain core is DEM-first: geology and erosion produce elevation; hillshade is derived from DEM.
- Non-core systems (biomes/rivers/gameplay scaffolding) are de-emphasized for this milestone.

## DEM Pipeline (MS18)
1. Generate macro tectonic domains (`convergent`, `divergent`, `craton`, `transform`) and blend into one continuous uplift field.
2. Apply macro shape and edge-ocean control directly in elevation space (no binary mask sculpting).
3. Derive continuous stress orientation from uplift gradients.
4. Synthesize anisotropic ridge detail aligned with the stress field (multi-band ridged noise).
5. Run erosion-first valley carving using flow accumulation feedback (2 lightweight passes).
6. Normalize DEM, solve sea level from Land Fraction, and apply coastal smoothing near sea level.
7. Compute global hillshade from full-field central-difference normals with fixed NW lighting.

## Outputs
- Renderer uses DEM-derived grayscale hillshade (`buildAtlasRgba`).
- Snapshot command (`npm run snapshot`) writes:
  - `dem.png`
  - `normal.png`
  - `hillshade.png`
  - `metrics.json`

## Realism Gates
`evaluateDemRealism()` computes and gates:
- radial symmetry rejection
- ridge anisotropy
- valley depth variance
- curvature cluster separation
- silhouette angular bias
- seam discontinuity
- hillshade wedge concentration

`npm run snapshot` returns non-zero when any case fails the gate set.

## Determinism + Identity
- Seed normalization is case-insensitive.
- Identity hash remains deterministic for same controls.
- Import/export compact string round-trips preserve identity hash.

## Performance Notes
- Expensive macro field generation runs at a reduced base grid and is upsampled.
- Erosion uses limited iterations (2) for predictable runtime.
- Build/test/snapshot remain part of milestone gates.

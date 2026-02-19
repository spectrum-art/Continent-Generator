# Map Explorer Spec

## Milestone 19: Structure-First Orogeny + Basin Graph

## Scope
- Deterministic bounded continent generator (case-insensitive seed normalization).
- DEM-first terrain core rebuilt around explicit structural objects:
  - plate partition
  - boundary extraction/classification
  - convergent belts
  - crestline ridge graph
  - basin/valley graph
  - structural rasterization + erosion
- No new user-facing UI controls.

## Generation Pipeline (MS19)
1. Voronoi-like plate partition over the map and plate motion vectors.
2. Boundary extraction and classification into convergent/divergent/transform.
3. Convergent belt construction from boundary geometry.
4. Crestline graph construction with primary spines and controlled branching.
5. Ridge hierarchy expansion (primary/secondary/tertiary edges).
6. Basin graph construction (trunk valleys + tributaries + edge outlets).
7. DEM rasterization from graph primitives:
  - positive ridge contributions
  - negative valley contributions
  - low-amplitude fine noise only after structure
8. Structural erosion (6–10 passes) driven by flow accumulation and basin-field bias.
9. Sea level cut after erosion; hillshade from full DEM gradient with NW lighting.

## Outputs
- `buildElevationRgba`: grayscale DEM render.
- `buildNormalRgba`: normal map derived from DEM gradients.
- `buildAtlasRgba`: shaded-relief grayscale atlas render.
- Snapshot harness remains `npm run snapshot` and writes:
  - `dem.png`
  - `normal.png`
  - `hillshade.png`
  - `metrics.json`

## Realism Gates (MS19)
Fewer, stronger structural gates:
- crestline continuity
- ridge anisotropy
- basin depth separation
- no-blob rejection

`evaluateDemRealism()` returns gate booleans + reasons and is used by tests and snapshot reporting.

## Determinism
- Same controls + seed always produce same map identity hash and realism metrics.
- Export/import roundtrip preserves map identity.

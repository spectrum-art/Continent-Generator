# Map Explorer Spec

## Milestone 17: Continuous-Field Terrain + Self-Evaluating Realism Gates

## Scope
- Deterministic bounded continent generator (seed + controls, case-insensitive seed normalization).
- Terrain refactor uses continuous global fields, not stitched regional/sector plate partitions.
- No new user-facing controls added.
- NW directional lighting remains fixed.
- Realism is enforced by automated gates from generated snapshots and image-derived metrics.

## Continuous-Field Pipeline (MS17)
1. Build plate set and sample a continuous plate influence field (weighted kernels).
2. Synthesize macro elevation from:
- continuous uplift
- macro basin/slope field
- continuous warped continental frame + seeded land cores
3. Build a global stress/orientation vector field (continuous, smoothed).
4. Run anisotropic ridge synthesis aligned to stress direction.
5. Apply lightweight flow-feedback valley carving (1 pass + recompute).
6. Hydrology:
- basin/inland-biased sources
- trunk + tributary routing
- fallback source pass
- trunk enforcement for Region+ where land supports it
7. River incision in two passes with flow recompute between passes.
8. Global hillshade:
- full-field smoothing
- central-difference gradients
- NW Lambert + ambient lighting
9. Biome classification from climate + elevation + hydrology.

## Snapshot Harness V2
- Command: `npm run snapshot`
- Output directory: `artifacts/ms17/<run-id>/`
- Files:
- `case_<name>.png` (triptych: full map + mountain crop + interior river/plains crop)
- `montage.png` (matrix of all case triptychs)
- `metrics.json` (per-case structural metrics + gate outcomes)
- `critique.txt` (run summary + failing gate reasons)

## Structural Metrics + Gates
- Wedge detector:
- dominant orientation share
- low-frequency orientation share
- radial/tangential convergence
- ring jump p95
- Radial ridge detector:
- mountain high-pass orientation radial alignment
- periodic peak share
- Rectangular silhouette detector:
- coastline axis-aligned normal score
- bbox fill ratio
- coastline cardinal bias
- River hierarchy detector:
- inland ratio
- coastal clustering ratio
- max connected river component
- inland source count

Gate status is aggregated as:
- `wedgesPass`
- `radialPass`
- `rectanglePass`
- `riverPass`
- `pass` (all above true)

## Current MS17 Snapshot Result
- Latest run matrix: `12` cases
- Result: `pass=12`, `fail=0`

## Determinism
- Deterministic across:
- terrain generation
- realism metrics
- snapshot case matrix + outputs for same code/inputs
- Export/import controls still preserve map identity hash.

## Performance Sanity (Local Probe)
- Single generation pass timings (`vite-node`):
- `isle/square/lf4`: ~`1295ms`
- `region/landscape/lf5`: ~`2824ms`
- `supercontinent/landscape/lf7`: ~`6171ms`

MS17 prioritizes realism correctness and artifact elimination while keeping generation performance in a stable range.

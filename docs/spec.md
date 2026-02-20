# Terrain Generator Spec

## Milestone 0 (Completed)
Milestone 0 established a deterministic continent-scale heightfield pipeline with:
- Seed parsing + canonicalization
- Forked RNG streams
- Land mask and connected-component metrics
- Heightfield + hillshade + preview outputs

## Milestone 1 Goal
Introduce a deterministic plate-proxy tectonic scaffold that improves continental relief realism with directional mountain belts, rifts, and transform-like lineaments, while keeping raster heightfield as source of truth.

## Milestone 1 Constraints
- Deterministic for `(seed, width, height, mpp, config)`
- No SciPy; use `numpy` + `Pillow` only
- Forked RNG per stage (`tectonics_plate_count`, `tectonics_plate_sites`, `tectonics_plate_motion`, etc.)
- Architecture remains compatible with future fragmentation/supercontinent controls

## Milestone 1 Acceptance Criteria
- `terrain/tectonics.py` provides plate-partition and boundary-derived tectonic fields.
- Height pipeline consumes tectonics fields to produce directional, clustered mountain belts and elongated rift lowlands.
- CLI writes tectonic debug outputs:
  - `debug_plates.png`
  - `debug_boundary_type.png`
  - `debug_convergence.png`
  - `debug_rift.png`
  - `debug_transform.png`
  - `debug_crust.png`
  - `debug_orogeny.png`
- Determinism is preserved for `height.npy` and PNG outputs.
- CLI prints generation runtime and stores runtime only in `meta.json`.
- `deterministic_meta.json` remains strictly deterministic and excludes runtime and timestamp.

## Design Notes
- Plate proxy uses 6–12 Voronoi-like plates from deterministic site sampling.
- Boundary classes: convergent/divergent/transform from relative motion and local boundary normal.
- Tectonic intensity fields are widened by repeated box blur passes (no distance transform dependency).
- Crust/shelf fields use blurred land-mask proxies to shape interiors and ocean margins.

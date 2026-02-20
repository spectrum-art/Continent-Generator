# Terrain Generator Spec

## Milestone 0 (Completed)
Milestone 0 established deterministic continent-scale heightfield generation with seed parsing, forked RNG, mask metrics, and baseline outputs.

## Milestone 1 (Completed)
Milestone 1 adds a deterministic plate-proxy tectonic scaffold and integrates it into uplift.

## Milestone 1 Constraints (Maintained)
- Deterministic for `(seed, width, height, mpp, config)`
- Raster heightfield remains source of truth
- No SciPy dependency
- Forked RNG by stage to keep refactors stable

## Milestone 1 Acceptance Criteria
- `terrain/tectonics.py` generates:
  - plate partition (`6..12` plates)
  - plate motion vectors
  - boundary classification (`convergent/divergent/transform`)
  - tectonic intensity fields (`orogeny`, `rift`, `transform`)
  - crust and shelf proxy fields
- `terrain/heightfield.py` consumes tectonic fields for structured uplift:
  - directional mountain belts (plate-fabric anisotropy)
  - elongated rift lowlands
  - transform lineament modulation
  - shelf-influenced ocean depth transition
- CLI outputs include tectonic debug rasters:
  - `debug_plates.png`
  - `debug_boundary_type.png`
  - `debug_convergence.png`
  - `debug_rift.png`
  - `debug_transform.png`
  - `debug_crust.png`
  - `debug_orogeny.png`
- Runtime instrumentation:
  - CLI prints generation runtime
  - `meta.json` includes `generation_seconds`
  - `deterministic_meta.json` excludes runtime and timestamps
- Tests cover deterministic tectonic fields and basic structural sanity.

## Design Decisions
- Boundary class assignment uses deterministic neighbor-direction priority.
- Belt widths use repeated box blur passes (distance-transform-free approximation).
- Plate-level motion vectors define local tectonic fabric orientation for anisotropic uplift.

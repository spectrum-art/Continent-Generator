# Terrain Generator Spec

## Milestone 2 Goal
Refine tectonic structure to produce curved plate geometry, tangent-aligned mountain belts, interior basin competition, and stronger topographic readability via hillshade vertical exaggeration.

## Milestone 2 Determinism Contract
For fixed `(seed, width, height, mpp, config)`:
- `height.npy` and PNG outputs are bitwise deterministic.
- Stage randomness uses forked deterministic RNG streams.
- Runtime timing is non-deterministic and stored only in `meta.json`.

## Milestone 2 Additions
- Warped plate coordinates before nearest-site assignment for curved boundaries.
- Controlled boundary-edge jitter for mild fragmentation.
- Boundary tangent vectors and tangent-aligned orogeny fields.
- Triple-junction amplification of orogenic intensity.
- Interior basin field (negative broad-scale relief term).
- Hillshade vertical exaggeration config: `hillshade_vertical_exaggeration = 6.0`.

## Required Debug Outputs
- `debug_plates.png`
- `debug_warped_plate_ids.png`
- `debug_boundary_warp_map.png`
- `debug_boundary_type.png`
- `debug_convergence.png`
- `debug_orogeny_tangent.png`
- `debug_orogeny.png`
- `debug_rift.png`
- `debug_transform.png`
- `debug_crust.png`
- `debug_interior_basin.png`

## Milestone 2 Acceptance Criteria
- Curved plate boundaries are visible in `debug_warped_plate_ids.png`.
- Orogeny fields form continuous curved belts and are tangent-biased near convergent boundaries.
- Triple-junction zones show amplified uplift intensity.
- Interior basin field introduces broad interior low regions.
- Hillshade visibly emphasizes relief with vertical exaggeration.
- Default `2048x1024` generation runs in roughly `<= 8-10 s` on target hardware.
- Determinism remains intact except timing fields in `meta.json`.

# Map Explorer Terrain Rewrite

Milestone 2 provides deterministic continent-scale terrain with curved plate scaffolding, tangent-aligned mountain belts, interior basins, and vertically exaggerated hillshade.

## What it generates
Given a seed and raster settings, the CLI writes:
- `height.npy` (`float32`, meters)
- `height_16.png` (16-bit grayscale height preview)
- `hillshade.png` (8-bit grayscale hillshade)
- `land_mask.png`
- `debug_mask_potential.png`
- `debug_uplift.png`
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
- `meta.json` (includes timestamp + runtime)
- `deterministic_meta.json` (stable metadata, excludes timestamp/runtime)

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
pytest
```

## Generate terrain
```bash
python -m cli.main --seed MistyForge --out out --w 2048 --h 1024 --mpp 5000 --overwrite
```

Hillshade uses config default vertical exaggeration `6.0` for large-scale readability.

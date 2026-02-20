# Map Explorer Terrain Rewrite

Milestone 1 provides a deterministic continent-scale raster terrain generator with a plate-proxy tectonic scaffold.

## What it generates
Given a seed and raster settings, the CLI writes:
- `height.npy` (`float32`, meters)
- `height_16.png` (16-bit grayscale height preview)
- `hillshade.png` (8-bit grayscale hillshade)
- `land_mask.png` (8-bit land mask)
- `debug_mask_potential.png`
- `debug_uplift.png`
- `debug_plates.png`
- `debug_boundary_type.png`
- `debug_convergence.png`
- `debug_rift.png`
- `debug_transform.png`
- `debug_crust.png`
- `debug_orogeny.png`
- `meta.json` (includes timestamp + runtime)
- `deterministic_meta.json` (stable metadata, no timestamp/runtime)

## Environment
- Python 3.11+ preferred (3.10 supported)
- WSL Ubuntu development workflow

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

## Run tests
```bash
pytest
```

## Generate terrain
```bash
python -m cli.main --seed MistyForge --out out --w 2048 --h 1024 --mpp 5000 --overwrite
```

The CLI prints land metrics and generation runtime, and outputs to:
- `out/<canonical_seed>/<W>x<H>/`

## Seed rules
- Seed format: adjective+noun from internal dictionaries
- Case-insensitive
- Canonical seed is lowercase concatenation (example: `mistyforge`)
- Symbols/spaces are rejected

Examples:
- `MistyForge`
- `AncientHarbor`
- `CrimsonRidge`

Heightfield remains the source of truth; debug rasters are derived views.

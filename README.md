# Map Explorer Terrain Rewrite

Milestone 0 provides a deterministic Python generator for continent-scale raster terrain.

## What it generates
Given a seed and raster settings, the pipeline produces:
- `height.npy` (`float32`, meters)
- `height_16.png` (16-bit grayscale height preview)
- `hillshade.png` (8-bit grayscale hillshade)
- `land_mask.png` (8-bit land mask)
- `debug_mask_potential.png` (8-bit mask potential debug)
- `debug_uplift.png` (8-bit uplift debug)
- `meta.json` (includes timestamp)
- `deterministic_meta.json` (stable metadata for deterministic checks)

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
python -m cli.main --seed MistyForge --out out
```

Default generation settings:
- `--w 2048`
- `--h 1024`
- `--mpp 5000`

Useful options:
- `--overwrite` overwrite existing files in the target output folder
- `--json / --no-json` enable or disable metadata JSON files (default enabled)

## Seed rules
- Seed format: adjective+noun from internal dictionaries
- Case-insensitive
- Canonical seed is lowercase concatenation (example: `mistyforge`)
- Inputs with symbols/spaces are rejected

Examples:
- `MistyForge`
- `AncientHarbor`
- `CrimsonRidge`

## Output folder layout
For seed `MistyForge` at default size:
- `out/mistyforge/2048x1024/`

This milestone intentionally has no UI/web renderer. The heightfield is the source of truth.

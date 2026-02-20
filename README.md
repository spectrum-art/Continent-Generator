# Map Explorer Terrain Rewrite

Milestone 0 establishes a deterministic, Python-based continent-scale raster terrain generator.

## Environment
- Python 3.11+ preferred (3.10 supported)
- WSL Ubuntu development environment

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

## Test
```bash
pytest
```

## Planned CLI (Milestone 0)
```bash
python -m cli.main --seed MistyForge --out out --w 2048 --h 1024 --mpp 5000
```

Outputs are written to `out/<canonical_seed>/<W>x<H>/`.

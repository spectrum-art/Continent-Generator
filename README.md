# Map Explorer Terrain Rewrite

Milestone 8 extends deterministic terrain generation with:
- physical-scale stream-power incision (`A` in m², `S` in m/m) with robust percentile scaling
- optional pre-routing depression conditioning (priority-flood fill + shallow-breach relaxation)
- flow-aware detail damping to preserve graded macro valleys
- optional tectonic-distance modulation for noise amplitude ablations

## Debug Tiers
- `--debug-tier 0` (default): core + compact hydrology diagnostics
- `--debug-tier 1`: same file set as tier 0 (reserved for future subsystem split)
- `--debug-tier 2`: full deep diagnostics (tectonic + hydro internals)

Tier 0 output file set:
- `height.npy`
- `height_16.png`
- `hillshade.png`
- `land_mask.png`
- `debug_h_hydro_pre.png`
- `debug_h_hydro_post.png`
- `debug_flow_dir.png`
- `debug_flow_accum_log.png`
- `debug_basin_id.png`
- `debug_basin_sizes.png`
- `debug_endorheic_mask.png`
- `debug_outlets.png`
- `debug_capture_paths.png`
- `debug_river_mask.png`
- `debug_h_geomorph.png`
- `debug_incision.png`
- `debug_composite.png`
- `meta.json`
- `deterministic_meta.json`

Metadata:
- `meta.json` (timestamp + runtime)
- `deterministic_meta.json` (deterministic only)

Tier 2 includes additional ablation diagnostics:
- `debug_power_raw_log.png`
- `debug_detail_damping.png`
- `debug_tectonic_distance.png`

Deterministic metadata now includes:
- land-only hypsometric integral (`metrics.hypsometric_integral_land`)
- basin-tier + trunk-sinuosity diagnostics in `hydrology`
- incision scaling diagnostics in `geomorph` (`mean_incision_depth_incised_m`, `power_scale_value`)

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
pytest
```

## Run
```bash
python -m cli.main --seed MistyForge --w 2048 --h 1024 --mpp 5000 --overwrite --debug-tier 0
```

Hillshade uses visualization-only vertical exaggeration (`6.0` default) and is derived from `h_geomorph`. Runtime is printed to stdout and written only to `meta.json` (not `deterministic_meta.json`).

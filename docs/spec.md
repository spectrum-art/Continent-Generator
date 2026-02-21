# Terrain Generator Spec

## Milestone 8 Goal
Increase continental-scale geomorphic realism while preserving deterministic outputs and near-baseline runtime.

## Determinism Contract
For fixed `(seed, width, height, mpp, config)`:
- Height and debug rasters are deterministic and bitwise stable.
- Stage randomness uses deterministic forked streams.
- Runtime timing remains non-deterministic and is stored only in `meta.json`.

## Milestone 8 Mechanics
- Preserve drainage integration controls:
  - `hydro_lakes`
  - `hydro_capture_strength`
  - `hydro_capture_max_sill`
  - `hydro_capture_min_basin_pixels`
  - `hydro_capture_max_link_length_px`
  - `hydro_outlet_merge_radius_px`
  - `hydro_outlet_min_basin_pixels`
- Preserve hydro staging layers:
  - `h_base`
  - `h_hydro_pre`
  - `h_hydro`
- Optional pre-routing depression conditioning:
  - priority-flood fill (`depression_fill_enabled`)
  - epsilon flat-gradient imposition (`depression_flat_epsilon_m`)
  - shallow-fill relaxation (`depression_breach_enabled`, `depression_breach_max_saddle_m`)
- Basin capture pass:
  - detect endorheic sink basins from D8 routing
  - select capture targets in nearby exorheic drainage
  - carve deterministic sink-to-target links on hydro surface only
  - record carved links in `capture_paths_mask`
- Outlet consolidation pass:
  - compute raw ocean outlet points
  - merge nearby outlet labels for reporting/diagnostics
  - collapse tiny coastal outlet basins into nearby larger merged outlets
- Flow accumulation diagnostics:
  - retain self-contribution (`>= 1` on land)
  - validate NaN/negative/nonzero/heavy-tail constraints
  - export raw + log-scaled previews for interpretability
- Geomorph stage:
  - `h_geomorph` derived from `h_hydro_post`
  - stream-power-inspired incision from physical terms (`A` in m², `S` in m/m)
  - robust percentile power scaling (`geomorph_power_scale_percentile`)
  - anti-trench blur + depth cap before subtraction
  - ocean excluded from incision
  - non-inversion cap against downstream routed cells
- Flow-aware detail reintroduction:
  - damp high-frequency detail by flow accumulation (`detail_flow_*`)
  - preserve ridge texture while avoiding valley re-damming
- Optional tectonic-distance modulation:
  - exponential FBM amplitude decay from tectonic boundaries (`tectonic_noise_*`)
  - default off for baseline/runtime stability; enabled for ablations

## Visualization
- Hillshade uses configurable visualization-only exaggeration:
  - `hillshade_vertical_exaggeration = 6.0` default

## Tier 0 Debug Outputs
- Core:
  - `height.npy`
  - `height_16.png`
  - `hillshade.png`
  - `land_mask.png`
- Hydrology:
  - `debug_h_hydro_pre.png`
  - `debug_h_hydro_post.png`
  - `debug_capture_paths.png`
  - `debug_basin_id.png`
  - `debug_basin_sizes.png`
  - `debug_h_geomorph.png`
  - `debug_incision.png`
  - `debug_outlets.png`
  - `debug_endorheic_mask.png`
  - `debug_flow_accum_log.png`
  - `debug_flow_dir.png`
  - `debug_river_mask.png`
- Optional tier-0 composite:
  - `debug_composite.png`

## Milestone 8 Acceptance Criteria
- Physical incision scaling uses robust percentile mapping (not pre-normalized `A`/`S` exponents).
- Endorheic over-fragmentation is reduced when depression conditioning is enabled.
- Merged ocean outlet count is substantially lower than raw outlet count.
- Largest drainage basin ratio increases into continental-scale territory.
- Flow accumulation diagnostics are readable (`raw` + `log`) and pass validation checks.
- Deterministic metadata includes:
  - outlet/basin/endorheic metrics
  - land-only hypsometric integral
  - basin-tier counts (`>10,000 km²` endorheic, `>1%` landmass basins)
  - trunk sinuosity diagnostics
- Generation remains deterministic for fixed `(seed, width, height, mpp, config)`.
- Baseline runtime stays near prior milestone when optional heavy passes are disabled by default.
- Hillshade derives from `h_geomorph` and shows hierarchical valley carving.

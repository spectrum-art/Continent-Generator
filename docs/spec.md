# Map Explorer Spec

## Milestone 21: Hydrology-Conditioned DEM + Incision/Diffusion

## Scope
- Deterministic, DEM-first terrain pipeline focused on grayscale relief realism.
- UI scaffold remains intact; terrain core rebuilt around explicit stages.
- No new user-facing features required for this milestone.

## MS21 Pipeline
1. Macro structure field:
- elongated uplift belts
- broad cratonic plateaus
- broad subsidence basins
- low-magnitude continental tilt

2. Hydrology conditioning:
- priority-flood style conditioning in `drain-mostly` mode
- stable D8 downstream routing
- flow accumulation fields

3. Erosion loop:
- stream-power incision gated by channel threshold
- hillslope diffusion
- multiple fixed iterations by map size
- no per-iteration normalization

4. Sea level and land fraction:
- sea level chosen by quantile target from eroded DEM
- preserve elevation dynamic range above sea level
- mild coastal-band smoothing only near sea boundary

5. Cartographic hillshade:
- central-difference normals
- multi-azimuth shading with NW-weighted primary light
- diffuse/ambient support for slope readability
- normal map derived from the same DEM

## Artifacts
`npm run snapshot` writes:
- `artifacts/ms21/<timestamp>/dem.png`
- `artifacts/ms21/<timestamp>/normal.png`
- `artifacts/ms21/<timestamp>/hillshade.png`
- `artifacts/ms21/<timestamp>/metrics.json`
- `artifacts/ms21/<timestamp>/critique.txt`

## Metrics + Gates
Per-case metrics include:
- `sink_count`, `sink_fraction`
- `drain_to_ocean_fraction`
- `max_flow_acc_values`, `max_flow_acc_reach_ocean`
- `trunk_river_lengths`
- `elevation_spread_above_sea`, `stddev_above_sea`
- `curvature_stats` (concave/convex counts + ratio)
- `hillshade_edge_discontinuity_score`

Gates:
- drainage completeness
- trunk river hierarchy
- above-sea dynamic range
- curvature ridge/valley separation
- hillshade seam regression

Snapshot exits non-zero if any case fails gates.

## Validation
Run:
- `npm test`
- `npm run build`
- `npm run snapshot`

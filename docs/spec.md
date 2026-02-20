# Milestone 0 Spec

## Goal
Build a deterministic Python terrain generator that produces a continent-scale raster heightfield and derived debug outputs from a validated two-word seed.

## Scope
- Single source of truth: `height[y, x]` in meters (`float32`).
- No UI/web rendering in this milestone.
- Deterministic outputs from `(seed, width, height, meters_per_pixel, config)`.
- Default domain: `2048x1024` at `5000` meters/pixel.

## Determinism Contract
- Canonical seed is lowercase concatenation of adjective+noun (example: `mistyforge`).
- RNG uses stream forking by stage key (`mask`, `uplift`, `detail`, etc.) so stage call-order changes do not cascade globally.
- Re-running with identical inputs must produce bitwise-identical `height.npy` and PNG outputs.
- `meta.json` may include timestamp metadata.
- `deterministic_meta.json` omits timestamp fields and is stable for tests.

## Seed Rules
- Input format targets CamelCase two-word seeds, also accepts all-lowercase concatenation.
- Case-insensitive parsing.
- Words must exist in internal adjective and noun dictionaries.
- Invalid seeds return clear message with examples.

## Pipeline (Milestone 0)
1. Land mask potential from low-frequency fBm + domain warp + coastline bias.
2. Land thresholding with simple smoothing; preserve islands.
3. Macro uplift using ridged noise, warped at low frequency.
4. Height composition from uplift + continentality/potential + basin + detail.
5. Derived products: hillshade, 16-bit height preview, land mask preview, debug rasters.
6. Metrics: connected components over land (8-neighborhood), dominant landmass ratio.

## Quality Targets
- Land fraction in plausible range for defaults.
- One dominant landmass plus optional islands.
- No NaN/inf values.
- Runtime at `2048x1024` expected in a few seconds.

## Output Layout
`out/<canonical_seed>/<W>x<H>/`
- `height.npy`
- `height_16.png`
- `hillshade.png`
- `land_mask.png`
- `debug_mask_potential.png`
- `debug_uplift.png`
- `meta.json`
- `deterministic_meta.json`

## Dependencies
- `numpy`
- `Pillow`
- `pytest` (test-time)

## Non-Goals (Milestone 0)
- Hydrology/erosion simulation
- River routing
- Vector coastlines
- Interactive rendering

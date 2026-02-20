# Milestone 0 Spec

## Goal
Build a deterministic Python terrain generator that outputs a continent-scale heightfield and first derived rasters from a validated human-readable seed.

## Accepted Inputs
- Seed: adjective+noun (case-insensitive), letters only
- Width/height in pixels
- Meters per pixel

## Canonical Choices For Ambiguities
- Canonical seed format: lowercase concatenation (`mistyforge`)
- Connected components connectivity: 8-neighborhood
- Default scale: `DEFAULT_MPP = 5000`
- Metadata policy: both `meta.json` (timestamped) and `deterministic_meta.json` (stable)

## Determinism Contract
For the same `(seed, width, height, mpp, config)`:
- `height.npy` must be bitwise-stable
- PNG outputs must be bitwise-stable
- Stage RNG must use deterministic forks (`mask`, `uplift`, `detail`, etc.)

## Pipeline
1. Land mask potential (fBm + domain warp + coastline bias)
2. Land threshold + smoothing
3. Macro uplift (ridged noise + warp)
4. Height composition (continentality + ridges + basins + detail)
5. Derived products (hillshade, previews, mask)
6. Metrics (component count, dominant ratio, land fraction)

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

## Milestone 0 Acceptance Criteria
- CLI command works: `python -m cli.main --seed MistyForge --out out`
- Default resolution `2048x1024` runs in a few seconds
- Tests validate seed parsing, determinism, and baseline terrain sanity
- No NaN/inf heights
- Dominant landmass exists while allowing islands

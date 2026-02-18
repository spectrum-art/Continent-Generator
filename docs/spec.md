# Map Explorer Spec

## Milestone 16: Ridges + Inland Drainage

## Scope
- Deterministic, bounded continent generator (terrain-first pipeline).
- No preset system, no new user-facing diagnostics controls.
- NW directional lighting remains the only hillshade light direction.
- Realism priorities: ridge/valley mountain structure, inland river networks, non-rectangular high-land silhouettes.

## Generation Pipeline (MS16)
1. Plate-driven base elevation synthesis.
2. Edge and macro-frame sea bias (warped superellipse, not edge-aligned rectangle shaping).
3. Ridge/valley synthesis pass on elevation:
- orientation-aware ridged multifractal uplift in mountain candidates
- inter-ridge valley carving
4. Sea-level threshold from `Land Fraction`.
5. Coastal smoothing near sea level.
6. Climate fields (temperature/moisture) from latitude, ocean distance, elevation, and rain shadow.
7. Basin-driven hydrology:
- downhill flow + accumulation
- inland-biased trunk source selection
- tributary source pass that joins trunk network
8. River incision in two passes with flow recomputation between passes.
9. Biome classification from climate + elevation + hydrology.
10. NW hillshade from full-field gradients (artifact-resistant, no sector-based shading).

## Determinism
- Seed normalization is case-insensitive.
- Same seed + controls => same map identity hash and field outputs.
- Export/import compact code round-trips map identity exactly.
- Aspect ratio changes generation-space geometry and identity hash.

## Realism Verification Gates
- Inland drainage:
- `riverPixels > 80` on region default probe.
- inland river ratio (`distanceToOcean >= 10`) > `0.7`.
- at least 2 components and one component length >= 40.
- Ridge/valley structure:
- high-relief average ridge-energy metric across fixed seeds > `0.016`.
- mountain coverage in that probe > `0.04`.
- Rectangle mitigation (high land fraction, square aspect):
- `bboxFillRatio < 0.9`.
- coastline perimeter > `2200`.

## Performance Guardrail
- No major regression versus MS15 runtime envelope.
- LOD rendering remains active.
- Expensive realism work remains in generation passes, not per-frame render loops.
- MS16 local sanity timings (single generation pass, `vite-node`):
- `isle/square/lf4`: ~`1089ms`
- `region/landscape/lf5`: ~`2471ms`
- `supercontinent/landscape/lf7`: ~`5025ms`

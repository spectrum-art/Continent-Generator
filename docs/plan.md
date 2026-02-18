# Map Explorer Plan

## Milestone 14: Terrain-First Coastlines and Realistic Relief

- [x] Remove preset dropdown, preset logic paths, and preset-specific tests.
- [x] Remove non-user milestone buttons (`Run Perf Suite`, `Preset Distinctness`) from UI/runtime surface.
- [x] Replace mask-first terrain with terrain-first pipeline:
- [x] plates
- [x] continuous elevation field
- [x] sea level threshold from `Land Fraction`
- [x] coastline from elevation
- [x] climate → rivers → biomes
- [x] Rewrite coastal smoothing to operate on elevation near sea level (not binary mask dilation/erosion).
- [x] Keep ocean edges guaranteed for bounded-map artifact constraints.
- [x] Strengthen NW directional shaded relief using surface normals.
- [x] Increase effective terrain detail with multi-scale + micro relief.
- [x] Improve biome realism from temperature + moisture + elevation + rain shadow context.
- [x] Make aspect ratio generation-space aware (no post-generation stretch behavior).
- [x] Keep LOD rendering strategy active for low/mid/high zoom.
- [x] Add/retain tests for:
- [x] determinism
- [x] export/import identity roundtrip
- [x] land-fraction monotonicity
- [x] coastline perimeter response to coastal smoothing
- [x] aspect-ratio identity differences
- [x] Keep all tests green with `npm test`.
- [x] Keep production build green with `npm run build`.

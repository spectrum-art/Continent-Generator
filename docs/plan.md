# Map Explorer Plan

## Milestone 13: Atlas-Grade Geometry + Rendering Overhaul

- [x] Align implementation with `docs/continent-generator-controls.csv`.
- [x] Align implementation with `docs/continent-generator-design-spec.md`.
- [x] Repair metric harness foundations for identity/perf/preset feature vectors.
- [x] Ensure aspect ratio changes regenerate geometry and update map identity (no stretch clone behavior).
- [x] Upgrade landmask/coast pipeline for stronger silhouette control and corner/ocean constraints.
- [x] Strengthen ridge-based mountain shaping inputs and atlas hillshade fields.
- [x] Keep deterministic flow-based river generation with basin/lake handling and prune artifacts.
- [x] Add coastline cleanup behavior so higher coastal smoothing produces cleaner coastlines.
- [x] Add rendering LOD raster strategy (`low`, `base`, `high`) selected by zoom band.
- [x] Add `Lat/Long Grid` advanced toggle and render overlay.
- [x] Add in-app perf suite trigger (`mid`/`full`/`high` probes with avg/p95/worst/hitch metrics).
- [x] Add in-app preset distinctness trigger against fixed seeds.
- [x] Add/expand automated tests:
- [x] aspect-ratio identity change
- [x] export/import identity round-trip with aspect ratio
- [x] coastal smoothing monotonic perimeter behavior
- [x] preset distinctness suite pass criteria
- [x] Keep all tests green with `npm test`.
- [x] Keep production build green with `npm run build`.

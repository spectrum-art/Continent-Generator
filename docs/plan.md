# Map Explorer Plan

## Milestone 9: Believable Geography + Verification

- [x] `9A` debug render modes:
- [x] Add overlay-selectable modes for elevation/moisture/ocean-mask/flow/lake-basin/river-trace.
- [x] Add keybind cycling and chunk reload on mode change.
- [x] Gate with `npm test` and `npm run build`.

- [x] `9B` water seam verification:
- [x] Keep macro overlap determinism tests for water class + shade scalar.
- [x] Add chunk-boundary stability test for ocean visual scalar.
- [x] Gate with `npm test` and `npm run build`.

- [x] `9C` hydrology v3 rivers:
- [x] Replace fragmented river selection with deterministic source scoring + downhill tracing + merge handling.
- [x] Add deterministic termination accessor and hydrology assertions (coverage/long component/sink ratio).
- [x] Gate with `npm test` and `npm run build`.

- [x] `9D` lakes v3:
- [x] Keep macro flood-fill ocean/lake split.
- [x] Add lake tendril pruning + compactness filtering in generator.
- [x] Add compactness/tendril tests for sampled lake components.
- [x] Gate with `npm test` and `npm run build`.

- [x] `9E` shoreline coherence:
- [x] Keep ocean-only shoreline classification and tightened band.
- [x] Add tests for ocean adjacency, coverage cap, and isolated shoreline thread ratio.
- [x] Gate with `npm test` and `npm run build`.

- [x] `9F` elevation readability + bias guard:
- [x] Strengthen main-view land shading contrast.
- [x] Add elevation directional isotropy sanity test.
- [x] Gate with `npm test` and `npm run build`.

- [x] `9G` palette + river integration polish:
- [x] Update single-source palette for clearer water/lake/river/rock separation.
- [x] Soften river shading to reduce overlay-like appearance.
- [x] Gate with `npm test` and `npm run build`.

- [x] `9H` docs update:
- [x] Refresh `docs/spec.md` with Milestone 9 criteria and tuned constants.
- [x] Update this checklist with completed checkpoints.

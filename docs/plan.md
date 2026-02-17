# Map Explorer Plan

## Milestone 7.5: Seam Fix + Rivers/Lakes Tuning + Minimap/UI + Perf

- [x] `A1` minimap supersampling (`128 -> 192` internal render size).
- [x] Gate `A1` with `npm test` and `npm run build`.
- [x] `A2` legend key toggle UI (default hidden, no layout space when closed).
- [x] Gate `A2` with `npm test` and `npm run build`.

- [x] `B1` migrate water classification to world-anchored hydro macro basis.
- [x] Gate `B1` with `npm test` and `npm run build`.
- [x] `B2` add overlap consistency seam test for macro-basis water classification.
- [x] Gate `B2` with `npm test` and `npm run build`.

- [x] `C1` tune river source density and pruning (min length + elevation drop).
- [x] Gate `C1` with `npm test` and `npm run build`.
- [x] `C2` add basin-based lake filtering on the same macro basis.
- [x] Gate `C2` with `npm test` and `npm run build`.
- [x] `C3` add/raise river-lake coverage and connectivity assertions:
- [x] River coverage target `0.5%..4%` in `256x256` (seed `default`).
- [x] Largest river component `>= 60`.
- [x] Lake basin count in `1..12`.
- [x] Gate `C3` with `npm test` and `npm run build`.

- [x] `D1` add WASD camera movement with zoom-scaled speed, Shift boost, and Space stress pause.
- [x] Gate `D1` with `npm test` and `npm run build`.

- [x] `E1` apply chunk-level rendering optimization (chunk tile cache; one graphics object per chunk).
- [x] Gate `E1` with `npm test` and `npm run build`.
- [x] `E2` expose stress performance verification status in overlay (`ok/warn/idle`).
- [x] Gate `E2` with `npm test` and `npm run build`.

- [x] `F1` update outline toggle wording/behavior to zoom-gated auto borders.
- [x] Gate `F1` with `npm test` and `npm run build`.

- [x] `G1` update docs/spec and docs/plan with milestone7.5 outcomes and tuned constants.

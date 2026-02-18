# Map Explorer Plan

## Milestone 17: Continuous-Field Terrain Refactor + Self-Evaluating Realism Gates

- [x] `ms17: snapshot harness v2 + structural metrics (baseline)`
- [x] `ms17: continuous macro elevation refactor`
- [x] `ms17: global stress/orientation field`
- [x] `ms17: anisotropic ridge synthesis`
- [x] `ms17: valley/erosion feedback (lightweight)`
- [x] `ms17: basin-driven hydrology + trunk rivers`
- [x] `ms17: global hillshade rewrite (no wedges)`
- [x] `ms17: rectangle mitigation via continuous warps`
- [x] `ms17: tests + docs + perf sanity`

## Completed Work
- [x] Added deterministic snapshot case matrix and PNG montage output.
- [x] Added image-derived artifact detectors for wedges, radial ridge patterns, silhouette boxiness, and river hierarchy.
- [x] Refactored macro elevation away from nearest/second plate partitioning to continuous weighted fields.
- [x] Introduced smoothed global stress/orientation vector field for ridge direction control.
- [x] Upgraded ridge synthesis to anisotropic branch/spine structure.
- [x] Added lightweight flow-feedback valley pass prior to final hydrology routing.
- [x] Enforced Region+ trunk river guarantees with inland basin targeting.
- [x] Rewrote hillshade to full-field smoothed gradients with NW lighting.
- [x] Added seeded core warps to reduce high-land rectangular silhouettes.
- [x] Kept deterministic behavior, tests green, and build green.
- [x] Snapshot realism gate matrix currently passes all configured cases (`12/12`).

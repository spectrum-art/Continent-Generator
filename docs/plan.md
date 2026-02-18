# Map Explorer Plan

## Milestone 16: Ridges + Inland Drainage

- [x] `ms16: diagnostics + baseline snapshot harness (non-UI)`
- [x] `ms16: ridge/valley synthesis pass (mountain morphology)`
- [x] `ms16: basin-driven river sources + routing (inland rivers)`
- [x] `ms16: rectangle mitigation for high land fraction (shape realism)`
- [x] `ms16: hillshade verification + artifact elimination (no sector wedges)`
- [x] `ms16: tests + docs + perf sanity`

- [x] Add deterministic diagnostics helpers for inland rivers, ridge-energy, and silhouette metrics.
- [x] Refactor elevation synthesis to produce oriented ridges and carved inter-ridge valleys.
- [x] Upgrade river generation to trunk + tributary routing with inland source bias.
- [x] Run two-step river incision with flow recompute between passes.
- [x] Replace edge-aligned rectangle bias with warped macro-frame falloff.
- [x] Upgrade hillshade math to full-field directional gradients and add wedge-regression test.
- [x] Add Milestone 16 realism tests (inland drainage, ridge energy, rectangle mitigation).
- [x] Keep determinism/export-import/aspect identity guarantees green.
- [x] Keep `npm test` and `npm run build` green.

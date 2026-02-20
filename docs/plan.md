# Milestone 2 Plan

## Commit Checklist

1. `milestone2: warped plate coordinates + curved boundaries`
- [x] Warp plate-space coordinates with deterministic low-frequency vector fields
- [x] Add controlled boundary jitter/fragmentation
- [x] Expose warped plate debug fields

2. `milestone2: tangent-aligned orogeny + triple junction amplification`
- [x] Derive boundary tangent vectors
- [x] Align orogeny modulation to boundary tangents
- [x] Amplify uplift in triple-junction zones

3. `milestone2: interior basin field + relief modulation`
- [x] Generate deterministic interior basin field
- [x] Subtract basin field in macro relief composition
- [x] Emit interior basin debug output

4. `milestone2: hillshade vertical exaggeration + CLI timing`
- [x] Add `hillshade_vertical_exaggeration` config default `6.0`
- [x] Pass exaggeration into hillshade derivation
- [x] Keep runtime timing in `meta.json` only

5. `milestone2: docs + tests updated`
- [x] Update spec with Milestone 2 acceptance criteria
- [x] Add tests for warped plate curvature and new tectonic fields
- [x] Add hillshade exaggeration behavior test
- [x] Validate full `2048x1024` run and debug outputs

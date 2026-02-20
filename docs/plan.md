# Milestone 0 Plan

## Commit Checklist

1. `milestone0: scaffold python project structure`
- [x] Add `pyproject.toml` and `.gitignore`
- [x] Add package/module skeleton for `terrain/` and `cli/`
- [x] Add docs (`docs/spec.md`, `docs/plan.md`)
- [x] Update `README.md` with setup/run expectations
- [x] Run tests

2. `milestone0: seed parsing + deterministic rng streams`
- [x] Implement seed dictionaries and parser
- [x] Implement stable seed hashing
- [x] Implement forkable RNG stream utility
- [x] Add/expand seed parsing tests
- [x] Run tests

3. `milestone0: land mask + metrics (dominant continent + islands)`
- [x] Implement noise utilities sufficient for mask potential
- [x] Implement land mask generation with smoothing and dominant-component targeting
- [x] Implement connected components + dominant ratio metrics
- [x] Add sanity tests for land fraction and dominant ratio
- [x] Run tests

4. `milestone0: heightfield pipeline + hillshade + io + cli`
- [x] Implement configurable height pipeline
- [x] Implement hillshade and preview conversions
- [x] Implement output writers and metadata
- [x] Implement CLI arguments and generation flow
- [x] Add determinism test
- [x] Run tests and a full `2048x1024` sample generation

5. `milestone0: polish docs + tighten tests`
- [x] Tighten docs and examples
- [x] Stabilize tests and thresholds
- [x] Verify deterministic metadata handling
- [x] Re-run tests and final sample generation

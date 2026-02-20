# Milestone 0 Plan

## Commit Checklist

1. `milestone0: scaffold python project structure`
- [ ] Add `pyproject.toml` and `.gitignore`
- [ ] Add package/module skeleton for `terrain/` and `cli/`
- [ ] Add docs (`docs/spec.md`, `docs/plan.md`)
- [ ] Update `README.md` with setup/run expectations
- [ ] Run tests

2. `milestone0: seed parsing + deterministic rng streams`
- [ ] Implement seed dictionaries and parser
- [ ] Implement stable seed hashing
- [ ] Implement forkable RNG stream utility
- [ ] Add/expand seed parsing tests
- [ ] Run tests

3. `milestone0: land mask + metrics (dominant continent + islands)`
- [ ] Implement noise utilities sufficient for mask potential
- [ ] Implement land mask generation with smoothing and dominant-component targeting
- [ ] Implement connected components + dominant ratio metrics
- [ ] Add sanity tests for land fraction and dominant ratio
- [ ] Run tests

4. `milestone0: heightfield pipeline + hillshade + io + cli`
- [ ] Implement configurable height pipeline
- [ ] Implement hillshade and preview conversions
- [ ] Implement output writers and metadata
- [ ] Implement CLI arguments and generation flow
- [ ] Add determinism test
- [ ] Run tests and a full `2048x1024` sample generation

5. `milestone0: polish docs + tighten tests`
- [ ] Tighten docs and examples
- [ ] Stabilize tests and thresholds
- [ ] Verify deterministic metadata handling
- [ ] Re-run tests and final sample generation

# Milestone 1 Plan

## Commit Checklist

1. `milestone1: specs + plan + scaffolding for tectonics`
- [x] Update docs with Milestone 1 acceptance criteria
- [x] Add `terrain/tectonics.py` scaffolding
- [x] Add tectonics config placeholders

2. `milestone1: plate partition + boundary classification`
- [ ] Implement deterministic plate count, site sampling, and plate partition
- [ ] Implement plate motion vectors
- [ ] Implement boundary detection and convergent/divergent/transform classification
- [ ] Add deterministic tectonics tests
- [ ] Add rough debug output support for plates and boundary type

3. `milestone1: tectonic intensity fields + crust thickness + shelf model`
- [ ] Implement fast repeated box blur utility
- [ ] Derive orogeny/rift/transform intensity fields
- [ ] Add crust thickness and shelf proximity fields
- [ ] Wire debug PNG outputs for tectonic float fields

4. `milestone1: integrate tectonics into heightfield + improve hillshade realism`
- [ ] Refactor heightfield to use tectonic fields for structured uplift and rift subsidence
- [ ] Add plate-fabric anisotropy for directional belts
- [ ] Preserve deterministic output guarantees

5. `milestone1: runtime logging + tighten tests + docs polish`
- [ ] Add generation timing printout and `meta.json` runtime fields
- [ ] Keep timing out of `deterministic_meta.json`
- [ ] Update README for new outputs
- [ ] Tighten tests for tectonic properties and determinism
- [ ] Validate full `2048x1024` run with `--overwrite`

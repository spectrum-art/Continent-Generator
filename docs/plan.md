# Milestone 1 Plan

## Commit Checklist

1. `milestone1: specs + plan + scaffolding for tectonics`
- [x] Update docs with Milestone 1 acceptance criteria
- [x] Add `terrain/tectonics.py` scaffolding
- [x] Add tectonics config placeholders

2. `milestone1: plate partition + boundary classification`
- [x] Implement deterministic plate count, site sampling, and plate partition
- [x] Implement plate motion vectors
- [x] Implement boundary detection and convergent/divergent/transform classification
- [x] Add deterministic tectonics tests
- [x] Add rough debug output support for plates and boundary type

3. `milestone1: tectonic intensity fields + crust thickness + shelf model`
- [x] Implement fast repeated box blur utility
- [x] Derive orogeny/rift/transform intensity fields
- [x] Add crust thickness and shelf proximity fields
- [x] Wire debug PNG outputs for tectonic float fields

4. `milestone1: integrate tectonics into heightfield + improve hillshade realism`
- [x] Refactor heightfield to use tectonic fields for structured uplift and rift subsidence
- [x] Add plate-fabric anisotropy for directional belts
- [x] Preserve deterministic output guarantees

5. `milestone1: runtime logging + tighten tests + docs polish`
- [x] Add generation timing printout and `meta.json` runtime fields
- [x] Keep timing out of `deterministic_meta.json`
- [x] Update README for new outputs
- [x] Tighten tests for tectonic properties and determinism
- [x] Validate full `2048x1024` run with `--overwrite`

# Map Explorer Plan

## Milestone 2: Deterministic Generator + Tests

- [x] Add deterministic generator module under `src/gen/`.
- [x] Define `TileType`, `CHUNK_SIZE`, and chunk utility APIs.
- [x] Implement deterministic `getTileAt(seed, x, y)` using seeded noise/hash logic.
- [x] Implement `generateChunk(seed, cx, cy)` as a 64x64 matrix.
- [x] Ensure chunk generation agrees with `getTileAt` at chunk coordinates.
- [x] Add Vitest coverage for determinism, chunk equivalence, chunk boundaries, and distribution sanity.
- [x] Keep renderer behavior unchanged for this milestone.
- [x] Update `docs/spec.md` acceptance criteria.
- [x] Run `npm test` and fix failures.
- [x] Run `npm run build` and fix failures.
- [x] Commit changes with message: `milestone: deterministic generator + tests`.

# Map Explorer Plan

## Milestone 4: Hex Rendering + Streaming

- [x] Add pointy-top axial hex math helpers in `src/render/hex.ts`.
- [x] Add unit tests for hex math round-trip and neighbor spacing.
- [x] Keep generator module pure and unchanged in `src/gen/*`.
- [x] Migrate renderer from square tiles to hex tiles.
- [x] Keep deterministic sampling by mapping axial `(q, r)` to generator coordinates.
- [x] Keep chunk streaming with `CHUNK_SIZE = 64` and prefetch margin.
- [x] Use render chunk keys `${cq}:${cr}` and unload out-of-range chunks.
- [x] Keep pan/zoom interaction behavior.
- [x] Keep seed overlay input and regenerate on apply.
- [x] Show center axial coords + zoom + loaded chunks in overlay.
- [x] Update `docs/spec.md` acceptance criteria for hex milestone.
- [x] Create commit A: `milestone4: hex math helpers + tests`.
- [x] Run `npm test` and `npm run build` after commit A.
- [x] Create commit B: `milestone4: hex rendering + streaming`.
- [x] Run `npm test` and `npm run build` after commit B.

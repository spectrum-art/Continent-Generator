# Map Explorer Plan

## Milestone 3: Generator Rendering + Streaming

- [x] Replace static grid renderer with generator-driven chunk tiles.
- [x] Use fixed `TILE_SIZE` and `CHUNK_SIZE = 64` for render chunk layout.
- [x] Keep pan/zoom camera behavior unchanged.
- [x] Implement viewport-based chunk streaming with 1-chunk prefetch margin.
- [x] Keep loaded chunks in `Map<string, Chunk>` with render keys `${cx}:${cy}`.
- [x] Load missing chunks and unload out-of-range chunks during camera movement.
- [x] Add debug overlay for seed, camera world coords, zoom, loaded chunk count.
- [x] Add overlay seed input and regenerate visible world on seed change.
- [x] Keep generator logic pure in `src/gen/*` and renderer logic in `src/render/*`.
- [x] Update `docs/spec.md` for Milestone 3 acceptance criteria.
- [x] Create commit A: `milestone3: renderer uses generator tiles (no streaming yet)`.
- [x] Run `npm test` and `npm run build` after commit A.
- [x] Create commit B: `milestone3: chunk streaming load/unload + debug overlay`.
- [x] Run `npm test` and `npm run build` after commit B.

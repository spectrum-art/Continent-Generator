# Map Explorer Spec

## Scope
Build a static web app map explorer using TypeScript, Vite, and PixiJS.

## Non-Goals
- No backend or network APIs
- No runtime AI features
- No tile texture/image assets; use simple tile types/colors
- No generator redesign for hex terrain; renderer maps axial coords to existing generator sampling

## Acceptance Criteria
1. Running `npm run dev` opens a page where the Pixi canvas fills the entire browser viewport.
2. Tiles rendered in Pixi are hex tiles (pointy-top orientation) driven by deterministic generator sampling.
3. Axial coordinates `(q, r)` are used in renderer math and sampled as generator coordinates via `getTileAt(seed, q, r)`/`generateChunk(seed, cq, cr)`.
4. Mouse wheel zooms camera in and out.
5. Zoom level is clamped to a reasonable range to prevent unusable scales.
6. Rendering and camera code lives in `src/render/`.
7. App entry point remains `src/main.ts`.
8. Deterministic generator module exists in `src/gen/` with:
   - `TileType = "water" | "sand" | "grass" | "forest" | "mountain"`
   - `CHUNK_SIZE = 64`
   - `getTileAt(seed, x, y)`, `chunkCoord(n)`, `getChunkKey(x, y)`, `generateChunk(seed, cx, cy)`
9. `generateChunk` returns a 64x64 tile matrix and agrees with `getTileAt` for all chunk cells.
10. Vitest coverage in `tests/` validates determinism, chunk equivalence, boundary continuity, and distribution sanity.
11. Chunk streaming keeps an infinite scrolling illusion by loading/unloading chunks near the viewport.
12. Renderer keeps a `Map<string, Chunk>` of loaded chunks and chunk keys use `${cq}:${cr}` in render state.
13. A debug overlay shows: seed, center axial coordinates, zoom, and loaded chunk count.
14. Changing seed from the overlay regenerates rendered chunks.
15. `src/render/hex.ts` provides `axialToPixel`, `pixelToAxial`, and `roundAxial`.
16. Hex math tests validate round-trip conversion and neighbor spacing.
17. Running `npm test` passes.
18. Running `npm run build` succeeds without errors.

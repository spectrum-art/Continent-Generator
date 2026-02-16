# Map Explorer Spec

## Scope
Build a static web app map explorer using TypeScript, Vite, and PixiJS.

## Non-Goals
- No backend or network APIs
- No runtime AI features
- No tile texture/image assets; use simple tile types/colors
- Do not wire generator output into renderer in this milestone

## Acceptance Criteria
1. Running `npm run dev` opens a page where the Pixi canvas fills the entire browser viewport.
2. A visible tile grid is rendered using simple colored rectangles with clear boundaries.
3. Click-and-drag with the mouse pans the camera smoothly across the tile grid.
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
11. Running `npm test` passes.
12. Running `npm run build` succeeds without errors.

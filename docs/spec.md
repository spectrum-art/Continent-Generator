# Map Explorer Spec

## Scope
Build a static web app map explorer using TypeScript, Vite, and PixiJS.

## Non-Goals
- No backend or network APIs
- No runtime AI features
- No tile texture/image assets; use simple tile types/colors
- No platform-specific build dependencies

## Acceptance Criteria
1. Running `npm run dev` opens a page where the Pixi canvas fills the entire browser viewport.
2. Tiles rendered in Pixi are pointy-top hexes with deterministic generator sampling.
3. Hex skew/shear is corrected by sampling terrain through an unbiased axial sampling basis.
4. Mouse drag pans camera smoothly and mouse wheel zoom remains clamped to configured limits.
5. Rendering and camera/streaming logic lives in `src/render/` and entry point remains `src/main.ts`.
6. Deterministic generator module exists in `src/gen/` with `CHUNK_SIZE = 64` and APIs: `elevationAt`, `moistureAt`, `getTileAt`, `chunkCoord`, `getChunkKey`, `generateChunk`.
7. `TileType` includes: `water`, `sand`, `grass`, `forest`, `mountain`, `rock`.
8. `elevationAt(seed, x, y)` and `moistureAt(seed, x, y)` each return values in `[0,1]`.
9. `generateChunk(seed, cx, cy)` returns a 64x64 tile matrix and agrees with `getTileAt` for chunk cells.
10. Chunk streaming keeps an infinite-world illusion by loading/unloading nearby chunk containers with key format `${cq}:${cr}`.
11. Debug overlay shows active seed, center axial coordinates, zoom, and loaded chunk count.
12. Overlay contains a 128x128 minimap that updates at a throttled interval and reflects nearby terrain.
13. Changing seed in the overlay regenerates visible chunks.
14. Seed is shareable through `?seed=...`: value is read on load and updated on apply using `history.replaceState`.
15. `src/render/hex.ts` provides `axialToPixel`, `pixelToAxial`, `roundAxial`, and symmetric axial direction helpers.
16. Vitest coverage includes generator determinism/chunk checks/distribution and hex math round-trip + symmetry checks.
17. Optional render performance mode can disable hex outlines to reduce per-chunk draw overhead.
18. Rivers/lakes are deferred from Milestone 5 to preserve stability after required checkpoints.
19. Running `npm test` passes.
20. Running `npm run build` succeeds without errors.

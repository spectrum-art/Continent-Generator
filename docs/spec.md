# Map Explorer Spec

## Scope
Build a static web app map renderer using TypeScript, Vite, and PixiJS. This milestone only covers rendering and camera controls.

## Non-Goals
- No procedural generation logic
- No backend or network APIs
- No runtime AI features
- No image assets; tiles are solid colors

## Acceptance Criteria
1. Running `npm run dev` opens a page where the Pixi canvas fills the entire browser viewport.
2. A visible tile grid is rendered using simple colored rectangles with clear boundaries.
3. Click-and-drag with the mouse pans the camera smoothly across the tile grid.
4. Mouse wheel zooms camera in and out.
5. Zoom level is clamped to a reasonable range to prevent unusable scales.
6. Rendering and camera code lives in `src/render/`.
7. App entry point remains `src/main.ts`.
8. Running `npm run build` succeeds without errors.

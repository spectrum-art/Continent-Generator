import { Application, Container, Graphics } from 'pixi.js';
import { CHUNK_SIZE, generateChunk, type TileType } from '../gen/generator';

const TILE_SIZE = 16;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.5;
const ZOOM_SENSITIVITY = 0.0012;
const DEFAULT_SEED = 'default';
const INITIAL_CHUNK_RADIUS = 2;

const TILE_COLORS: Record<TileType, number> = {
  water: 0x2d6cdf,
  sand: 0xe2cf89,
  grass: 0x63b359,
  forest: 0x2f7a43,
  mountain: 0x8d8f98,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createChunkGraphic(seed: string, cx: number, cy: number): Graphics {
  const graphic = new Graphics();
  const chunkTiles = generateChunk(seed, cx, cy);
  const chunkWorldX = cx * CHUNK_SIZE * TILE_SIZE;
  const chunkWorldY = cy * CHUNK_SIZE * TILE_SIZE;

  for (let y = 0; y < CHUNK_SIZE; y += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const px = chunkWorldX + x * TILE_SIZE;
      const py = chunkWorldY + y * TILE_SIZE;
      const tile = chunkTiles[y][x];

      graphic.rect(px, py, TILE_SIZE, TILE_SIZE).fill(TILE_COLORS[tile]);
      graphic.rect(px, py, TILE_SIZE, TILE_SIZE).stroke({
        color: 0x101010,
        width: 1,
        alpha: 0.12,
      });
    }
  }

  return graphic;
}

function drawInitialTerrain(world: Container): void {
  for (let cy = -INITIAL_CHUNK_RADIUS; cy <= INITIAL_CHUNK_RADIUS; cy += 1) {
    for (let cx = -INITIAL_CHUNK_RADIUS; cx <= INITIAL_CHUNK_RADIUS; cx += 1) {
      world.addChild(createChunkGraphic(DEFAULT_SEED, cx, cy));
    }
  }
}

export async function startMapExplorer(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1e2124',
    antialias: false,
  });

  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  app.canvas.style.display = 'block';
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.position.set(window.innerWidth / 2, window.innerHeight / 2);
  app.stage.addChild(world);

  drawInitialTerrain(world);

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  app.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    isDragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
  });

  window.addEventListener('pointermove', (event: PointerEvent) => {
    if (!isDragging) {
      return;
    }

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    world.position.x += dx;
    world.position.y += dy;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  app.canvas.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      event.preventDefault();

      const rect = app.canvas.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      const oldScale = world.scale.x;
      const worldX = (cursorX - world.position.x) / oldScale;
      const worldY = (cursorY - world.position.y) / oldScale;
      const nextScale = clamp(
        oldScale * Math.exp(-event.deltaY * ZOOM_SENSITIVITY),
        MIN_ZOOM,
        MAX_ZOOM,
      );

      world.scale.set(nextScale);
      world.position.set(
        cursorX - worldX * nextScale,
        cursorY - worldY * nextScale,
      );
    },
    { passive: false },
  );
}

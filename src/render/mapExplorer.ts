import { Application, Container, Graphics } from 'pixi.js';
import {
  CHUNK_SIZE,
  chunkCoord,
  generateChunk,
  type TileType,
} from '../gen/generator';

const TILE_SIZE = 16;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.5;
const ZOOM_SENSITIVITY = 0.0012;
const CHUNK_PREFETCH_MARGIN = 1;
const DEFAULT_SEED = 'default';

type LoadedChunk = {
  cx: number;
  cy: number;
  container: Container;
};

type OverlayElements = {
  root: HTMLDivElement;
  seedInput: HTMLInputElement;
  seedValue: HTMLSpanElement;
  cameraValue: HTMLSpanElement;
  zoomValue: HTMLSpanElement;
  loadedChunksValue: HTMLSpanElement;
};

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

function getRenderChunkKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

function createChunkContainer(seed: string, cx: number, cy: number): Container {
  const chunkContainer = new Container();
  chunkContainer.position.set(cx * CHUNK_SIZE * TILE_SIZE, cy * CHUNK_SIZE * TILE_SIZE);

  const chunkGraphics = new Graphics();
  const chunkTiles = generateChunk(seed, cx, cy);
  for (let y = 0; y < CHUNK_SIZE; y += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      const tile = chunkTiles[y][x];

      chunkGraphics.rect(px, py, TILE_SIZE, TILE_SIZE).fill(TILE_COLORS[tile]);
      chunkGraphics.rect(px, py, TILE_SIZE, TILE_SIZE).stroke({
        color: 0x101010,
        width: 1,
        alpha: 0.12,
      });
    }
  }

  chunkContainer.addChild(chunkGraphics);
  return chunkContainer;
}

function createOverlay(seed: string): OverlayElements {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.top = '8px';
  root.style.left = '8px';
  root.style.padding = '10px';
  root.style.background = 'rgba(18, 18, 18, 0.82)';
  root.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  root.style.borderRadius = '8px';
  root.style.color = '#e8e8e8';
  root.style.font = '12px/1.4 monospace';
  root.style.zIndex = '10';
  root.style.minWidth = '220px';

  const seedRow = document.createElement('div');
  const seedLabel = document.createElement('span');
  seedLabel.textContent = 'Seed: ';
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.value = seed;
  seedInput.style.width = '120px';
  seedInput.style.marginRight = '6px';
  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.textContent = 'Apply';
  applyButton.style.cursor = 'pointer';
  seedRow.append(seedLabel, seedInput, applyButton);

  const seedValueRow = document.createElement('div');
  const seedValueLabel = document.createElement('span');
  seedValueLabel.textContent = 'Active seed: ';
  const seedValue = document.createElement('span');
  seedValue.textContent = seed;
  seedValueRow.append(seedValueLabel, seedValue);

  const cameraRow = document.createElement('div');
  const cameraLabel = document.createElement('span');
  cameraLabel.textContent = 'Camera world: ';
  const cameraValue = document.createElement('span');
  cameraRow.append(cameraLabel, cameraValue);

  const zoomRow = document.createElement('div');
  const zoomLabel = document.createElement('span');
  zoomLabel.textContent = 'Zoom: ';
  const zoomValue = document.createElement('span');
  zoomRow.append(zoomLabel, zoomValue);

  const chunksRow = document.createElement('div');
  const chunksLabel = document.createElement('span');
  chunksLabel.textContent = 'Loaded chunks: ';
  const loadedChunksValue = document.createElement('span');
  chunksRow.append(chunksLabel, loadedChunksValue);

  root.append(seedRow, seedValueRow, cameraRow, zoomRow, chunksRow);
  document.body.appendChild(root);

  const applySeed = () => {
    const nextSeed = seedInput.value.trim();
    if (nextSeed.length > 0) {
      root.dispatchEvent(new CustomEvent<string>('seedchange', { detail: nextSeed }));
    }
  };

  seedInput.addEventListener('change', applySeed);
  applyButton.addEventListener('click', applySeed);

  return {
    root,
    seedInput,
    seedValue,
    cameraValue,
    zoomValue,
    loadedChunksValue,
  };
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

  const overlay = createOverlay(DEFAULT_SEED);

  const world = new Container();
  world.position.set(window.innerWidth / 2, window.innerHeight / 2);
  app.stage.addChild(world);

  let activeSeed = DEFAULT_SEED;
  const loadedChunks = new Map<string, LoadedChunk>();
  let cameraDirty = true;
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  function clearLoadedChunks(): void {
    for (const chunk of loadedChunks.values()) {
      world.removeChild(chunk.container);
      chunk.container.destroy({ children: true });
    }
    loadedChunks.clear();
  }

  function loadChunk(cx: number, cy: number): void {
    const key = getRenderChunkKey(cx, cy);
    if (loadedChunks.has(key)) {
      return;
    }

    const container = createChunkContainer(activeSeed, cx, cy);
    world.addChild(container);
    loadedChunks.set(key, { cx, cy, container });
  }

  function unloadChunk(key: string): void {
    const chunk = loadedChunks.get(key);
    if (!chunk) {
      return;
    }

    world.removeChild(chunk.container);
    chunk.container.destroy({ children: true });
    loadedChunks.delete(key);
  }

  function refreshChunks(): void {
    const invScale = 1 / world.scale.x;
    const minWorldX = (0 - world.position.x) * invScale;
    const minWorldY = (0 - world.position.y) * invScale;
    const maxWorldX = (window.innerWidth - world.position.x) * invScale;
    const maxWorldY = (window.innerHeight - world.position.y) * invScale;

    const minTileX = Math.floor(minWorldX / TILE_SIZE);
    const minTileY = Math.floor(minWorldY / TILE_SIZE);
    const maxTileX = Math.floor(maxWorldX / TILE_SIZE);
    const maxTileY = Math.floor(maxWorldY / TILE_SIZE);

    const minChunkX = chunkCoord(minTileX) - CHUNK_PREFETCH_MARGIN;
    const minChunkY = chunkCoord(minTileY) - CHUNK_PREFETCH_MARGIN;
    const maxChunkX = chunkCoord(maxTileX) + CHUNK_PREFETCH_MARGIN;
    const maxChunkY = chunkCoord(maxTileY) + CHUNK_PREFETCH_MARGIN;

    const needed = new Set<string>();
    for (let cy = minChunkY; cy <= maxChunkY; cy += 1) {
      for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
        const key = getRenderChunkKey(cx, cy);
        needed.add(key);
        loadChunk(cx, cy);
      }
    }

    for (const key of loadedChunks.keys()) {
      if (!needed.has(key)) {
        unloadChunk(key);
      }
    }
  }

  function updateOverlay(): void {
    const centerScreenX = window.innerWidth / 2;
    const centerScreenY = window.innerHeight / 2;
    const cameraWorldX = (centerScreenX - world.position.x) / world.scale.x;
    const cameraWorldY = (centerScreenY - world.position.y) / world.scale.y;

    overlay.seedValue.textContent = activeSeed;
    overlay.cameraValue.textContent = `${cameraWorldX.toFixed(1)}, ${cameraWorldY.toFixed(1)}`;
    overlay.zoomValue.textContent = world.scale.x.toFixed(3);
    overlay.loadedChunksValue.textContent = `${loadedChunks.size}`;
  }

  overlay.root.addEventListener('seedchange', (event: Event) => {
    const seedEvent = event as CustomEvent<string>;
    if (seedEvent.detail === activeSeed) {
      return;
    }
    activeSeed = seedEvent.detail;
    clearLoadedChunks();
    cameraDirty = true;
  });

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
    cameraDirty = true;
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
      cameraDirty = true;
    },
    { passive: false },
  );

  window.addEventListener('resize', () => {
    cameraDirty = true;
  });

  app.ticker.add(() => {
    if (cameraDirty) {
      refreshChunks();
      cameraDirty = false;
    }
    updateOverlay();
  });
}

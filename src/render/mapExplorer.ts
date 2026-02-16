import { Application, Container, Graphics } from 'pixi.js';
import {
  CHUNK_SIZE,
  chunkCoord,
  getTileAt,
  type TileType,
} from '../gen/generator';
import {
  HEX_SIZE,
  axialToSample,
  axialToPixel,
  hexPolygonPoints,
  pixelToAxial,
  roundAxial,
} from './hex';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.5;
const ZOOM_SENSITIVITY = 0.0012;
const CHUNK_PREFETCH_MARGIN = 1;
const AXIAL_VIEW_PADDING = 6;
const DEFAULT_SEED = 'default';

type LoadedChunk = {
  cq: number;
  cr: number;
  container: Container;
};

type OverlayElements = {
  root: HTMLDivElement;
  seedValue: HTMLSpanElement;
  axialValue: HTMLSpanElement;
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

function getRenderChunkKey(cq: number, cr: number): string {
  return `${cq}:${cr}`;
}

function screenToWorld(world: Container, screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - world.position.x) / world.scale.x,
    y: (screenY - world.position.y) / world.scale.y,
  };
}

function createChunkContainer(seed: string, cq: number, cr: number): Container {
  const chunkContainer = new Container();
  const baseQ = cq * CHUNK_SIZE;
  const baseR = cr * CHUNK_SIZE;
  const basePixel = axialToPixel(baseQ, baseR, HEX_SIZE);
  chunkContainer.position.set(basePixel.x, basePixel.y);

  const chunkGraphics = new Graphics();
  for (let localR = 0; localR < CHUNK_SIZE; localR += 1) {
    for (let localQ = 0; localQ < CHUNK_SIZE; localQ += 1) {
      const q = baseQ + localQ;
      const r = baseR + localR;
      const center = axialToPixel(q, r, HEX_SIZE);
      const sample = axialToSample(q, r);
      const tile = getTileAt(seed, sample.x, sample.y);
      const points = hexPolygonPoints(center.x - basePixel.x, center.y - basePixel.y, HEX_SIZE);

      chunkGraphics.poly(points, true).fill(TILE_COLORS[tile]);
      chunkGraphics.poly(points, true).stroke({
        color: 0x101010,
        width: 1,
        alpha: 0.18,
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

  const axialRow = document.createElement('div');
  const axialLabel = document.createElement('span');
  axialLabel.textContent = 'Center axial: ';
  const axialValue = document.createElement('span');
  axialRow.append(axialLabel, axialValue);

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

  root.append(seedRow, seedValueRow, axialRow, zoomRow, chunksRow);
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
    seedValue,
    axialValue,
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

  function loadChunk(cq: number, cr: number): void {
    const key = getRenderChunkKey(cq, cr);
    if (loadedChunks.has(key)) {
      return;
    }

    const container = createChunkContainer(activeSeed, cq, cr);
    world.addChild(container);
    loadedChunks.set(key, { cq, cr, container });
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
    const corners = [
      screenToWorld(world, 0, 0),
      screenToWorld(world, window.innerWidth, 0),
      screenToWorld(world, 0, window.innerHeight),
      screenToWorld(world, window.innerWidth, window.innerHeight),
    ];

    let minQ = Number.POSITIVE_INFINITY;
    let minR = Number.POSITIVE_INFINITY;
    let maxQ = Number.NEGATIVE_INFINITY;
    let maxR = Number.NEGATIVE_INFINITY;

    for (const corner of corners) {
      const axial = pixelToAxial(corner.x, corner.y, HEX_SIZE);
      minQ = Math.min(minQ, axial.q);
      minR = Math.min(minR, axial.r);
      maxQ = Math.max(maxQ, axial.q);
      maxR = Math.max(maxR, axial.r);
    }

    const minChunkQ = chunkCoord(Math.floor(minQ) - AXIAL_VIEW_PADDING) - CHUNK_PREFETCH_MARGIN;
    const minChunkR = chunkCoord(Math.floor(minR) - AXIAL_VIEW_PADDING) - CHUNK_PREFETCH_MARGIN;
    const maxChunkQ = chunkCoord(Math.ceil(maxQ) + AXIAL_VIEW_PADDING) + CHUNK_PREFETCH_MARGIN;
    const maxChunkR = chunkCoord(Math.ceil(maxR) + AXIAL_VIEW_PADDING) + CHUNK_PREFETCH_MARGIN;

    const needed = new Set<string>();
    for (let cr = minChunkR; cr <= maxChunkR; cr += 1) {
      for (let cq = minChunkQ; cq <= maxChunkQ; cq += 1) {
        const key = getRenderChunkKey(cq, cr);
        needed.add(key);
        loadChunk(cq, cr);
      }
    }

    for (const key of loadedChunks.keys()) {
      if (!needed.has(key)) {
        unloadChunk(key);
      }
    }
  }

  function updateOverlay(): void {
    const centerWorld = screenToWorld(world, window.innerWidth / 2, window.innerHeight / 2);
    const centerAxial = pixelToAxial(centerWorld.x, centerWorld.y, HEX_SIZE);
    const roundedCenter = roundAxial(centerAxial.q, centerAxial.r);

    overlay.seedValue.textContent = activeSeed;
    overlay.axialValue.textContent = `${roundedCenter.q}, ${roundedCenter.r}`;
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
      const worldPoint = screenToWorld(world, cursorX, cursorY);
      const nextScale = clamp(
        oldScale * Math.exp(-event.deltaY * ZOOM_SENSITIVITY),
        MIN_ZOOM,
        MAX_ZOOM,
      );

      world.scale.set(nextScale);
      world.position.set(
        cursorX - worldPoint.x * nextScale,
        cursorY - worldPoint.y * nextScale,
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

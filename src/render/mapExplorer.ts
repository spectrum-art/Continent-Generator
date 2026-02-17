import { Application, Container, Graphics, Sprite } from 'pixi.js';
import {
  CHUNK_SIZE,
  chunkCoord,
  elevationAt,
  flowAccumulationAt,
  isRiverSourceAt,
  lakeBasinIdAt,
  moistureAt,
  getTileAt,
  waterClassAt,
  waterShadeScalarAt,
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
import { colorForRenderedTile } from './style';
import { LEGEND_ORDER, TILE_PALETTE, TILE_PALETTE_CSS } from './palette';
import { minimapColorForPixel } from './minimap';
import { PerfProfiler, type PerfBucket, type PerfSnapshot } from './perf';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.5;
const ZOOM_SENSITIVITY = 0.0012;
const CHUNK_PREFETCH_MARGIN = 1;
const AXIAL_VIEW_PADDING = 6;
const DEFAULT_SEED = 'default';
const OUTLINE_ZOOM_THRESHOLD = 1.35;
const MINIMAP_SIZE = 192;
const MINIMAP_DISPLAY_SIZE = 128;
const MINIMAP_UPDATE_MS = 250;
const MINIMAP_SAMPLE_STEP = 2;
const MINIMAP_WORLD_UNITS_PER_PIXEL = HEX_SIZE * 0.65;
const LOD_ZOOM_THRESHOLD = 0.8;
const BASE_KEYBOARD_PAN_SPEED = 620;
const BOOST_KEYBOARD_MULTIPLIER = 2.2;
const DEBUG_MODES = [
  'normal',
  'elevation',
  'moisture',
  'ocean-mask',
  'flow',
  'lake-basin',
  'river-trace',
] as const;
const PERF_SCENARIOS = [
  { id: 'idle10', label: 'Scenario 1: idle 10s', durationMs: 10_000, warmupMs: 500 },
  { id: 'pan10', label: 'Scenario 2: pan 10s', durationMs: 10_000, warmupMs: 1_000 },
  { id: 'zoomPan10', label: 'Scenario 3: zoomed-out pan 10s', durationMs: 10_000, warmupMs: 1_000 },
  { id: 'stress15', label: 'Scenario 4: stress autopan 15s', durationMs: 15_000, warmupMs: 1_000 },
] as const;
const PERF_BUCKETS_FOR_DISPLAY: ReadonlyArray<PerfBucket> = [
  'input',
  'camera',
  'visibleRange',
  'rangeDiff',
  'chunkGenerate',
  'chunkBuild',
  'renderSubmit',
  'minimap',
  'overlay',
];
type PerfScenarioId = (typeof PERF_SCENARIOS)[number]['id'];
const HEX_DIRECTIONS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

type LoadedChunk = {
  cq: number;
  cr: number;
  container: Container;
  lodEnabled: boolean;
};

type DebugMode = (typeof DEBUG_MODES)[number];

type OverlayElements = {
  root: HTMLDivElement;
  seedInput: HTMLInputElement;
  debugSelect: HTMLSelectElement;
  outlineCheckbox: HTMLInputElement;
  stressValue: HTMLSpanElement;
  seedValue: HTMLSpanElement;
  axialValue: HTMLSpanElement;
  zoomValue: HTMLSpanElement;
  loadedChunksValue: HTMLSpanElement;
  drawModeValue: HTMLSpanElement;
  chunkSpritesValue: HTMLSpanElement;
  tileDrawEstimateValue: HTMLSpanElement;
  totalGeneratedValue: HTMLSpanElement;
  stressElapsedValue: HTMLSpanElement;
  stressChunkBandValue: HTMLSpanElement;
  stressHealthValue: HTMLSpanElement;
  perfValue: HTMLSpanElement;
  minimapRateValue: HTMLSpanElement;
  perfToggleButton: HTMLButtonElement;
  perfPanel: HTMLDivElement;
  perfFrameValue: HTMLDivElement;
  perfBucketsValue: HTMLPreElement;
  perfCountersValue: HTMLPreElement;
  perfCopyButton: HTMLButtonElement;
  perfCopyStatus: HTMLSpanElement;
  scenarioSelect: HTMLSelectElement;
  scenarioRunButton: HTMLButtonElement;
  scenarioRunAllButton: HTMLButtonElement;
  scenarioStatusValue: HTMLSpanElement;
  perfReportValue: HTMLPreElement;
  minimapCanvas: HTMLCanvasElement;
  minimapContext: CanvasRenderingContext2D;
};

type MovementKeys = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function grayscaleColor(value: number): number {
  const clamped = Math.round(clamp(value, 0, 1) * 255);
  return (clamped << 16) | (clamped << 8) | clamped;
}

function debugBasinColor(id: number): number {
  let v = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  v ^= v >>> 13;
  const r = 80 + (v & 0x7f);
  const g = 80 + ((v >>> 8) & 0x7f);
  const b = 80 + ((v >>> 16) & 0x7f);
  return (r << 16) | (g << 8) | b;
}

function getRenderChunkKey(cq: number, cr: number): string {
  return `${cq}:${cr}`;
}

function readSeedFromUrl(): string {
  const url = new URL(window.location.href);
  const param = url.searchParams.get('seed');
  if (!param) {
    return DEFAULT_SEED;
  }
  const trimmed = param.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SEED;
}

function writeSeedToUrl(seed: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
}

function ensureMaterialSymbolsFont(): void {
  if (document.head.querySelector('link[data-material-symbols]')) {
    return;
  }
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0';
  fontLink.dataset.materialSymbols = 'true';
  document.head.appendChild(fontLink);
}

function screenToWorld(world: Container, screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - world.position.x) / world.scale.x,
    y: (screenY - world.position.y) / world.scale.y,
  };
}

function slopeLightAt(seed: string, sampleX: number, sampleY: number): number {
  const eps = 0.9;
  const hL = elevationAt(seed, sampleX - eps, sampleY);
  const hR = elevationAt(seed, sampleX + eps, sampleY);
  const hU = elevationAt(seed, sampleX, sampleY - eps);
  const hD = elevationAt(seed, sampleX, sampleY + eps);
  const dx = (hR - hL) / (2 * eps);
  const dy = (hD - hU) / (2 * eps);
  const nx = -dx * 3.4;
  const ny = -dy * 3.4;
  const nz = 1;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const nnx = nx / nLen;
  const nny = ny / nLen;
  const nnz = nz / nLen;

  const lx = -0.58;
  const ly = -0.42;
  const lz = 0.69;
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const lnx = lx / lLen;
  const lny = ly / lLen;
  const lnz = lz / lLen;
  const dot = nnx * lnx + nny * lny + nnz * lnz;
  return clamp(dot * 0.5 + 0.5, 0, 1);
}

function createChunkContainer(
  seed: string,
  cq: number,
  cr: number,
  shouldDrawOutlines: boolean,
  debugMode: DebugMode,
): { container: Container; tileCount: number; generationMs: number; buildMs: number } {
  const generationStart = performance.now();
  const chunkContainer = new Container();
  const baseQ = cq * CHUNK_SIZE;
  const baseR = cr * CHUNK_SIZE;
  const basePixel = axialToPixel(baseQ, baseR, HEX_SIZE);
  chunkContainer.position.set(basePixel.x, basePixel.y);
  const chunkTiles: TileType[][] = [];
  for (let localR = 0; localR < CHUNK_SIZE; localR += 1) {
    const row: TileType[] = [];
    for (let localQ = 0; localQ < CHUNK_SIZE; localQ += 1) {
      const q = baseQ + localQ;
      const r = baseR + localR;
      const sample = axialToSample(q, r);
      row.push(getTileAt(seed, sample.x, sample.y));
    }
    chunkTiles.push(row);
  }
  const generationMs = performance.now() - generationStart;

  const buildStart = performance.now();
  const chunkGraphics = new Graphics();
  for (let localR = 0; localR < CHUNK_SIZE; localR += 1) {
    for (let localQ = 0; localQ < CHUNK_SIZE; localQ += 1) {
      const q = baseQ + localQ;
      const r = baseR + localR;
      const center = axialToPixel(q, r, HEX_SIZE);
      const sample = axialToSample(q, r);
      const tile = chunkTiles[localR][localQ];
      const elevation = elevationAt(seed, sample.x, sample.y);
      let renderColor = TILE_PALETTE[tile];

      if (debugMode === 'elevation') {
        renderColor = grayscaleColor(elevation);
      } else if (debugMode === 'moisture') {
        renderColor = grayscaleColor(moistureAt(seed, sample.x, sample.y));
      } else if (debugMode === 'ocean-mask') {
        const waterClass = waterClassAt(seed, sample.x, sample.y);
        renderColor =
          waterClass === 'ocean' ? 0xffffff : waterClass === 'lake' ? 0x5555ff : 0x0f0f0f;
      } else if (debugMode === 'flow') {
        const flow = flowAccumulationAt(seed, sample.x, sample.y);
        renderColor = grayscaleColor(flow);
      } else if (debugMode === 'lake-basin') {
        const basinId = lakeBasinIdAt(seed, sample.x, sample.y);
        if (basinId !== null) {
          renderColor = debugBasinColor(basinId);
        } else {
          const waterClass = waterClassAt(seed, sample.x, sample.y);
          renderColor = waterClass === 'ocean' ? 0x204570 : 0x0f0f0f;
        }
      } else if (debugMode === 'river-trace') {
        if (isRiverSourceAt(seed, sample.x, sample.y)) {
          renderColor = 0xffda4d;
        } else if (tile === 'river') {
          renderColor = 0x2dcfff;
        } else if (tile === 'water' || tile === 'lake') {
          renderColor = 0x14324f;
        } else {
          renderColor = grayscaleColor(clamp(elevation * 0.7, 0, 1));
        }
      } else {
        let shorelineNeighbors = 0;
        if (tile !== 'water' && tile !== 'lake') {
          for (const [dq, dr] of HEX_DIRECTIONS) {
            const neighborLocalQ = localQ + dq;
            const neighborLocalR = localR + dr;
            let neighborTile: TileType;
            if (
              neighborLocalQ >= 0 &&
              neighborLocalQ < CHUNK_SIZE &&
              neighborLocalR >= 0 &&
              neighborLocalR < CHUNK_SIZE
            ) {
              neighborTile = chunkTiles[neighborLocalR][neighborLocalQ];
            } else {
              const neighborSample = axialToSample(q + dq, r + dr);
              neighborTile = getTileAt(seed, neighborSample.x, neighborSample.y);
            }
            if (neighborTile === 'water' || neighborTile === 'lake') {
              shorelineNeighbors += 1;
            }
          }
        }

        const waterShade = tile === 'water' || tile === 'lake'
          ? waterShadeScalarAt(seed, sample.x, sample.y)
          : null;
        const slopeLight = tile === 'water' || tile === 'lake' ? null : slopeLightAt(seed, sample.x, sample.y);
        const riverFlow = tile === 'river' ? flowAccumulationAt(seed, sample.x, sample.y) : null;
        renderColor = colorForRenderedTile(
          tile,
          TILE_PALETTE[tile],
          elevation,
          shorelineNeighbors,
          waterShade,
          slopeLight,
          riverFlow,
        );
      }
      const points = hexPolygonPoints(center.x - basePixel.x, center.y - basePixel.y, HEX_SIZE);

      chunkGraphics.poly(points, true).fill(renderColor);
      if (shouldDrawOutlines) {
        chunkGraphics.poly(points, true).stroke({
          color: 0x101010,
          width: 1,
          alpha: 0.18,
        });
      }
    }
  }

  chunkContainer.addChild(chunkGraphics);
  const buildMs = performance.now() - buildStart;
  return {
    container: chunkContainer,
    tileCount: CHUNK_SIZE * CHUNK_SIZE,
    generationMs,
    buildMs,
  };
}

function createOverlay(seed: string): OverlayElements {
  ensureMaterialSymbolsFont();

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

  const debugRow = document.createElement('div');
  debugRow.style.marginTop = '6px';
  const debugLabel = document.createElement('span');
  debugLabel.textContent = 'Debug mode: ';
  const debugSelect = document.createElement('select');
  debugSelect.style.cursor = 'pointer';
  for (const mode of DEBUG_MODES) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    debugSelect.appendChild(option);
  }
  debugSelect.value = 'normal';
  debugRow.append(debugLabel, debugSelect);

  const outlineRow = document.createElement('div');
  outlineRow.style.marginTop = '6px';
  outlineRow.style.display = 'flex';
  outlineRow.style.alignItems = 'center';
  outlineRow.style.gap = '6px';
  const outlineCheckbox = document.createElement('input');
  outlineCheckbox.type = 'checkbox';
  outlineCheckbox.checked = true;
  outlineCheckbox.style.cursor = 'pointer';
  const outlineLabel = document.createElement('label');
  outlineLabel.style.cursor = 'pointer';
  outlineLabel.textContent = 'Show tile borders when zoomed';
  outlineLabel.prepend(outlineCheckbox);
  outlineRow.append(outlineLabel);

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

  const drawModeRow = document.createElement('div');
  const drawModeLabel = document.createElement('span');
  drawModeLabel.textContent = 'Draw mode: ';
  const drawModeValue = document.createElement('span');
  drawModeValue.textContent = 'hex';
  drawModeRow.append(drawModeLabel, drawModeValue);

  const chunkSpritesRow = document.createElement('div');
  const chunkSpritesLabel = document.createElement('span');
  chunkSpritesLabel.textContent = 'Chunk sprites: ';
  const chunkSpritesValue = document.createElement('span');
  chunkSpritesValue.textContent = '0';
  chunkSpritesRow.append(chunkSpritesLabel, chunkSpritesValue);

  const tileDrawEstimateRow = document.createElement('div');
  const tileDrawEstimateLabel = document.createElement('span');
  tileDrawEstimateLabel.textContent = 'Approx tile draws: ';
  const tileDrawEstimateValue = document.createElement('span');
  tileDrawEstimateValue.textContent = '0';
  tileDrawEstimateRow.append(tileDrawEstimateLabel, tileDrawEstimateValue);

  const minimapRateRow = document.createElement('div');
  const minimapRateLabel = document.createElement('span');
  minimapRateLabel.textContent = 'Minimap Hz: ';
  const minimapRateValue = document.createElement('span');
  minimapRateValue.textContent = '0.0';
  minimapRateRow.append(minimapRateLabel, minimapRateValue);

  const legendToggle = document.createElement('button');
  legendToggle.type = 'button';
  legendToggle.title = 'Toggle legend';
  legendToggle.style.position = 'absolute';
  legendToggle.style.top = '8px';
  legendToggle.style.right = '8px';
  legendToggle.style.width = '28px';
  legendToggle.style.height = '22px';
  legendToggle.style.border = '1px solid rgba(255, 255, 255, 0.28)';
  legendToggle.style.borderRadius = '4px';
  legendToggle.style.background = 'rgba(0, 0, 0, 0.25)';
  legendToggle.style.color = '#e8e8e8';
  legendToggle.style.cursor = 'pointer';
  const legendIcon = document.createElement('span');
  legendIcon.className = 'material-symbols-outlined';
  legendIcon.textContent = 'key';
  legendIcon.style.fontSize = '16px';
  legendIcon.style.lineHeight = '1';
  legendToggle.appendChild(legendIcon);

  const legendRow = document.createElement('div');
  legendRow.style.marginTop = '6px';
  legendRow.style.display = 'none';
  legendRow.style.maxWidth = '140px';
  const legendTitle = document.createElement('div');
  legendTitle.textContent = 'Legend';
  legendTitle.style.marginBottom = '4px';
  legendRow.appendChild(legendTitle);

  for (const tile of LEGEND_ORDER) {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '6px';
    item.style.marginBottom = '2px';

    const swatch = document.createElement('span');
    swatch.style.display = 'inline-block';
    swatch.style.width = '10px';
    swatch.style.height = '10px';
    swatch.style.border = '1px solid rgba(255,255,255,0.35)';
    swatch.style.background = TILE_PALETTE_CSS[tile];

    const label = document.createElement('span');
    label.textContent = tile;

    item.append(swatch, label);
    legendRow.appendChild(item);
  }

  const stressRow = document.createElement('div');
  stressRow.style.marginTop = '6px';
  const stressLabel = document.createElement('span');
  stressLabel.textContent = 'Stress: ';
  const stressValue = document.createElement('span');
  stressValue.textContent = 'off';
  stressValue.style.marginRight = '6px';
  const stressToggle = document.createElement('button');
  stressToggle.type = 'button';
  stressToggle.textContent = 'Toggle';
  stressToggle.style.cursor = 'pointer';
  const stressElapsedLabel = document.createElement('span');
  stressElapsedLabel.textContent = ' elapsed ';
  const stressElapsedValue = document.createElement('span');
  stressElapsedValue.textContent = '0.0s';
  stressRow.append(
    stressLabel,
    stressValue,
    stressToggle,
    stressElapsedLabel,
    stressElapsedValue,
  );

  const generatedRow = document.createElement('div');
  const generatedLabel = document.createElement('span');
  generatedLabel.textContent = 'Total chunks generated: ';
  const totalGeneratedValue = document.createElement('span');
  totalGeneratedValue.textContent = '0';
  const resetStatsButton = document.createElement('button');
  resetStatsButton.type = 'button';
  resetStatsButton.textContent = 'Reset stats';
  resetStatsButton.style.cursor = 'pointer';
  resetStatsButton.style.marginLeft = '6px';
  generatedRow.append(generatedLabel, totalGeneratedValue, resetStatsButton);

  const stressBandRow = document.createElement('div');
  const stressBandLabel = document.createElement('span');
  stressBandLabel.textContent = 'Stress chunk band: ';
  const stressChunkBandValue = document.createElement('span');
  stressChunkBandValue.textContent = 'n/a';
  stressBandRow.append(stressBandLabel, stressChunkBandValue);

  const stressHealthRow = document.createElement('div');
  const stressHealthLabel = document.createElement('span');
  stressHealthLabel.textContent = 'Stress health: ';
  const stressHealthValue = document.createElement('span');
  stressHealthValue.textContent = 'idle';
  stressHealthRow.append(stressHealthLabel, stressHealthValue);

  const perfRow = document.createElement('div');
  const perfLabel = document.createElement('span');
  perfLabel.textContent = 'Perf (EMA): ';
  const perfValue = document.createElement('span');
  perfValue.textContent = '0.0ms / 0.0fps';
  perfRow.append(perfLabel, perfValue);

  const perfToggleButton = document.createElement('button');
  perfToggleButton.type = 'button';
  perfToggleButton.textContent = 'Show Perf HUD';
  perfToggleButton.style.cursor = 'pointer';
  perfToggleButton.style.marginTop = '6px';
  perfToggleButton.dataset.testid = 'perf-toggle';

  const perfPanel = document.createElement('div');
  perfPanel.style.display = 'none';
  perfPanel.style.marginTop = '6px';
  perfPanel.style.padding = '6px';
  perfPanel.style.border = '1px solid rgba(255,255,255,0.2)';
  perfPanel.style.borderRadius = '6px';
  perfPanel.style.background = 'rgba(0, 0, 0, 0.22)';

  const perfFrameValue = document.createElement('div');
  perfFrameValue.textContent = 'Frame: n/a';

  const perfBucketsValue = document.createElement('pre');
  perfBucketsValue.textContent = 'Buckets: n/a';
  perfBucketsValue.style.margin = '4px 0 0 0';
  perfBucketsValue.style.whiteSpace = 'pre-wrap';

  const perfCountersValue = document.createElement('pre');
  perfCountersValue.textContent = 'Counters: n/a';
  perfCountersValue.style.margin = '4px 0 0 0';
  perfCountersValue.style.whiteSpace = 'pre-wrap';

  const perfCopyRow = document.createElement('div');
  perfCopyRow.style.marginTop = '4px';
  perfCopyRow.style.display = 'flex';
  perfCopyRow.style.alignItems = 'center';
  perfCopyRow.style.gap = '6px';
  const perfCopyButton = document.createElement('button');
  perfCopyButton.type = 'button';
  perfCopyButton.textContent = 'Copy perf snapshot';
  perfCopyButton.style.cursor = 'pointer';
  perfCopyButton.dataset.testid = 'perf-copy';
  const perfCopyStatus = document.createElement('span');
  perfCopyStatus.textContent = '';
  perfCopyRow.append(perfCopyButton, perfCopyStatus);

  const scenarioRow = document.createElement('div');
  scenarioRow.style.marginTop = '6px';
  scenarioRow.style.display = 'flex';
  scenarioRow.style.alignItems = 'center';
  scenarioRow.style.gap = '6px';
  const scenarioSelect = document.createElement('select');
  scenarioSelect.style.cursor = 'pointer';
  scenarioSelect.dataset.testid = 'scenario-select';
  for (const scenario of PERF_SCENARIOS) {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.label;
    scenarioSelect.appendChild(option);
  }
  const scenarioRunButton = document.createElement('button');
  scenarioRunButton.type = 'button';
  scenarioRunButton.textContent = 'Run';
  scenarioRunButton.style.cursor = 'pointer';
  scenarioRunButton.dataset.testid = 'scenario-run';
  const scenarioRunAllButton = document.createElement('button');
  scenarioRunAllButton.type = 'button';
  scenarioRunAllButton.textContent = 'Run all';
  scenarioRunAllButton.style.cursor = 'pointer';
  scenarioRunAllButton.dataset.testid = 'scenario-run-all';
  scenarioRow.append(scenarioSelect, scenarioRunButton, scenarioRunAllButton);

  const scenarioStatusRow = document.createElement('div');
  scenarioStatusRow.style.marginTop = '4px';
  const scenarioStatusLabel = document.createElement('span');
  scenarioStatusLabel.textContent = 'Scenario status: ';
  const scenarioStatusValue = document.createElement('span');
  scenarioStatusValue.textContent = 'idle';
  scenarioStatusValue.dataset.testid = 'scenario-status';
  scenarioStatusRow.append(scenarioStatusLabel, scenarioStatusValue);

  const perfReportValue = document.createElement('pre');
  perfReportValue.textContent = '';
  perfReportValue.style.margin = '4px 0 0 0';
  perfReportValue.style.whiteSpace = 'pre-wrap';
  perfReportValue.style.maxHeight = '120px';
  perfReportValue.style.overflow = 'auto';
  perfReportValue.dataset.testid = 'scenario-report';

  perfPanel.append(
    perfFrameValue,
    perfBucketsValue,
    perfCountersValue,
    perfCopyRow,
    scenarioRow,
    scenarioStatusRow,
    perfReportValue,
  );

  const minimapRow = document.createElement('div');
  minimapRow.style.marginTop = '8px';
  const minimapLabel = document.createElement('div');
  minimapLabel.textContent = 'Minimap';
  minimapLabel.style.marginBottom = '4px';
  const minimapCanvas = document.createElement('canvas');
  minimapCanvas.width = MINIMAP_SIZE;
  minimapCanvas.height = MINIMAP_SIZE;
  minimapCanvas.style.width = `${MINIMAP_DISPLAY_SIZE}px`;
  minimapCanvas.style.height = `${MINIMAP_DISPLAY_SIZE}px`;
  minimapCanvas.style.border = '1px solid rgba(255, 255, 255, 0.3)';
  minimapCanvas.style.background = '#111';
  minimapRow.append(minimapLabel, minimapCanvas);

  root.append(
    seedRow,
    debugRow,
    outlineRow,
    seedValueRow,
    axialRow,
    zoomRow,
    chunksRow,
    drawModeRow,
    chunkSpritesRow,
    tileDrawEstimateRow,
    generatedRow,
    stressRow,
    stressBandRow,
    stressHealthRow,
    perfRow,
    perfToggleButton,
    perfPanel,
    minimapRateRow,
    legendRow,
    minimapRow,
    legendToggle,
  );
  document.body.appendChild(root);
  const minimapContext = minimapCanvas.getContext('2d');
  if (!minimapContext) {
    throw new Error('Unable to create minimap canvas context.');
  }

  const applySeed = () => {
    const nextSeed = seedInput.value.trim();
    if (nextSeed.length > 0) {
      root.dispatchEvent(new CustomEvent<string>('seedchange', { detail: nextSeed }));
    }
  };

  seedInput.addEventListener('change', applySeed);
  applyButton.addEventListener('click', applySeed);
  debugSelect.addEventListener('change', () => {
    root.dispatchEvent(new CustomEvent<DebugMode>('debugmodechange', { detail: debugSelect.value as DebugMode }));
  });
  outlineCheckbox.addEventListener('change', () => {
    root.dispatchEvent(new CustomEvent<boolean>('outlinechange', { detail: outlineCheckbox.checked }));
  });
  stressToggle.addEventListener('click', () => {
    const current = stressValue.textContent === 'on';
    const next = !current;
    stressValue.textContent = next ? 'on' : 'off';
    root.dispatchEvent(new CustomEvent<boolean>('stresstoggle', { detail: next }));
  });
  resetStatsButton.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('resetstats'));
  });
  legendToggle.addEventListener('click', () => {
    const isVisible = legendRow.style.display !== 'none';
    legendRow.style.display = isVisible ? 'none' : 'block';
  });
  perfToggleButton.addEventListener('click', () => {
    const isVisible = perfPanel.style.display !== 'none';
    perfPanel.style.display = isVisible ? 'none' : 'block';
    perfToggleButton.textContent = isVisible ? 'Show Perf HUD' : 'Hide Perf HUD';
  });
  perfCopyButton.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('perfcopy'));
  });
  scenarioRunButton.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent<PerfScenarioId>('runscenario', { detail: scenarioSelect.value as PerfScenarioId }));
  });
  scenarioRunAllButton.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('runscenarioall'));
  });

  return {
    root,
    seedInput,
    debugSelect,
    outlineCheckbox,
    stressValue,
    seedValue,
    axialValue,
    zoomValue,
    loadedChunksValue,
    drawModeValue,
    chunkSpritesValue,
    tileDrawEstimateValue,
    totalGeneratedValue,
    stressElapsedValue,
    stressChunkBandValue,
    stressHealthValue,
    perfValue,
    minimapRateValue,
    perfToggleButton,
    perfPanel,
    perfFrameValue,
    perfBucketsValue,
    perfCountersValue,
    perfCopyButton,
    perfCopyStatus,
    scenarioSelect,
    scenarioRunButton,
    scenarioRunAllButton,
    scenarioStatusValue,
    perfReportValue,
    minimapCanvas,
    minimapContext,
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

  const initialSeed = readSeedFromUrl();
  const overlay = createOverlay(initialSeed);

  const world = new Container();
  world.position.set(window.innerWidth / 2, window.innerHeight / 2);
  app.stage.addChild(world);

  let activeSeed = initialSeed;
  let debugMode: DebugMode = 'normal';
  const loadedChunks = new Map<string, LoadedChunk>();
  let cameraDirty = true;
  let autoBordersEnabled = true;
  let renderedWithOutlines = false;
  let stressEnabled = false;
  let stressPaused = false;
  let stressElapsedMs = 0;
  let stressPathTime = 0;
  let stressWarmupDone = false;
  let stressChunkMin = Number.POSITIVE_INFINITY;
  let stressChunkMax = Number.NEGATIVE_INFINITY;
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastMinimapUpdate = 0;
  let minimapUpdatesThisWindow = 0;
  let minimapWindowStart = performance.now();
  let minimapRate = 0;
  let totalChunksGenerated = 0;
  let frameMsEma = 16.7;
  let fpsEma = 60;
  let drawMode: 'hex' | 'lod' = 'hex';
  const perf = new PerfProfiler();
  let lastSceneCountUpdate = 0;
  let lastPerfLogCaptureMs = 0;
  let lastOverlayPerfReport = '';
  const moveKeys: MovementKeys = {
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
  };
  type ActiveScenarioRun = {
    id: PerfScenarioId;
    label: string;
    warmupMs: number;
    durationMs: number;
    startMs: number;
    generatedAtStart: number;
    maxLoadedChunks: number;
  };
  type ScenarioReport = {
    id: PerfScenarioId;
    label: string;
    durationMs: number;
    avgFps1s: number;
    avgFps5s: number;
    p95FrameMs: number;
    slowFrameRate: number;
    maxLoadedChunks: number;
    chunksGeneratedDuringRun: number;
    p95Buckets: Record<PerfBucket, number>;
  };
  let activeScenario: ActiveScenarioRun | null = null;
  let scenarioQueue: PerfScenarioId[] = [];
  const scenarioReports: ScenarioReport[] = [];

  function formatPerfSnapshot(snapshot: PerfSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
  }

  function formatBucketLine(snapshot: PerfSnapshot): string {
    return PERF_BUCKETS_FOR_DISPLAY
      .map((bucket) => {
        const stats = snapshot.buckets[bucket];
        return `${bucket} avg ${stats.avgMs.toFixed(1)} p95 ${stats.p95Ms.toFixed(1)}ms`;
      })
      .join('\n');
  }

  function countSceneObjects(root: Container): {
    displayObjects: number;
    graphicsObjects: number;
    spriteObjects: number;
  } {
    let displayObjects = 0;
    let graphicsObjects = 0;
    let spriteObjects = 0;
    const stack: Container[] = [root];
    while (stack.length > 0) {
      const node = stack.pop() as Container;
      for (const child of node.children) {
        displayObjects += 1;
        if (child instanceof Graphics) {
          graphicsObjects += 1;
        }
        if (child instanceof Sprite) {
          spriteObjects += 1;
        }
        if (child instanceof Container) {
          stack.push(child);
        }
      }
    }
    return {
      displayObjects,
      graphicsObjects,
      spriteObjects,
    };
  }

  function scenarioById(id: PerfScenarioId): (typeof PERF_SCENARIOS)[number] {
    const found = PERF_SCENARIOS.find((scenario) => scenario.id === id);
    if (!found) {
      return PERF_SCENARIOS[0];
    }
    return found;
  }

  function resetToDeterministicScenarioState(targetZoom: number): void {
    if (activeSeed !== DEFAULT_SEED) {
      activeSeed = DEFAULT_SEED;
      overlay.seedInput.value = activeSeed;
      writeSeedToUrl(activeSeed);
    }
    stressEnabled = false;
    stressPaused = false;
    stressElapsedMs = 0;
    stressPathTime = 0;
    stressWarmupDone = false;
    stressChunkMin = Number.POSITIVE_INFINITY;
    stressChunkMax = Number.NEGATIVE_INFINITY;
    world.scale.set(clamp(targetZoom, MIN_ZOOM, MAX_ZOOM));
    world.position.set(window.innerWidth / 2, window.innerHeight / 2);
    clearLoadedChunks();
    perf.reset();
    lastPerfLogCaptureMs = 0;
    cameraDirty = true;
  }

  function scenarioToReport(
    scenario: ActiveScenarioRun,
    snapshot: PerfSnapshot,
  ): ScenarioReport {
    return {
      id: scenario.id,
      label: scenario.label,
      durationMs: scenario.durationMs,
      avgFps1s: snapshot.frame.fps1s,
      avgFps5s: snapshot.frame.fps5s,
      p95FrameMs: snapshot.frame.p95Ms,
      slowFrameRate: snapshot.frame.slowFrameRate,
      maxLoadedChunks: scenario.maxLoadedChunks,
      chunksGeneratedDuringRun: Math.max(0, snapshot.totals.chunksGenerated - scenario.generatedAtStart),
      p95Buckets: {
        input: snapshot.buckets.input.p95Ms,
        camera: snapshot.buckets.camera.p95Ms,
        visibleRange: snapshot.buckets.visibleRange.p95Ms,
        rangeDiff: snapshot.buckets.rangeDiff.p95Ms,
        chunkGenerate: snapshot.buckets.chunkGenerate.p95Ms,
        chunkBuild: snapshot.buckets.chunkBuild.p95Ms,
        renderSubmit: snapshot.buckets.renderSubmit.p95Ms,
        minimap: snapshot.buckets.minimap.p95Ms,
        overlay: snapshot.buckets.overlay.p95Ms,
      },
    };
  }

  function formatScenarioReport(report: ScenarioReport): string {
    const bucketSummary = PERF_BUCKETS_FOR_DISPLAY.map(
      (bucket) => `${bucket}:${report.p95Buckets[bucket].toFixed(1)}`,
    ).join(' ');
    return (
      `${report.label}\n` +
      `fps1s=${report.avgFps1s.toFixed(1)} fps5s=${report.avgFps5s.toFixed(1)} ` +
      `frameP95=${report.p95FrameMs.toFixed(1)}ms slowRate=${(report.slowFrameRate * 100).toFixed(1)}%\n` +
      `maxLoaded=${report.maxLoadedChunks} chunksGenerated=${report.chunksGeneratedDuringRun}\n` +
      `bucketP95 ${bucketSummary}`
    );
  }

  function startScenario(id: PerfScenarioId): void {
    const scenario = scenarioById(id);
    const zoomPreset = scenario.id === 'zoomPan10' ? 0.55 : 1;
    resetToDeterministicScenarioState(zoomPreset);
    const snapshot = perf.getSnapshot('scenario-start');
    activeScenario = {
      id: scenario.id,
      label: scenario.label,
      warmupMs: scenario.warmupMs,
      durationMs: scenario.durationMs,
      startMs: performance.now(),
      generatedAtStart: snapshot.totals.chunksGenerated,
      maxLoadedChunks: 0,
    };
    overlay.scenarioStatusValue.textContent = `running ${scenario.label}`;
    overlay.perfReportValue.textContent = '';
  }

  function beginScenarioRun(ids: PerfScenarioId[]): void {
    scenarioQueue = [...ids];
    scenarioReports.length = 0;
    const next = scenarioQueue.shift();
    if (!next) {
      overlay.scenarioStatusValue.textContent = 'idle';
      return;
    }
    startScenario(next);
  }

  function completeActiveScenario(): void {
    if (!activeScenario) {
      return;
    }
    const snapshot = perf.captureSnapshot(`scenario:${activeScenario.id}`);
    const report = scenarioToReport(activeScenario, snapshot);
    scenarioReports.push(report);
    const summary = scenarioReports.map((item) => formatScenarioReport(item)).join('\n\n');
    overlay.perfReportValue.textContent = summary;
    lastOverlayPerfReport = summary;
    console.log('[Perf Acceptance Report]', report);

    const next = scenarioQueue.shift();
    if (next) {
      startScenario(next);
      return;
    }

    overlay.scenarioStatusValue.textContent = 'complete';
    activeScenario = null;
    scenarioQueue = [];
  }

  function shouldDrawOutlinesAtZoom(zoom: number): boolean {
    return autoBordersEnabled && zoom >= OUTLINE_ZOOM_THRESHOLD;
  }

  function shouldUseLodMode(zoom: number): boolean {
    return zoom < LOD_ZOOM_THRESHOLD;
  }

  function applyChunkLodState(chunk: LoadedChunk, useLod: boolean): void {
    if (chunk.lodEnabled === useLod) {
      return;
    }
    chunk.container.cacheAsTexture(useLod);
    chunk.lodEnabled = useLod;
  }

  function applyLodModeToLoadedChunks(useLod: boolean): void {
    for (const chunk of loadedChunks.values()) {
      applyChunkLodState(chunk, useLod);
    }
    drawMode = useLod ? 'lod' : 'hex';
  }

  function clearLoadedChunks(): void {
    const submitStart = performance.now();
    for (const chunk of loadedChunks.values()) {
      world.removeChild(chunk.container);
      chunk.container.destroy({ children: true });
    }
    loadedChunks.clear();
    perf.mark('renderSubmit', performance.now() - submitStart);
  }

  function loadChunk(cq: number, cr: number): void {
    const key = getRenderChunkKey(cq, cr);
    if (loadedChunks.has(key)) {
      return;
    }

    const built = createChunkContainer(activeSeed, cq, cr, renderedWithOutlines, debugMode);
    perf.mark('chunkGenerate', built.generationMs);
    perf.mark('chunkBuild', built.buildMs);
    perf.addChunkGenerated(built.tileCount);
    perf.addChunkRebuilt(built.tileCount);
    const submitStart = performance.now();
    world.addChild(built.container);
    const lodEnabled = shouldUseLodMode(world.scale.x);
    if (lodEnabled) {
      built.container.cacheAsTexture(true);
    }
    perf.mark('renderSubmit', performance.now() - submitStart);
    loadedChunks.set(key, { cq, cr, container: built.container, lodEnabled });
    totalChunksGenerated += 1;
  }

  function unloadChunk(key: string): void {
    const chunk = loadedChunks.get(key);
    if (!chunk) {
      return;
    }

    const submitStart = performance.now();
    world.removeChild(chunk.container);
    chunk.container.destroy({ children: true });
    perf.mark('renderSubmit', performance.now() - submitStart);
    loadedChunks.delete(key);
  }

  function refreshChunks(): void {
    const visibleStart = performance.now();
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
    perf.mark('visibleRange', performance.now() - visibleStart);

    const diffStart = performance.now();
    const needed = new Set<string>();
    for (let cr = minChunkR; cr <= maxChunkR; cr += 1) {
      for (let cq = minChunkQ; cq <= maxChunkQ; cq += 1) {
        const key = getRenderChunkKey(cq, cr);
        needed.add(key);
        const has = loadedChunks.has(key);
        perf.addChunkRequest(has);
        if (!has) {
          loadChunk(cq, cr);
        }
      }
    }

    for (const key of loadedChunks.keys()) {
      if (!needed.has(key)) {
        unloadChunk(key);
      }
    }
    perf.mark('rangeDiff', performance.now() - diffStart);
  }

  function updateOverlay(nowMs: number): void {
    const sceneRenderTextures = Array.from(loadedChunks.values()).filter((chunk) => chunk.lodEnabled).length;
    if (nowMs - lastSceneCountUpdate >= 500) {
      lastSceneCountUpdate = nowMs;
      const counts = countSceneObjects(world);
      perf.setSceneCounts({
        loadedChunks: loadedChunks.size,
        displayObjects: counts.displayObjects,
        graphicsObjects: counts.graphicsObjects,
        spriteObjects: counts.spriteObjects,
        renderTextureObjects: sceneRenderTextures,
      });
    } else {
      perf.setSceneCounts({
        loadedChunks: loadedChunks.size,
        renderTextureObjects: sceneRenderTextures,
      });
    }

    if (nowMs - lastPerfLogCaptureMs >= 1000) {
      perf.captureSnapshot('live');
      lastPerfLogCaptureMs = nowMs;
    }
    const snapshot = perf.getSnapshot('live');
    const centerWorld = screenToWorld(world, window.innerWidth / 2, window.innerHeight / 2);
    const centerAxial = pixelToAxial(centerWorld.x, centerWorld.y, HEX_SIZE);
    const roundedCenter = roundAxial(centerAxial.q, centerAxial.r);

    overlay.seedValue.textContent = activeSeed;
    overlay.debugSelect.value = debugMode;
    overlay.axialValue.textContent = `${roundedCenter.q}, ${roundedCenter.r}`;
    overlay.zoomValue.textContent = world.scale.x.toFixed(3);
    overlay.loadedChunksValue.textContent = `${loadedChunks.size}`;
    overlay.drawModeValue.textContent = drawMode;
    overlay.chunkSpritesValue.textContent = drawMode === 'lod' ? `${loadedChunks.size}` : '0';
    overlay.tileDrawEstimateValue.textContent =
      drawMode === 'lod' ? '0' : `${loadedChunks.size * CHUNK_SIZE * CHUNK_SIZE}`;
    overlay.totalGeneratedValue.textContent = `${totalChunksGenerated}`;
    overlay.outlineCheckbox.checked = autoBordersEnabled;
    overlay.stressValue.textContent = stressEnabled ? (stressPaused ? 'paused' : 'on') : 'off';
    overlay.stressElapsedValue.textContent = `${(stressElapsedMs / 1000).toFixed(1)}s`;
    overlay.stressChunkBandValue.textContent = Number.isFinite(stressChunkMin)
      ? `${stressChunkMin}..${stressChunkMax} (Δ${stressChunkMax - stressChunkMin})`
      : 'warming';
    const chunkBandDelta = Number.isFinite(stressChunkMin) ? stressChunkMax - stressChunkMin : 0;
    const chunkStable = !stressEnabled || !stressWarmupDone || chunkBandDelta <= 30;
    const perfStable = fpsEma >= 30 || frameMsEma <= 33;
    overlay.stressHealthValue.textContent = stressEnabled
      ? chunkStable && perfStable
        ? 'ok'
        : 'warn'
      : 'idle';
    overlay.perfValue.textContent = `${snapshot.frame.avgMs.toFixed(1)}ms / ${snapshot.frame.fps1s.toFixed(1)}fps`;
    overlay.minimapRateValue.textContent = minimapRate.toFixed(1);
    overlay.perfFrameValue.textContent =
      `FPS 1s ${snapshot.frame.fps1s.toFixed(1)} | FPS 5s ${snapshot.frame.fps5s.toFixed(1)} | ` +
      `avg ${snapshot.frame.avgMs.toFixed(1)}ms | p95 ${snapshot.frame.p95Ms.toFixed(1)}ms | ` +
      `slow ${snapshot.frame.slowFrames}/${snapshot.frame.sampleCount}`;
    overlay.perfBucketsValue.textContent = formatBucketLine(snapshot);
    overlay.perfCountersValue.textContent =
      `chunks loaded=${snapshot.counters.loadedChunks} generated/s=${snapshot.counters.generatedPerSecond.toFixed(2)} ` +
      `rolling=${snapshot.counters.rollingGeneratedPerSecond.toFixed(2)}\n` +
      `rebuilt/s=${snapshot.counters.rebuiltPerSecond.toFixed(2)} rolling=${snapshot.counters.rollingRebuiltPerSecond.toFixed(2)}\n` +
      `tiles/s=${snapshot.counters.tilesProcessedPerSecond.toFixed(0)} rolling=${snapshot.counters.rollingTilesProcessedPerSecond.toFixed(0)}\n` +
      `chunk req/s=${snapshot.counters.chunkRequestsPerSecond.toFixed(2)} rolling=${snapshot.counters.rollingChunkRequestsPerSecond.toFixed(2)}\n` +
      `cache hit total=${(snapshot.counters.cacheHitRate * 100).toFixed(1)}% rolling=${(snapshot.counters.rollingCacheHitRate * 100).toFixed(1)}%\n` +
      `display=${snapshot.counters.displayObjects} graphics=${snapshot.counters.graphicsObjects} sprites=${snapshot.counters.spriteObjects} rt=${snapshot.counters.renderTextureObjects}`;
    overlay.perfReportValue.textContent = lastOverlayPerfReport;
  }

  function updateMinimap(nowMs: number): void {
    if (nowMs - lastMinimapUpdate < MINIMAP_UPDATE_MS) {
      return;
    }
    lastMinimapUpdate = nowMs;
    minimapUpdatesThisWindow += 1;
    const windowMs = nowMs - minimapWindowStart;
    if (windowMs >= 1000) {
      minimapRate = (minimapUpdatesThisWindow * 1000) / windowMs;
      minimapUpdatesThisWindow = 0;
      minimapWindowStart = nowMs;
    }

    const ctx = overlay.minimapContext;
    const centerWorld = screenToWorld(world, window.innerWidth / 2, window.innerHeight / 2);
    const centerAxialFloat = pixelToAxial(centerWorld.x, centerWorld.y, HEX_SIZE);
    const centerAxial = roundAxial(centerAxialFloat.q, centerAxialFloat.r);
    for (let py = 0; py < MINIMAP_SIZE; py += MINIMAP_SAMPLE_STEP) {
      for (let px = 0; px < MINIMAP_SIZE; px += MINIMAP_SAMPLE_STEP) {
        ctx.fillStyle = minimapColorForPixel(
          activeSeed,
          centerAxial,
          px,
          py,
          {
            size: MINIMAP_SIZE,
            sampleStep: MINIMAP_SAMPLE_STEP,
            worldUnitsPerPixel: MINIMAP_WORLD_UNITS_PER_PIXEL,
          },
        );
        ctx.fillRect(px, py, MINIMAP_SAMPLE_STEP, MINIMAP_SAMPLE_STEP);
      }
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(MINIMAP_SIZE / 2 - 2, MINIMAP_SIZE / 2 - 2, 4, 4);
  }

  overlay.root.addEventListener('seedchange', (event: Event) => {
    const seedEvent = event as CustomEvent<string>;
    if (seedEvent.detail === activeSeed) {
      return;
    }
    activeSeed = seedEvent.detail;
    overlay.seedInput.value = activeSeed;
    writeSeedToUrl(activeSeed);
    clearLoadedChunks();
    cameraDirty = true;
  });

  overlay.root.addEventListener('debugmodechange', (event: Event) => {
    const debugEvent = event as CustomEvent<DebugMode>;
    if (debugEvent.detail === debugMode) {
      return;
    }
    debugMode = debugEvent.detail;
    clearLoadedChunks();
    cameraDirty = true;
  });

  overlay.root.addEventListener('outlinechange', (event: Event) => {
    const outlineEvent = event as CustomEvent<boolean>;
    autoBordersEnabled = outlineEvent.detail;
    const nextOutlineState = shouldDrawOutlinesAtZoom(world.scale.x);
    if (nextOutlineState !== renderedWithOutlines) {
      renderedWithOutlines = nextOutlineState;
      clearLoadedChunks();
      cameraDirty = true;
    }
  });

  overlay.root.addEventListener('stresstoggle', (event: Event) => {
    const stressEvent = event as CustomEvent<boolean>;
    stressEnabled = stressEvent.detail;
    if (stressEnabled) {
      stressPaused = false;
    }
    if (!stressEnabled) {
      stressPaused = false;
      stressElapsedMs = 0;
      stressPathTime = 0;
      stressWarmupDone = false;
      stressChunkMin = Number.POSITIVE_INFINITY;
      stressChunkMax = Number.NEGATIVE_INFINITY;
    }
  });

  overlay.root.addEventListener('resetstats', () => {
    totalChunksGenerated = 0;
    minimapRate = 0;
    minimapUpdatesThisWindow = 0;
    minimapWindowStart = performance.now();
    stressElapsedMs = 0;
    stressWarmupDone = false;
    stressChunkMin = Number.POSITIVE_INFINITY;
    stressChunkMax = Number.NEGATIVE_INFINITY;
    frameMsEma = 16.7;
    fpsEma = 60;
    perf.reset();
    overlay.perfCopyStatus.textContent = '';
    lastOverlayPerfReport = '';
  });

  overlay.root.addEventListener('perfcopy', () => {
    const snapshot = perf.captureSnapshot('manual');
    const payload = perf.exportLogJson();
    lastOverlayPerfReport = formatPerfSnapshot(snapshot);
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      overlay.perfCopyStatus.textContent = 'clipboard unavailable';
      return;
    }
    overlay.perfCopyStatus.textContent = 'copying...';
    void clipboard.writeText(payload).then(
      () => {
        overlay.perfCopyStatus.textContent = `copied (${perf.getLog().length})`;
      },
      () => {
        overlay.perfCopyStatus.textContent = 'clipboard blocked';
      },
    );
  });

  overlay.root.addEventListener('runscenario', (event: Event) => {
    const scenarioEvent = event as CustomEvent<PerfScenarioId>;
    beginScenarioRun([scenarioEvent.detail]);
  });

  overlay.root.addEventListener('runscenarioall', () => {
    beginScenarioRun(PERF_SCENARIOS.map((scenario) => scenario.id));
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

  function shouldIgnoreKeyboardEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  }

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (shouldIgnoreKeyboardEventTarget(event.target)) {
      return;
    }

    switch (event.code) {
      case 'KeyW':
        moveKeys.up = true;
        break;
      case 'KeyS':
        moveKeys.down = true;
        break;
      case 'KeyA':
        moveKeys.left = true;
        break;
      case 'KeyD':
        moveKeys.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        moveKeys.boost = true;
        break;
      case 'Space':
        if (!event.repeat && stressEnabled) {
          stressPaused = !stressPaused;
        }
        event.preventDefault();
        break;
      case 'Backquote':
        if (!event.repeat) {
          const index = DEBUG_MODES.indexOf(debugMode);
          debugMode = DEBUG_MODES[(index + 1) % DEBUG_MODES.length];
          overlay.debugSelect.value = debugMode;
          clearLoadedChunks();
          cameraDirty = true;
        }
        event.preventDefault();
        break;
      default:
        break;
    }
  });

  window.addEventListener('keyup', (event: KeyboardEvent) => {
    switch (event.code) {
      case 'KeyW':
        moveKeys.up = false;
        break;
      case 'KeyS':
        moveKeys.down = false;
        break;
      case 'KeyA':
        moveKeys.left = false;
        break;
      case 'KeyD':
        moveKeys.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        moveKeys.boost = false;
        break;
      default:
        break;
    }
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

  writeSeedToUrl(activeSeed);
  renderedWithOutlines = shouldDrawOutlinesAtZoom(world.scale.x);
  drawMode = shouldUseLodMode(world.scale.x) ? 'lod' : 'hex';

  app.ticker.add((ticker) => {
    const frameStart = performance.now();
    perf.beginFrame(frameStart);
    frameMsEma = frameMsEma * 0.92 + ticker.deltaMS * 0.08;
    const instantFps = ticker.deltaMS > 0 ? 1000 / ticker.deltaMS : 0;
    fpsEma = fpsEma * 0.92 + instantFps * 0.08;

    const inputStart = performance.now();
    const dtSeconds = ticker.deltaMS / 1000;
    const nowMs = performance.now();
    if (activeScenario) {
      const scenarioElapsed = nowMs - activeScenario.startMs;
      const warmupDone = scenarioElapsed >= activeScenario.warmupMs;
      const runElapsed = Math.max(0, scenarioElapsed - activeScenario.warmupMs);
      const runProgress = clamp(runElapsed / activeScenario.durationMs, 0, 1);
      overlay.scenarioStatusValue.textContent =
        `running ${activeScenario.label} ${(runProgress * 100).toFixed(0)}%`;

      if (warmupDone) {
        switch (activeScenario.id) {
          case 'idle10':
            break;
          case 'pan10':
            world.position.x -= 260 * dtSeconds;
            cameraDirty = true;
            break;
          case 'zoomPan10': {
            const targetZoom = 0.52;
            world.scale.set(targetZoom);
            world.position.x -= 300 * dtSeconds;
            cameraDirty = true;
            break;
          }
          case 'stress15': {
            const orbitRadius = 220;
            const t = runElapsed / 1000;
            const q = Math.cos(t * 0.24) * orbitRadius;
            const r = Math.sin(t * 0.19) * orbitRadius;
            const targetZoom = 0.62 + Math.sin(t * 0.11) * 0.08;
            world.scale.set(clamp(targetZoom, MIN_ZOOM, MAX_ZOOM));
            const pathWorld = axialToPixel(q, r, HEX_SIZE);
            world.position.x = window.innerWidth / 2 - pathWorld.x * world.scale.x;
            world.position.y = window.innerHeight / 2 - pathWorld.y * world.scale.y;
            cameraDirty = true;
            break;
          }
          default:
            break;
        }
      }

      activeScenario.maxLoadedChunks = Math.max(activeScenario.maxLoadedChunks, loadedChunks.size);
      if (scenarioElapsed >= activeScenario.warmupMs + activeScenario.durationMs) {
        completeActiveScenario();
      }
    } else if (stressEnabled && !stressPaused) {
      stressElapsedMs += ticker.deltaMS;
      stressPathTime += dtSeconds;
      const orbitRadius = 220;
      const q = Math.cos(stressPathTime * 0.24) * orbitRadius;
      const r = Math.sin(stressPathTime * 0.19) * orbitRadius;
      const targetZoom = 0.62 + Math.sin(stressPathTime * 0.11) * 0.08;
      world.scale.set(clamp(targetZoom, MIN_ZOOM, MAX_ZOOM));
      const pathWorld = axialToPixel(q, r, HEX_SIZE);
      world.position.x = window.innerWidth / 2 - pathWorld.x * world.scale.x;
      world.position.y = window.innerHeight / 2 - pathWorld.y * world.scale.y;
      cameraDirty = true;

      if (!stressWarmupDone && stressElapsedMs >= 10_000) {
        stressWarmupDone = true;
        stressChunkMin = loadedChunks.size;
        stressChunkMax = loadedChunks.size;
      } else if (stressWarmupDone) {
        stressChunkMin = Math.min(stressChunkMin, loadedChunks.size);
        stressChunkMax = Math.max(stressChunkMax, loadedChunks.size);
      }
    }

    if (!isDragging && !activeScenario) {
      const dtSeconds = ticker.deltaMS / 1000;
      let inputX = 0;
      let inputY = 0;
      if (moveKeys.left) inputX += 1;
      if (moveKeys.right) inputX -= 1;
      if (moveKeys.up) inputY += 1;
      if (moveKeys.down) inputY -= 1;

      if (inputX !== 0 || inputY !== 0) {
        const magnitude = Math.hypot(inputX, inputY);
        inputX /= magnitude;
        inputY /= magnitude;
        const zoomScaled = clamp(1 / world.scale.x, 0.45, 2.4);
        const boost = moveKeys.boost ? BOOST_KEYBOARD_MULTIPLIER : 1;
        const step = BASE_KEYBOARD_PAN_SPEED * zoomScaled * boost * dtSeconds;
        world.position.x += inputX * step;
        world.position.y += inputY * step;
        cameraDirty = true;
      }
    }
    perf.mark('input', performance.now() - inputStart);

    const cameraStart = performance.now();
    const useLodMode = shouldUseLodMode(world.scale.x);
    if ((drawMode === 'lod') !== useLodMode) {
      applyLodModeToLoadedChunks(useLodMode);
      cameraDirty = true;
    }

    const nextOutlineState = shouldDrawOutlinesAtZoom(world.scale.x);
    if (nextOutlineState !== renderedWithOutlines) {
      renderedWithOutlines = nextOutlineState;
      clearLoadedChunks();
      cameraDirty = true;
    }
    perf.mark('camera', performance.now() - cameraStart);

    if (cameraDirty) {
      refreshChunks();
      cameraDirty = false;
    }
    const overlayStart = performance.now();
    updateOverlay(nowMs);
    perf.mark('overlay', performance.now() - overlayStart);

    const minimapStart = performance.now();
    updateMinimap(nowMs);
    perf.mark('minimap', performance.now() - minimapStart);
    perf.endFrame(performance.now());
  });
}

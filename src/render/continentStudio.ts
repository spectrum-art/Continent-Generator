import {
  ATLAS_PALETTE,
  buildAtlasRgba,
  defaultControlsWithSeed,
  exportContinentControls,
  generateContinent,
  importContinentControls,
  randomHumanSeed,
  randomizeControls,
  resetBiomeMix,
  type AspectRatioOption,
  type ContinentControls,
  type SizeOption,
} from '../gen/continent';

type SliderBinding = {
  root: HTMLDivElement;
  input: HTMLInputElement;
  value: HTMLSpanElement;
};

type SelectBinding<T extends string> = {
  root: HTMLDivElement;
  select: HTMLSelectElement;
  getValue: () => T;
  setValue: (value: T) => void;
};

const SIZE_OPTIONS: Array<{ value: SizeOption; label: string }> = [
  { value: 'isle', label: 'Isle (50k mi²)' },
  { value: 'region', label: 'Region (500k mi²)' },
  { value: 'subcontinent', label: 'Subcontinent (5m mi²)' },
  { value: 'supercontinent', label: 'Supercontinent (20m mi²)' },
];

const ASPECT_OPTIONS: Array<{ value: AspectRatioOption; label: string }> = [
  { value: 'wide', label: 'Wide (2:1)' },
  { value: 'landscape', label: 'Landscape (3:2)' },
  { value: 'square', label: 'Square (1:1)' },
  { value: 'portrait', label: 'Portrait (2:3)' },
  { value: 'narrow', label: 'Narrow (1:2)' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cursor = 'pointer';
  button.style.font = '12px/1.2 monospace';
  button.style.padding = '5px 8px';
  return button;
}

function createRow(label: string): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '6px';
  row.style.marginTop = '6px';

  const text = document.createElement('span');
  text.textContent = `${label}:`;
  text.style.minWidth = '128px';
  row.appendChild(text);
  return row;
}

function createSelect<T extends string>(
  label: string,
  options: Array<{ value: T; label: string }>,
  initial: T,
): SelectBinding<T> {
  const root = createRow(label);
  const select = document.createElement('select');
  select.style.flex = '1';
  select.style.font = '12px/1.2 monospace';
  for (const optionConfig of options) {
    const option = document.createElement('option');
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    select.appendChild(option);
  }
  select.value = initial;
  root.appendChild(select);

  return {
    root,
    select,
    getValue: () => select.value as T,
    setValue: (value: T) => {
      select.value = value;
    },
  };
}

function createSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  digits = 0,
): SliderBinding {
  const root = createRow(label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.style.flex = '1';

  const valueText = document.createElement('span');
  valueText.style.minWidth = digits > 0 ? '48px' : '36px';
  valueText.style.textAlign = 'right';
  valueText.textContent = digits > 0 ? Number(value).toFixed(digits) : String(Math.round(value));

  input.addEventListener('input', () => {
    const numeric = Number(input.value);
    valueText.textContent = digits > 0 ? numeric.toFixed(digits) : String(Math.round(numeric));
  });

  root.append(input, valueText);

  return {
    root,
    input,
    value: valueText,
  };
}

function createLabelBlock(title: string): HTMLDivElement {
  const block = document.createElement('div');
  block.textContent = title;
  block.style.marginTop = '10px';
  block.style.paddingTop = '8px';
  block.style.borderTop = '1px solid rgba(255, 255, 255, 0.15)';
  block.style.fontWeight = 'bold';
  return block;
}

function createCheckbox(label: string, checked: boolean): { root: HTMLDivElement; input: HTMLInputElement } {
  const row = createRow(label);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  row.appendChild(input);
  return { root: row, input };
}

function updateSlider(binding: SliderBinding, value: number, digits = 0): void {
  binding.input.value = String(value);
  binding.value.textContent = digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

function setCanvasSize(canvas: HTMLCanvasElement): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

declare global {
  interface Window {
    __continentTool?: {
      getMapHash: () => string;
      getExportCode: () => string;
      importCode: (code: string) => boolean;
      setSeed: (seed: string) => void;
      regenerate: () => void;
      getControls: () => ContinentControls;
      getPalette: () => Record<string, string>;
    };
  }
}

export async function startContinentStudio(): Promise<void> {
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';

  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  setCanvasSize(canvas);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D context.');
  }

  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.top = '8px';
  panel.style.left = '8px';
  panel.style.bottom = '8px';
  panel.style.width = '360px';
  panel.style.overflow = 'auto';
  panel.style.padding = '10px';
  panel.style.border = '1px solid rgba(255,255,255,0.18)';
  panel.style.borderRadius = '8px';
  panel.style.background = 'rgba(16, 20, 24, 0.86)';
  panel.style.color = '#f0f0f0';
  panel.style.font = '12px/1.3 monospace';
  panel.style.zIndex = '10';
  document.body.appendChild(panel);

  const title = document.createElement('div');
  title.textContent = 'Continent Generator Artifact';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '6px';
  panel.appendChild(title);

  const seedRow = createRow('Seed');
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.style.flex = '1';
  seedInput.style.font = '12px/1.2 monospace';
  seedRow.appendChild(seedInput);
  panel.appendChild(seedRow);

  const sizeSelect = createSelect('Size', SIZE_OPTIONS, 'region');
  panel.appendChild(sizeSelect.root);

  const aspectSelect = createSelect('Aspect Ratio', ASPECT_OPTIONS, 'landscape');
  panel.appendChild(aspectSelect.root);

  panel.appendChild(createLabelBlock('Primary Geography'));

  const landSlider = createSlider('Land Fraction', 1, 10, 1, 5);
  const reliefSlider = createSlider('Relief', 1, 10, 1, 6);
  const fragmentationSlider = createSlider('Fragmentation', 1, 10, 1, 4);
  const smoothingSlider = createSlider('Coastal Smoothing', 1, 10, 1, 6);
  panel.append(landSlider.root, reliefSlider.root, fragmentationSlider.root, smoothingSlider.root);

  panel.appendChild(createLabelBlock('Biome Mix'));
  const riversSlider = createSlider('Rivers', 0, 1, 0.01, 0.6, 2);
  const grassSlider = createSlider('Grassland', 0, 1, 0.01, 1, 2);
  const temperateSlider = createSlider('Temperate Forest', 0, 1, 0.01, 1, 2);
  const rainSlider = createSlider('Rainforest', 0, 1, 0.01, 0.5, 2);
  const desertSlider = createSlider('Desert', 0, 1, 0.01, 0.6, 2);
  const mountainsSlider = createSlider('Mountains', 0, 1, 0.01, 0.7, 2);
  const tundraSlider = createSlider('Tundra', 0, 1, 0.01, 0.3, 2);
  panel.append(
    riversSlider.root,
    grassSlider.root,
    temperateSlider.root,
    rainSlider.root,
    desertSlider.root,
    mountainsSlider.root,
    tundraSlider.root,
  );

  const resetMixButton = createButton('Reset Biome Mix');
  resetMixButton.style.marginTop = '8px';
  panel.appendChild(resetMixButton);

  const toggleAdvancedButton = createButton('Toggle Advanced Mode');
  toggleAdvancedButton.style.marginTop = '8px';
  panel.appendChild(toggleAdvancedButton);

  const advancedSection = document.createElement('div');
  advancedSection.style.display = 'none';
  panel.appendChild(advancedSection);

  advancedSection.appendChild(createLabelBlock('Advanced'));
  const latitudeCenterSlider = createSlider('Latitude Center', -70, 70, 1, 50);
  const latitudeSpanSlider = createSlider('Latitude Span', 20, 180, 1, 45);
  const plateCountSlider = createSlider('Plate Count', -1, 1, 1, 0);
  const peakSlider = createSlider('Mountain Peakiness', 1, 10, 1, 5);
  const climateBiasSlider = createSlider('Climate Bias', -5, 5, 1, 0);
  const islandSlider = createSlider('Island Density', 0, 10, 1, 4);
  const latLongGridToggle = createCheckbox('Lat/Long Grid', false);
  advancedSection.append(
    latitudeCenterSlider.root,
    latitudeSpanSlider.root,
    plateCountSlider.root,
    peakSlider.root,
    climateBiasSlider.root,
    islandSlider.root,
    latLongGridToggle.root,
  );

  const importExportRow = document.createElement('div');
  importExportRow.style.display = 'flex';
  importExportRow.style.gap = '6px';
  importExportRow.style.marginTop = '8px';
  const importButton = createButton('Import');
  const exportButton = createButton('Export');
  importExportRow.append(importButton, exportButton);
  advancedSection.appendChild(importExportRow);

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'grid';
  buttonRow.style.gridTemplateColumns = '1fr 1fr';
  buttonRow.style.gap = '6px';
  buttonRow.style.marginTop = '10px';
  const generateButton = createButton('Generate');
  const rerollButton = createButton('Reroll');
  const randomizeButton = createButton('Randomize');
  const resetButton = createButton('Reset');
  const saveButton = createButton('Save as PNG');
  buttonRow.append(generateButton, rerollButton, randomizeButton, resetButton, saveButton);
  panel.appendChild(buttonRow);

  const status = document.createElement('pre');
  status.style.marginTop = '8px';
  status.style.whiteSpace = 'pre-wrap';
  status.style.font = '11px/1.35 monospace';
  panel.appendChild(status);

  const legend = document.createElement('div');
  legend.style.marginTop = '8px';
  legend.style.paddingTop = '6px';
  legend.style.borderTop = '1px solid rgba(255, 255, 255, 0.15)';
  const legendTitle = document.createElement('div');
  legendTitle.textContent = 'Atlas Legend';
  legendTitle.style.marginBottom = '4px';
  legend.appendChild(legendTitle);
  for (const [biome, color] of Object.entries(ATLAS_PALETTE)) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';

    const swatch = document.createElement('span');
    swatch.style.display = 'inline-block';
    swatch.style.width = '10px';
    swatch.style.height = '10px';
    swatch.style.background = color;
    swatch.style.border = '1px solid rgba(255,255,255,0.3)';

    const label = document.createElement('span');
    label.textContent = biome;
    row.append(swatch, label);
    legend.appendChild(row);
  }
  panel.appendChild(legend);

  let advancedVisible = false;
  let controls = defaultControlsWithSeed();
  let map = generateContinent(controls);

  const atlasCanvas = createOffscreenCanvas(map.width, map.height);
  const atlasHiCanvas = createOffscreenCanvas(map.width * 2, map.height * 2);
  const atlasLoCanvas = createOffscreenCanvas(Math.max(64, Math.round(map.width * 0.6)), Math.max(64, Math.round(map.height * 0.6)));
  const atlasCtx = atlasCanvas.getContext('2d');
  const atlasHiCtx = atlasHiCanvas.getContext('2d');
  const atlasLoCtx = atlasLoCanvas.getContext('2d');
  if (!atlasCtx || !atlasHiCtx || !atlasLoCtx) {
    throw new Error('Unable to create atlas canvas contexts.');
  }

  let cameraX = map.width / 2;
  let cameraY = map.height / 2;
  let zoom = 1;
  let fullZoom = 1;
  let midZoom = 1;
  let highZoom = 1;
  let isDragging = false;
  let dragLastX = 0;
  let dragLastY = 0;
  let showLatLongGrid = latLongGridToggle.input.checked;
  let fpsEma = 60;
  let frameMsEma = 16.7;
  let lastFrame = performance.now();

  function fitZoomForCurrentMap(): number {
    return Math.min(canvas.width / map.width, canvas.height / map.height);
  }

  function clampCamera(): void {
    const visibleWidth = canvas.width / Math.max(0.01, zoom);
    const visibleHeight = canvas.height / Math.max(0.01, zoom);
    if (visibleWidth >= map.width) {
      cameraX = map.width / 2;
    } else {
      cameraX = clamp(cameraX, visibleWidth / 2, map.width - visibleWidth / 2);
    }
    if (visibleHeight >= map.height) {
      cameraY = map.height / 2;
    } else {
      cameraY = clamp(cameraY, visibleHeight / 2, map.height - visibleHeight / 2);
    }
  }

  function updateZoomTargets(): void {
    fullZoom = fitZoomForCurrentMap();
    midZoom = clamp(fullZoom * 1.45, fullZoom * 0.9, Math.max(fullZoom * 2.2, 1.5));
    highZoom = clamp(fullZoom * 2.7, midZoom, 8);
    zoom = clamp(zoom, fullZoom * 0.6, 8);
    clampCamera();
  }

  function refreshAtlasCanvas(): void {
    atlasCanvas.width = map.width;
    atlasCanvas.height = map.height;
    atlasHiCanvas.width = map.width * 2;
    atlasHiCanvas.height = map.height * 2;
    atlasLoCanvas.width = Math.max(96, Math.round(map.width * 0.6));
    atlasLoCanvas.height = Math.max(96, Math.round(map.height * 0.6));

    const baseRgba = buildAtlasRgba(map, atlasCanvas.width, atlasCanvas.height);
    atlasCtx.putImageData(new ImageData(baseRgba, atlasCanvas.width, atlasCanvas.height), 0, 0);

    const hiRgba = buildAtlasRgba(map, atlasHiCanvas.width, atlasHiCanvas.height);
    atlasHiCtx.putImageData(new ImageData(hiRgba, atlasHiCanvas.width, atlasHiCanvas.height), 0, 0);

    const lowRgba = buildAtlasRgba(map, atlasLoCanvas.width, atlasLoCanvas.height);
    atlasLoCtx.putImageData(new ImageData(lowRgba, atlasLoCanvas.width, atlasLoCanvas.height), 0, 0);
  }

  function readControlsFromUi(): ContinentControls {
    const next: ContinentControls = {
      seed: seedInput.value.trim().length > 0 ? seedInput.value.trim() : randomHumanSeed(),
      preset: 'earth-like',
      size: sizeSelect.getValue(),
      aspectRatio: aspectSelect.getValue(),
      landFraction: Number(landSlider.input.value),
      relief: Number(reliefSlider.input.value),
      fragmentation: Number(fragmentationSlider.input.value),
      coastalSmoothing: Number(smoothingSlider.input.value),
      latitudeCenter: Number(latitudeCenterSlider.input.value),
      latitudeSpan: Number(latitudeSpanSlider.input.value),
      plateCount: Number(plateCountSlider.input.value),
      mountainPeakiness: Number(peakSlider.input.value),
      climateBias: Number(climateBiasSlider.input.value),
      islandDensity: Number(islandSlider.input.value),
      biomeMix: {
        rivers: Number(riversSlider.input.value),
        grassland: Number(grassSlider.input.value),
        temperateForest: Number(temperateSlider.input.value),
        rainforest: Number(rainSlider.input.value),
        desert: Number(desertSlider.input.value),
        mountains: Number(mountainsSlider.input.value),
        tundra: Number(tundraSlider.input.value),
      },
    };
    return next;
  }

  function writeControlsToUi(next: ContinentControls): void {
    seedInput.value = next.seed;
    sizeSelect.setValue(next.size);
    aspectSelect.setValue(next.aspectRatio);

    updateSlider(landSlider, next.landFraction);
    updateSlider(reliefSlider, next.relief);
    updateSlider(fragmentationSlider, next.fragmentation);
    updateSlider(smoothingSlider, next.coastalSmoothing);

    updateSlider(latitudeCenterSlider, next.latitudeCenter);
    updateSlider(latitudeSpanSlider, next.latitudeSpan);
    updateSlider(plateCountSlider, next.plateCount);
    updateSlider(peakSlider, next.mountainPeakiness);
    updateSlider(climateBiasSlider, next.climateBias);
    updateSlider(islandSlider, next.islandDensity);

    updateSlider(riversSlider, next.biomeMix.rivers, 2);
    updateSlider(grassSlider, next.biomeMix.grassland, 2);
    updateSlider(temperateSlider, next.biomeMix.temperateForest, 2);
    updateSlider(rainSlider, next.biomeMix.rainforest, 2);
    updateSlider(desertSlider, next.biomeMix.desert, 2);
    updateSlider(mountainsSlider, next.biomeMix.mountains, 2);
    updateSlider(tundraSlider, next.biomeMix.tundra, 2);
  }

  function regenerate(resetCamera: boolean): void {
    const prevWidth = map.width;
    const prevHeight = map.height;
    controls = readControlsFromUi();
    map = generateContinent(controls);
    refreshAtlasCanvas();
    if (resetCamera || prevWidth !== map.width || prevHeight !== map.height) {
      cameraX = map.width / 2;
      cameraY = map.height / 2;
      zoom = fitZoomForCurrentMap() * 1.02;
    }
    updateZoomTargets();
  }

  async function savePng(scale = 2): Promise<void> {
    const exportWidth = map.width * scale;
    const exportHeight = map.height * scale;
    const rgba = buildAtlasRgba(map, exportWidth, exportHeight);
    const exportCanvas = createOffscreenCanvas(exportWidth, exportHeight);
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      return;
    }
    const image = new ImageData(rgba, exportWidth, exportHeight);
    exportCtx.putImageData(image, 0, 0);
    await new Promise<void>((resolve) => {
      exportCanvas.toBlob((blob) => {
        if (!blob) {
          resolve();
          return;
        }
        downloadBlob(blob, `${controls.seed.replace(/\s+/g, '')}_${map.identityHash}.png`);
        resolve();
      }, 'image/png');
    });
  }

  function exportCode(): string {
    const payload = exportContinentControls(readControlsFromUi());
    return payload.code;
  }

  function importCode(code: string): boolean {
    const parsed = importContinentControls(code);
    if (!parsed) {
      return false;
    }
    controls = parsed;
    writeControlsToUi(parsed);
    regenerate(true);
    return true;
  }

  function updateStatusText(): void {
    const exportString = exportCode();
    status.textContent =
      `seed=${controls.seed}\n` +
      `map=${map.width}x${map.height} hash=${map.identityHash}\n` +
      `zoom=${zoom.toFixed(3)} full=${fullZoom.toFixed(3)} mid=${midZoom.toFixed(3)} high=${highZoom.toFixed(3)}\n` +
      `fps~${fpsEma.toFixed(1)} frame~${frameMsEma.toFixed(2)}ms\n` +
      `exportLen=${exportString.length}`;
  }

  seedInput.value = controls.seed;
  writeControlsToUi(controls);
  regenerate(true);

  generateButton.addEventListener('click', () => {
    regenerate(false);
  });

  rerollButton.addEventListener('click', () => {
    seedInput.value = randomHumanSeed();
    regenerate(true);
  });

  randomizeButton.addEventListener('click', () => {
    const current = readControlsFromUi();
    const randomized = randomizeControls(current);
    randomized.seed = current.seed;
    writeControlsToUi(randomized);
    regenerate(true);
  });

  resetButton.addEventListener('click', () => {
    const keepSeed = seedInput.value.trim().length > 0 ? seedInput.value.trim() : randomHumanSeed();
    const reset = defaultControlsWithSeed(keepSeed);
    writeControlsToUi(reset);
    regenerate(true);
  });

  saveButton.addEventListener('click', () => {
    void savePng(2);
  });

  sizeSelect.select.addEventListener('change', () => {
    regenerate(true);
  });

  aspectSelect.select.addEventListener('change', () => {
    regenerate(true);
  });

  resetMixButton.addEventListener('click', () => {
    const next = resetBiomeMix(readControlsFromUi());
    writeControlsToUi(next);
  });

  toggleAdvancedButton.addEventListener('click', () => {
    advancedVisible = !advancedVisible;
    advancedSection.style.display = advancedVisible ? 'block' : 'none';
  });

  exportButton.addEventListener('click', () => {
    const code = exportCode();
    const clip = navigator.clipboard;
    if (clip) {
      void clip.writeText(code);
    }
    window.prompt('Continent Export String', code);
  });

  importButton.addEventListener('click', () => {
    const value = window.prompt('Paste continent export string');
    if (!value) {
      return;
    }
    if (!importCode(value)) {
      window.alert('Invalid import string.');
    }
  });

  latLongGridToggle.input.addEventListener('change', () => {
    showLatLongGrid = latLongGridToggle.input.checked;
  });

  canvas.addEventListener('pointerdown', (event) => {
    isDragging = true;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
  });

  window.addEventListener('pointermove', (event) => {
    if (!isDragging) {
      return;
    }
    const dx = event.clientX - dragLastX;
    const dy = event.clientY - dragLastY;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
    cameraX -= dx / zoom;
    cameraY -= dy / zoom;
    clampCamera();
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      const worldX = (sx - canvas.width / 2) / zoom + cameraX;
      const worldY = (sy - canvas.height / 2) / zoom + cameraY;

      const nextZoom = clamp(zoom * Math.exp(-event.deltaY * 0.0012), fullZoom * 0.6, 8);
      zoom = nextZoom;
      cameraX = worldX - (sx - canvas.width / 2) / zoom;
      cameraY = worldY - (sy - canvas.height / 2) / zoom;
      clampCamera();
    },
    { passive: false },
  );

  window.addEventListener('resize', () => {
    setCanvasSize(canvas);
    updateZoomTargets();
  });

  function draw(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#234c74';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const atlasSource = zoom <= fullZoom * 1.05
      ? atlasLoCanvas
      : zoom >= highZoom * 0.88
        ? atlasHiCanvas
        : atlasCanvas;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(zoom, 0, 0, zoom, canvas.width / 2 - cameraX * zoom, canvas.height / 2 - cameraY * zoom);
    ctx.drawImage(atlasSource, 0, 0, map.width, map.height);

    if (showLatLongGrid) {
      const latSpan = controls.latitudeSpan;
      const latTop = controls.latitudeCenter + latSpan * 0.5;
      const latBottom = controls.latitudeCenter - latSpan * 0.5;
      const lonStep = zoom > highZoom * 0.85 ? 15 : 30;
      const latStep = zoom > highZoom * 0.85 ? 10 : 20;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 0.9 / Math.max(zoom, 0.001);
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += lonStep) {
        const x = ((lon + 180) / 360) * map.width;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, map.height);
      }
      if (latSpan > 0) {
        const minLat = Math.ceil(latBottom / latStep) * latStep;
        for (let lat = minLat; lat <= latTop; lat += latStep) {
          const y = ((latTop - lat) / latSpan) * map.height;
          ctx.moveTo(0, y);
          ctx.lineTo(map.width, y);
        }
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1 / Math.max(zoom, 0.001);
    ctx.strokeRect(0.5 / zoom, 0.5 / zoom, map.width - 1 / zoom, map.height - 1 / zoom);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function loop(now: number): void {
    const dt = now - lastFrame;
    lastFrame = now;
    frameMsEma = frameMsEma * 0.92 + dt * 0.08;
    const fpsInstant = dt > 0 ? 1000 / dt : 0;
    fpsEma = fpsEma * 0.92 + fpsInstant * 0.08;

    draw();
    if (Math.floor(now / 250) !== Math.floor((now - dt) / 250)) {
      updateStatusText();
    }
    requestAnimationFrame(loop);
  }

  updateStatusText();
  requestAnimationFrame(loop);

  window.__continentTool = {
    getMapHash: () => map.identityHash,
    getExportCode: () => exportCode(),
    importCode,
    setSeed: (seed: string) => {
      seedInput.value = seed;
    },
    regenerate: () => {
      regenerate(false);
    },
    getControls: () => readControlsFromUi(),
    getPalette: () => ({ ...ATLAS_PALETTE }),
  };
}

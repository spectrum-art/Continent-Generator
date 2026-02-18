import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  buildAtlasRgba,
  defaultControlsWithSeed,
  generateContinent,
  type AspectRatioOption,
  type ContinentControls,
  type SizeOption,
} from '../src/gen/continent';
import { evaluateRealismMetrics, type RealismMetrics } from '../src/gen/realismMetrics';

type SnapshotCase = {
  name: string;
  controls: ContinentControls;
};

type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CaseOutput = {
  name: string;
  file: string;
  metrics: RealismMetrics;
  identityHash: string;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createCases(): SnapshotCase[] {
  const sizes: SizeOption[] = ['isle', 'region', 'supercontinent'];
  const landFractions = [3, 5, 8];
  const seeds = ['GreenChair', 'SilentHarbor', 'RedComet'];
  const cases: SnapshotCase[] = [];

  for (let si = 0; si < sizes.length; si += 1) {
    for (let li = 0; li < landFractions.length; li += 1) {
      const seed = seeds[(si * 3 + li) % seeds.length];
      const controls = defaultControlsWithSeed(seed);
      controls.size = sizes[si];
      controls.landFraction = landFractions[li];
      controls.relief = (si + li) % 2 === 0 ? 3 : 8;
      controls.fragmentation = (si + li) % 2 === 0 ? 3 : 8;
      controls.aspectRatio = (si + li) % 2 === 0 ? 'square' : 'landscape';
      controls.biomeMix.rivers = 0.75;
      cases.push({
        name: `${sizes[si]}_lf${landFractions[li]}_${controls.aspectRatio}_r${controls.relief}_f${controls.fragmentation}_${seed.toLowerCase()}`,
        controls,
      });
    }
  }

  const extras: Array<{
    size: SizeOption;
    aspectRatio: AspectRatioOption;
    seed: string;
    landFraction: number;
    relief: number;
    fragmentation: number;
  }> = [
    { size: 'region', aspectRatio: 'landscape', seed: 'MistyCove', landFraction: 6, relief: 8, fragmentation: 8 },
    { size: 'supercontinent', aspectRatio: 'square', seed: 'StoneField', landFraction: 7, relief: 8, fragmentation: 3 },
    { size: 'isle', aspectRatio: 'landscape', seed: 'AmberDelta', landFraction: 4, relief: 3, fragmentation: 8 },
  ];

  for (const extra of extras) {
    const controls = defaultControlsWithSeed(extra.seed);
    controls.size = extra.size;
    controls.aspectRatio = extra.aspectRatio;
    controls.landFraction = extra.landFraction;
    controls.relief = extra.relief;
    controls.fragmentation = extra.fragmentation;
    controls.biomeMix.rivers = 0.75;
    cases.push({
      name: `${extra.size}_lf${extra.landFraction}_${extra.aspectRatio}_r${extra.relief}_f${extra.fragmentation}_${extra.seed.toLowerCase()}`,
      controls,
    });
  }

  return cases;
}

function findBestCrop(map: ReturnType<typeof generateContinent>, mode: 'mountain' | 'river'): Crop {
  const cropWidth = Math.max(96, Math.floor(map.width * 0.34));
  const cropHeight = Math.max(96, Math.floor(map.height * 0.34));
  const stepX = Math.max(12, Math.floor(cropWidth / 4));
  const stepY = Math.max(12, Math.floor(cropHeight / 4));
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestX = Math.max(0, Math.floor((map.width - cropWidth) * 0.5));
  let bestY = Math.max(0, Math.floor((map.height - cropHeight) * 0.5));

  for (let y = 0; y <= map.height - cropHeight; y += stepY) {
    for (let x = 0; x <= map.width - cropWidth; x += stepX) {
      let score = 0;
      let samples = 0;
      for (let sy = 0; sy < 10; sy += 1) {
        for (let sx = 0; sx < 10; sx += 1) {
          const px = x + Math.floor((sx + 0.5) * cropWidth / 10);
          const py = y + Math.floor((sy + 0.5) * cropHeight / 10);
          const index = py * map.width + px;
          if (map.land[index] === 0) {
            continue;
          }
          samples += 1;
          if (mode === 'mountain') {
            score += map.ridge[index] * 1.2 + map.elevation[index] * 0.6 - map.river[index] * 0.1;
          } else {
            const inland = clamp(map.distanceToOcean[index] / 20, 0, 1);
            score += map.river[index] * 2.2 + inland * 0.7 + map.moisture[index] * 0.2 - map.ridge[index] * 0.5;
          }
        }
      }
      if (samples < 16) {
        score -= 1000;
      } else {
        score /= samples;
      }
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  return { x: bestX, y: bestY, width: cropWidth, height: cropHeight };
}

function drawCropNearest(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  crop: Crop,
  dst: Uint8ClampedArray,
  dstWidth: number,
  dstHeight: number,
  offsetX: number,
  offsetY: number,
  panelWidth: number,
  panelHeight: number,
): void {
  const safeW = Math.max(1, crop.width);
  const safeH = Math.max(1, crop.height);
  for (let y = 0; y < panelHeight; y += 1) {
    const sy = clamp(crop.y + Math.floor((y / Math.max(1, panelHeight - 1)) * (safeH - 1)), 0, srcHeight - 1);
    for (let x = 0; x < panelWidth; x += 1) {
      const sx = clamp(crop.x + Math.floor((x / Math.max(1, panelWidth - 1)) * (safeW - 1)), 0, srcWidth - 1);
      const srcIndex = (sy * srcWidth + sx) * 4;
      const dx = offsetX + x;
      const dy = offsetY + y;
      const dstIndex = (dy * dstWidth + dx) * 4;
      dst[dstIndex] = src[srcIndex];
      dst[dstIndex + 1] = src[srcIndex + 1];
      dst[dstIndex + 2] = src[srcIndex + 2];
      dst[dstIndex + 3] = 255;
    }
  }
}

function buildCaseTriptych(map: ReturnType<typeof generateContinent>): { rgba: Uint8ClampedArray; width: number; height: number } {
  const panelWidth = 320;
  const panelHeight = 216;
  const width = panelWidth * 3;
  const height = panelHeight;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const source = buildAtlasRgba(map, map.width, map.height);
  const fullCrop: Crop = { x: 0, y: 0, width: map.width, height: map.height };
  const mountainCrop = findBestCrop(map, 'mountain');
  const riverCrop = findBestCrop(map, 'river');

  drawCropNearest(source, map.width, map.height, fullCrop, rgba, width, height, 0, 0, panelWidth, panelHeight);
  drawCropNearest(source, map.width, map.height, mountainCrop, rgba, width, height, panelWidth, 0, panelWidth, panelHeight);
  drawCropNearest(source, map.width, map.height, riverCrop, rgba, width, height, panelWidth * 2, 0, panelWidth, panelHeight);
  return { rgba, width, height };
}

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length >>> 0, 0);
  const crcInput = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBytes, Buffer.from(data), crc]);
}

async function writePng(path: string, width: number, height: number, rgba: Uint8ClampedArray): Promise<void> {
  const raw = Buffer.allocUnsafe((width * 4 + 1) * height);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[rawOffset] = 0;
    rawOffset += 1;
    const rowStart = y * width * 4;
    for (let i = 0; i < width * 4; i += 1) {
      raw[rawOffset + i] = rgba[rowStart + i];
    }
    rawOffset += width * 4;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width >>> 0, 0);
  ihdr.writeUInt32BE(height >>> 0, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ]);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, png);
}

function composeMontage(cases: Array<{ rgba: Uint8ClampedArray; width: number; height: number }>): {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const columns = 2;
  const tileWidth = 480;
  const tileHeight = 108;
  const rows = Math.ceil(cases.length / columns);
  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < cases.length; i += 1) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const dx = col * tileWidth;
    const dy = row * tileHeight;
    const crop: Crop = { x: 0, y: 0, width: cases[i].width, height: cases[i].height };
    drawCropNearest(cases[i].rgba, cases[i].width, cases[i].height, crop, rgba, width, height, dx, dy, tileWidth, tileHeight);
  }

  return { rgba, width, height };
}

function runId(): string {
  const now = new Date();
  const date = now.toISOString().replace(/[:.]/g, '-');
  const salt = (hashString(String(now.getTime())) % 10000).toString().padStart(4, '0');
  return `${date}_${salt}`;
}

async function main(): Promise<void> {
  const cases = createCases();
  const outDir = join('artifacts', 'ms17', runId());
  await mkdir(outDir, { recursive: true });

  const outputs: CaseOutput[] = [];
  const montageInput: Array<{ rgba: Uint8ClampedArray; width: number; height: number }> = [];

  for (const testCase of cases) {
    const map = generateContinent(testCase.controls);
    const metrics = evaluateRealismMetrics(map);
    const triptych = buildCaseTriptych(map);
    const file = `case_${testCase.name}.png`;
    await writePng(join(outDir, file), triptych.width, triptych.height, triptych.rgba);
    montageInput.push(triptych);
    outputs.push({
      name: testCase.name,
      file,
      metrics,
      identityHash: map.identityHash,
      width: map.width,
      height: map.height,
    });
  }

  const montage = composeMontage(montageInput);
  await writePng(join(outDir, 'montage.png'), montage.width, montage.height, montage.rgba);

  const failing = outputs.filter((o) => !o.metrics.gates.pass);
  const summary = {
    runId: outDir.split('/').at(-1),
    totalCases: outputs.length,
    passCount: outputs.length - failing.length,
    failCount: failing.length,
    failingCases: failing.map((f) => ({ name: f.name, reasons: f.metrics.gates.reasons })),
  };
  await writeFile(join(outDir, 'metrics.json'), JSON.stringify({ summary, cases: outputs }, null, 2), 'utf8');

  const critiqueLines = [
    `snapshot_dir=${outDir}`,
    `cases=${summary.totalCases} pass=${summary.passCount} fail=${summary.failCount}`,
    ...summary.failingCases.map((f) => `fail:${f.name}:${f.reasons.join(',')}`),
  ];
  await writeFile(join(outDir, 'critique.txt'), critiqueLines.join('\n'), 'utf8');
  console.log(critiqueLines.join('\n'));
}

void main();

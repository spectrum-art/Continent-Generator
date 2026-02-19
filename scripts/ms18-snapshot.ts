import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  buildAtlasRgba,
  buildElevationRgba,
  buildNormalRgba,
  defaultControlsWithSeed,
  generateContinent,
  type ContinentControls,
} from '../src/gen/continent';
import { evaluateDemRealism } from '../src/gen/realismMetrics';

type SnapshotCase = {
  name: string;
  controls: ContinentControls;
};

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
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    const row = y * width * 4;
    for (let i = 0; i < width * 4; i += 1) {
      raw[offset + i] = rgba[row + i];
    }
    offset += width * 4;
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
  const png = Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))]);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, png);
}

function buildCases(): SnapshotCase[] {
  const configs: Array<{
    name: string;
    seed: string;
    size: ContinentControls['size'];
    aspect: ContinentControls['aspectRatio'];
    landFraction: number;
    relief: number;
    fragmentation: number;
  }> = [
    { name: 'isle_low', seed: 'GreenChair', size: 'isle', aspect: 'square', landFraction: 3, relief: 3, fragmentation: 3 },
    { name: 'isle_high', seed: 'RedComet', size: 'isle', aspect: 'landscape', landFraction: 7, relief: 8, fragmentation: 8 },
    { name: 'region_low', seed: 'SilentHarbor', size: 'region', aspect: 'square', landFraction: 4, relief: 4, fragmentation: 3 },
    { name: 'region_high', seed: 'MistyCove', size: 'region', aspect: 'landscape', landFraction: 7, relief: 8, fragmentation: 8 },
    { name: 'super_low', seed: 'StoneField', size: 'supercontinent', aspect: 'square', landFraction: 4, relief: 4, fragmentation: 3 },
    { name: 'super_high', seed: 'AmberDelta', size: 'supercontinent', aspect: 'landscape', landFraction: 7, relief: 8, fragmentation: 8 },
  ];
  return configs.map((entry) => {
    const controls = defaultControlsWithSeed(entry.seed);
    controls.size = entry.size;
    controls.aspectRatio = entry.aspect;
    controls.landFraction = entry.landFraction;
    controls.relief = entry.relief;
    controls.fragmentation = entry.fragmentation;
    controls.coastalSmoothing = 5;
    return { name: entry.name, controls };
  });
}

function runId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const outDir = join('artifacts', 'ms20', runId());
  await mkdir(outDir, { recursive: true });

  const cases = buildCases();
  const outputs: Array<{
    name: string;
    identityHash: string;
    width: number;
    height: number;
    metrics: ReturnType<typeof evaluateDemRealism>;
  }> = [];

  for (const c of cases) {
    const map = generateContinent(c.controls);
    const metrics = evaluateDemRealism(map);
    outputs.push({
      name: c.name,
      identityHash: map.identityHash,
      width: map.width,
      height: map.height,
      metrics,
    });

    if (c.name === 'region_high') {
      await writePng(join(outDir, 'dem.png'), map.width, map.height, buildElevationRgba(map));
      await writePng(join(outDir, 'normal.png'), map.width, map.height, buildNormalRgba(map));
      await writePng(join(outDir, 'hillshade.png'), map.width, map.height, buildAtlasRgba(map));
    }
  }

  const failing = outputs.filter((o) => !o.metrics.gates.pass);
  const summary = {
    totalCases: outputs.length,
    passCount: outputs.length - failing.length,
    failCount: failing.length,
    failing: failing.map((f) => ({ name: f.name, reasons: f.metrics.gates.reasons })),
  };

  await writeFile(join(outDir, 'metrics.json'), JSON.stringify({ summary, cases: outputs }, null, 2), 'utf8');
  console.log(`snapshot_dir=${outDir}`);
  console.log(`cases=${summary.totalCases} pass=${summary.passCount} fail=${summary.failCount}`);

  if (summary.failCount > 0) {
    process.exitCode = 1;
  }
}

void main();

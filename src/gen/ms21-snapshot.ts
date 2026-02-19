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
} from './continent';
import { evaluateMs21Realism } from './ms21Metrics';

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

function runId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
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
    { name: 'isle_lowrelief', seed: 'GreenChair', size: 'isle', aspect: 'square', landFraction: 3, relief: 3, fragmentation: 3 },
    { name: 'isle_highrelief', seed: 'RedComet', size: 'isle', aspect: 'landscape', landFraction: 7, relief: 8, fragmentation: 7 },
    { name: 'region_lowland', seed: 'SilentHarbor', size: 'region', aspect: 'square', landFraction: 4, relief: 4, fragmentation: 3 },
    { name: 'region_mid', seed: 'MistyCove', size: 'region', aspect: 'landscape', landFraction: 6, relief: 6, fragmentation: 5 },
    { name: 'region_highrelief', seed: 'AmberDelta', size: 'region', aspect: 'landscape', landFraction: 7, relief: 9, fragmentation: 8 },
    { name: 'subcontinent_balanced', seed: 'StoneField', size: 'subcontinent', aspect: 'wide', landFraction: 6, relief: 7, fragmentation: 5 },
    { name: 'subcontinent_fragmented', seed: 'IronCove', size: 'subcontinent', aspect: 'landscape', landFraction: 6, relief: 8, fragmentation: 8 },
    { name: 'super_lowland', seed: 'QuietMesa', size: 'supercontinent', aspect: 'square', landFraction: 4, relief: 4, fragmentation: 4 },
    { name: 'super_mid', seed: 'SolarPass', size: 'supercontinent', aspect: 'landscape', landFraction: 6, relief: 7, fragmentation: 5 },
    { name: 'super_high', seed: 'WildSummit', size: 'supercontinent', aspect: 'wide', landFraction: 7, relief: 9, fragmentation: 8 },
  ];

  return configs.map((entry) => {
    const controls = defaultControlsWithSeed(entry.seed);
    controls.size = entry.size;
    controls.aspectRatio = entry.aspect;
    controls.landFraction = entry.landFraction;
    controls.relief = entry.relief;
    controls.fragmentation = entry.fragmentation;
    return { name: entry.name, controls };
  });
}

function critiqueLine(failedReasons: string[]): string {
  if (failedReasons.length === 0) {
    return 'PASS: all realism gates satisfied.';
  }
  const stages: Record<string, string> = {
    conditioning: 'Tune hydrology conditioning (priority-flood / outlet policy).',
    incision: 'Tune incision loop (channel threshold, incision k, iteration count).',
    diffusion: 'Tune diffusion strength to preserve ridge/valley separation.',
    'sea-level': 'Tune sea-level quantile and coastline smoothing (avoid flattening).',
    hillshade: 'Tune hillshade (multi-azimuth weights or edge handling).',
  };
  const unique = [...new Set(failedReasons)];
  const hints = unique.map((r) => stages[r] ?? `Inspect stage: ${r}`).join(' ');
  return `FAIL: ${unique.join(', ')}. ${hints}`;
}

async function main(): Promise<void> {
  const outDir = join('artifacts', 'ms21', runId());
  await mkdir(outDir, { recursive: true });

  const cases = buildCases();
  const outputs: Array<{
    name: string;
    identityHash: string;
    width: number;
    height: number;
    metrics: ReturnType<typeof evaluateMs21Realism>;
  }> = [];

  for (const c of cases) {
    const map = generateContinent(c.controls);
    const metrics = evaluateMs21Realism(map);
    outputs.push({
      name: c.name,
      identityHash: map.identityHash,
      width: map.width,
      height: map.height,
      metrics,
    });

    if (c.name === 'region_highrelief') {
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

  const critique = [
    `MS21 Snapshot Run: ${outDir}`,
    `cases=${summary.totalCases} pass=${summary.passCount} fail=${summary.failCount}`,
    '',
  ];
  for (const item of outputs) {
    critique.push(`${item.name}: ${critiqueLine(item.metrics.gates.reasons)}`);
    critique.push(`  sink_count=${item.metrics.metrics.sink_count}`);
    critique.push(`  sink_fraction=${item.metrics.metrics.sink_fraction.toFixed(6)}`);
    critique.push(`  drain_to_ocean_fraction=${item.metrics.metrics.drain_to_ocean_fraction.toFixed(6)}`);
    critique.push(`  trunk_river_lengths=${item.metrics.metrics.trunk_river_lengths.join(',')}`);
    critique.push(`  elevation_spread_above_sea=${item.metrics.metrics.elevation_spread_above_sea.toFixed(6)}`);
    critique.push(`  stddev_above_sea=${item.metrics.metrics.stddev_above_sea.toFixed(6)}`);
    critique.push(`  curvature_ratio=${item.metrics.metrics.curvature_stats.ratio.toFixed(6)}`);
    critique.push(`  hillshade_edge_discontinuity_score=${item.metrics.metrics.hillshade_edge_discontinuity_score.toFixed(6)}`);
    critique.push('');
  }
  await writeFile(join(outDir, 'critique.txt'), critique.join('\n'), 'utf8');

  console.log(`snapshot_dir=${outDir}`);
  console.log(`cases=${summary.totalCases} pass=${summary.passCount} fail=${summary.failCount}`);

  if (summary.failCount > 0) {
    process.exitCode = 1;
  }
}

void main();

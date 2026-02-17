import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderMainSnapshotRgba, renderMinimapSnapshotRgba } from '../src/render/snapshotRender';

type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function chunk(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + payload.length);
  out.set(u32(payload.length), 0);
  out.set(typeBytes, 4);
  out.set(payload, 8);
  const crcInput = new Uint8Array(typeBytes.length + payload.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(payload, typeBytes.length);
  out.set(u32(crc32(crcInput)), 8 + payload.length);
  return out;
}

function encodePng(image: RgbaImage): Uint8Array {
  const stride = image.width * 4;
  const scanlines = new Uint8Array((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (stride + 1);
    scanlines[rowOffset] = 0;
    scanlines.set(image.data.subarray(y * stride, y * stride + stride), rowOffset + 1);
  }

  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(image.width), 0);
  ihdr.set(u32(image.height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = new Uint8Array(deflateSync(scanlines));
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', idat);
  const iendChunk = chunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);
  return png;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('snapshot artifacts', () => {
  const runSnapshots = process.env.SNAPSHOT_ARTIFACTS === '1';

  (runSnapshots ? it : it.skip)(
    'writes deterministic main/minimap png artifacts for fixed view',
    () => {
      const seed = 'default';
      const centerQ = 0;
      const centerR = 0;
      const zoom = 0.82;

      const mainA = renderMainSnapshotRgba({
        seed,
        centerQ,
        centerR,
        zoom,
        width: 640,
        height: 360,
      });
      const mainB = renderMainSnapshotRgba({
        seed,
        centerQ,
        centerR,
        zoom,
        width: 640,
        height: 360,
      });
      const minimapA = renderMinimapSnapshotRgba(seed, centerQ, centerR, {
        size: 192,
        sampleStep: 1,
        worldUnitsPerPixel: 14 * 0.65,
      });
      const minimapB = renderMinimapSnapshotRgba(seed, centerQ, centerR, {
        size: 192,
        sampleStep: 1,
        worldUnitsPerPixel: 14 * 0.65,
      });

      const mainPngA = encodePng(mainA);
      const mainPngB = encodePng(mainB);
      const minimapPngA = encodePng(minimapA);
      const minimapPngB = encodePng(minimapB);

      expect(hashBytes(mainPngA)).toBe(hashBytes(mainPngB));
      expect(hashBytes(minimapPngA)).toBe(hashBytes(minimapPngB));

      const artifactsDir = join(process.cwd(), 'artifacts');
      mkdirSync(artifactsDir, { recursive: true });
      const suffix = `seed-${seed}_zoom-${zoom.toFixed(2)}_q-${centerQ}_r-${centerR}`;
      writeFileSync(join(artifactsDir, `main_${suffix}.png`), mainPngA);
      writeFileSync(join(artifactsDir, `minimap_${suffix}.png`), minimapPngA);
    },
    20000,
  );
});

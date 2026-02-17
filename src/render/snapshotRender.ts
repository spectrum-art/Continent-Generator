import { elevationAt, getTileAt, waterShadeScalarAt } from '../gen/generator';
import { axialToPixel, axialToSample, pixelToAxial, roundAxial } from './hex';
import { minimapColorForPixel, type MinimapOptions } from './minimap';
import { TILE_PALETTE } from './palette';
import { colorForRenderedTile } from './style';

export type MainSnapshotOptions = {
  seed: string;
  centerQ: number;
  centerR: number;
  zoom: number;
  width: number;
  height: number;
};

type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

function toByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function writeColor(target: Uint8Array, offset: number, color: number): void {
  target[offset] = toByte((color >> 16) & 0xff);
  target[offset + 1] = toByte((color >> 8) & 0xff);
  target[offset + 2] = toByte(color & 0xff);
  target[offset + 3] = 255;
}

function cssHexToColor(cssHex: string): number {
  return Number.parseInt(cssHex.slice(1), 16);
}

export function renderMainSnapshotRgba(options: MainSnapshotOptions): RgbaImage {
  const data = new Uint8Array(options.width * options.height * 4);
  const centerPixel = axialToPixel(options.centerQ, options.centerR);

  for (let py = 0; py < options.height; py += 1) {
    for (let px = 0; px < options.width; px += 1) {
      const worldX = (px - options.width / 2) / options.zoom + centerPixel.x;
      const worldY = (py - options.height / 2) / options.zoom + centerPixel.y;
      const axial = pixelToAxial(worldX, worldY);
      const rounded = roundAxial(axial.q, axial.r);
      const sample = axialToSample(rounded.q, rounded.r);
      const tile = getTileAt(options.seed, sample.x, sample.y);
      const elevation = elevationAt(options.seed, sample.x, sample.y);
      const waterShade = tile === 'water' || tile === 'lake'
        ? waterShadeScalarAt(options.seed, sample.x, sample.y)
        : null;
      const color = colorForRenderedTile(tile, TILE_PALETTE[tile], elevation, 0, waterShade);
      writeColor(data, (py * options.width + px) * 4, color);
    }
  }

  return { width: options.width, height: options.height, data };
}

export function renderMinimapSnapshotRgba(
  seed: string,
  centerQ: number,
  centerR: number,
  options: MinimapOptions,
): RgbaImage {
  const data = new Uint8Array(options.size * options.size * 4);
  for (let py = 0; py < options.size; py += 1) {
    for (let px = 0; px < options.size; px += 1) {
      const cssColor = minimapColorForPixel(seed, { q: centerQ, r: centerR }, px, py, options);
      writeColor(data, (py * options.size + px) * 4, cssHexToColor(cssColor));
    }
  }

  return { width: options.size, height: options.size, data };
}

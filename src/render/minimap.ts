import { getTileAt } from '../gen/generator';
import { axialToPixel, axialToSample, pixelToAxial, roundAxial, type AxialCoord } from './hex';
import { TILE_PALETTE_CSS } from './palette';

export type MinimapOptions = {
  size: number;
  sampleStep: number;
  worldUnitsPerPixel: number;
};

export function minimapColorForPixel(
  seed: string,
  center: AxialCoord,
  px: number,
  py: number,
  options: MinimapOptions,
): string {
  const centerAxialPixel = axialToPixel(center.q, center.r);
  const offsetX = (px + options.sampleStep / 2 - options.size / 2) * options.worldUnitsPerPixel;
  const offsetY = (py + options.sampleStep / 2 - options.size / 2) * options.worldUnitsPerPixel;
  const worldX = centerAxialPixel.x + offsetX;
  const worldY = centerAxialPixel.y + offsetY;
  const mappedAxial = pixelToAxial(worldX, worldY);
  const mappedRounded = roundAxial(mappedAxial.q, mappedAxial.r);
  const sample = axialToSample(mappedRounded.q, mappedRounded.r);
  const tile = getTileAt(seed, sample.x, sample.y);
  return TILE_PALETTE_CSS[tile];
}

export function collectMinimapColors(
  seed: string,
  center: AxialCoord,
  options: MinimapOptions,
): Set<string> {
  const colors = new Set<string>();
  for (let py = 0; py < options.size; py += options.sampleStep) {
    for (let px = 0; px < options.size; px += options.sampleStep) {
      colors.add(minimapColorForPixel(seed, center, px, py, options));
    }
  }
  return colors;
}

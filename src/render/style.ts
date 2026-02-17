import type { TileType } from '../gen/generator';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function channel(color: number, shift: number): number {
  return (color >> shift) & 0xff;
}

function combine(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function mixColor(a: number, b: number, t: number): number {
  const tt = clamp(t, 0, 1);
  const r = Math.round(channel(a, 16) * (1 - tt) + channel(b, 16) * tt);
  const g = Math.round(channel(a, 8) * (1 - tt) + channel(b, 8) * tt);
  const bch = Math.round(channel(a, 0) * (1 - tt) + channel(b, 0) * tt);
  return combine(r, g, bch);
}

export function shadeColor(color: number, factor: number): number {
  const f = clamp(factor, 0.5, 1.6);
  const r = clamp(Math.round(channel(color, 16) * f), 0, 255);
  const g = clamp(Math.round(channel(color, 8) * f), 0, 255);
  const b = clamp(Math.round(channel(color, 0) * f), 0, 255);
  return combine(r, g, b);
}

export function colorForRenderedTile(
  tile: TileType,
  baseColor: number,
  elevation: number,
  shorelineNeighbors: number,
  waterShade: number | null,
  slopeLight: number | null = null,
  riverFlow: number | null = null,
): number {
  let shaded = baseColor;
  if (tile === 'water' || tile === 'lake') {
    const scalar = waterShade ?? 0.5;
    shaded = shadeColor(baseColor, 1.08 - scalar * 0.48);
  } else if (tile === 'river') {
    const flow = clamp(riverFlow ?? 0.4, 0, 1);
    const slopeFactor = slopeLight === null ? 1 : 0.86 + (slopeLight - 0.5) * 0.22;
    const riverBody = shadeColor(baseColor, (0.7 + elevation * 0.15 + flow * 0.26) * slopeFactor);
    shaded = mixColor(riverBody, 0x2b6a95, 0.2 + flow * 0.22);
  } else {
    const baseFactor = 0.5 + elevation * 1.22;
    const rockBoost = tile === 'mountain' || tile === 'rock' ? 0.12 : 0;
    const slopeFactor = slopeLight === null ? 1 : 0.72 + (slopeLight - 0.5) * 0.78;
    shaded = shadeColor(baseColor, (baseFactor + rockBoost) * slopeFactor);
  }

  if (shorelineNeighbors > 0 && tile !== 'sand' && tile !== 'water' && tile !== 'lake' && tile !== 'river') {
    const shorelineTint = 0xd8c589;
    const mixAmount = clamp(shorelineNeighbors / 6, 0.18, 0.55);
    shaded = mixColor(shaded, shorelineTint, mixAmount);
  }

  return shaded;
}

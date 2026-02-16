import type { TileType } from '../gen/generator';

export const TILE_PALETTE: Record<TileType, number> = {
  water: 0x2d6cdf,
  river: 0x3f8ef2,
  sand: 0xe2cf89,
  grass: 0x63b359,
  forest: 0x2f7a43,
  mountain: 0x8d8f98,
  rock: 0x6a6972,
};

function toHex(color: number): string {
  return color.toString(16).padStart(6, '0');
}

export const TILE_PALETTE_CSS: Record<TileType, string> = {
  water: `#${toHex(TILE_PALETTE.water)}`,
  river: `#${toHex(TILE_PALETTE.river)}`,
  sand: `#${toHex(TILE_PALETTE.sand)}`,
  grass: `#${toHex(TILE_PALETTE.grass)}`,
  forest: `#${toHex(TILE_PALETTE.forest)}`,
  mountain: `#${toHex(TILE_PALETTE.mountain)}`,
  rock: `#${toHex(TILE_PALETTE.rock)}`,
};

export const LEGEND_ORDER: TileType[] = [
  'water',
  'river',
  'sand',
  'grass',
  'forest',
  'mountain',
  'rock',
];

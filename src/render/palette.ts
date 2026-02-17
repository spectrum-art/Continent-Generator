import type { TileType } from '../gen/generator';

export const TILE_PALETTE: Record<TileType, number> = {
  water: 0x2b669e,
  lake: 0x3f79aa,
  river: 0x4f8db5,
  sand: 0xd9c27a,
  grass: 0x5fa754,
  forest: 0x2f6f3f,
  mountain: 0x8e8d93,
  rock: 0x5b616a,
};

function toHex(color: number): string {
  return color.toString(16).padStart(6, '0');
}

export const TILE_PALETTE_CSS: Record<TileType, string> = {
  water: `#${toHex(TILE_PALETTE.water)}`,
  lake: `#${toHex(TILE_PALETTE.lake)}`,
  river: `#${toHex(TILE_PALETTE.river)}`,
  sand: `#${toHex(TILE_PALETTE.sand)}`,
  grass: `#${toHex(TILE_PALETTE.grass)}`,
  forest: `#${toHex(TILE_PALETTE.forest)}`,
  mountain: `#${toHex(TILE_PALETTE.mountain)}`,
  rock: `#${toHex(TILE_PALETTE.rock)}`,
};

export const LEGEND_ORDER: TileType[] = [
  'water',
  'lake',
  'river',
  'sand',
  'grass',
  'forest',
  'mountain',
  'rock',
];

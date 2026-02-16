export type AxialCoord = {
  q: number;
  r: number;
};

export type PixelCoord = {
  x: number;
  y: number;
};

export const HEX_SIZE = 14;
const SQRT3 = Math.sqrt(3);
const TWO_PI = Math.PI * 2;

export const AXIAL_DIRECTIONS: ReadonlyArray<AxialCoord> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialToPixel(q: number, r: number, size = HEX_SIZE): PixelCoord {
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * 1.5 * r,
  };
}

export function pixelToAxial(x: number, y: number, size = HEX_SIZE): AxialCoord {
  return {
    q: (SQRT3 / 3 * x - (1 / 3) * y) / size,
    r: ((2 / 3) * y) / size,
  };
}

export function axialToSample(q: number, r: number): PixelCoord {
  return {
    x: q + r * 0.5,
    y: r * (SQRT3 / 2),
  };
}

export function roundAxial(q: number, r: number): AxialCoord {
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return {
    q: Object.is(rx, -0) ? 0 : rx,
    r: Object.is(rz, -0) ? 0 : rz,
  };
}

export function hexPolygonPoints(centerX: number, centerY: number, size = HEX_SIZE): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angleRad = (Math.PI / 180) * (60 * i - 30);
    points.push(centerX + size * Math.cos(angleRad));
    points.push(centerY + size * Math.sin(angleRad));
  }
  return points;
}

export function angleFromVector(x: number, y: number): number {
  const raw = Math.atan2(y, x);
  return raw < 0 ? raw + TWO_PI : raw;
}

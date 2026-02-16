import { describe, expect, it } from 'vitest';
import { HEX_SIZE, axialToPixel, pixelToAxial, roundAxial } from '../src/render/hex';

describe('hex math round trip', () => {
  it('round-trips sample axial coordinates through pixel space', () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [-3, 2],
      [8, -5],
      [21, 21],
      [-31, -17],
    ];

    for (const [q, r] of samples) {
      const pixel = axialToPixel(q, r);
      const axial = pixelToAxial(pixel.x, pixel.y);
      const rounded = roundAxial(axial.q, axial.r);
      expect(rounded.q).toBe(q);
      expect(rounded.r).toBe(r);
    }
  });
});

describe('hex neighbor spacing', () => {
  it('keeps consistent center-to-center distance for axial neighbors', () => {
    const origin = axialToPixel(0, 0);
    const neighbors: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];

    const expectedDistance = Math.sqrt(3) * HEX_SIZE;

    for (const [q, r] of neighbors) {
      const point = axialToPixel(q, r);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const distance = Math.hypot(dx, dy);
      expect(distance).toBeCloseTo(expectedDistance, 6);
    }
  });
});

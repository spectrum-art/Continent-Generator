function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type HillshadeResult = {
  light: Float32Array;
  slope: Float32Array;
  normalX: Float32Array;
  normalY: Float32Array;
  normalZ: Float32Array;
};

export function buildHillshade(width: number, height: number, elevation: Float32Array): HillshadeResult {
  const total = width * height;
  const light = new Float32Array(total);
  const slope = new Float32Array(total);
  const normalX = new Float32Array(total);
  const normalY = new Float32Array(total);
  const normalZ = new Float32Array(total);

  const lx = -1;
  const ly = -1;
  const lz = 1;
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const lnx = lx / lLen;
  const lny = ly / lLen;
  const lnz = lz / lLen;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(width - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(height - 1, y + 1);
      const dzdx = (elevation[y * width + xr] - elevation[y * width + xl]) * 0.5;
      const dzdy = (elevation[yd * width + x] - elevation[yu * width + x]) * 0.5;
      const nx = -dzdx;
      const ny = -dzdy;
      const nz = 1;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const nnx = nx / nLen;
      const nny = ny / nLen;
      const nnz = nz / nLen;
      const index = y * width + x;
      normalX[index] = nnx;
      normalY[index] = nny;
      normalZ[index] = nnz;
      const lambert = Math.max(0, nnx * lnx + nny * lny + nnz * lnz);
      light[index] = clamp(0.3 + lambert * 0.7, 0, 1);
      slope[index] = clamp(Math.hypot(dzdx, dzdy), 0, 1);
    }
  }

  return { light, slope, normalX, normalY, normalZ };
}

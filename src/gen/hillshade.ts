function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalize3(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function lightVector(azimuthDeg: number, altitudeDeg: number): { x: number; y: number; z: number } {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const cosAlt = Math.cos(alt);
  return normalize3(Math.sin(az) * cosAlt, -Math.cos(az) * cosAlt, Math.sin(alt));
}

export type HillshadeResult = {
  light: Float32Array;
  slope: Float32Array;
  normalX: Float32Array;
  normalY: Float32Array;
  normalZ: Float32Array;
};

export function buildHillshade(
  width: number,
  height: number,
  elevation: Float32Array,
  oceanMask?: Uint8Array,
): HillshadeResult {
  const total = width * height;
  const light = new Float32Array(total);
  const slope = new Float32Array(total);
  const normalX = new Float32Array(total);
  const normalY = new Float32Array(total);
  const normalZ = new Float32Array(total);

  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < total; i += 1) {
    minElevation = Math.min(minElevation, elevation[i]);
    maxElevation = Math.max(maxElevation, elevation[i]);
  }
  const reliefSpan = Math.max(1e-6, maxElevation - minElevation);
  const zScale = 3.8 / reliefSpan;

  const lights = [
    { vector: lightVector(315, 48), weight: 0.56 },
    { vector: lightVector(20, 42), weight: 0.18 },
    { vector: lightVector(270, 35), weight: 0.14 },
    { vector: lightVector(350, 30), weight: 0.12 },
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (oceanMask && oceanMask[index] === 1) {
        normalX[index] = 0;
        normalY[index] = 0;
        normalZ[index] = 1;
        light[index] = 0.34;
        slope[index] = 0;
        continue;
      }

      const xl = Math.max(0, x - 1);
      const xr = Math.min(width - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(height - 1, y + 1);
      const dzdx = (elevation[y * width + xr] - elevation[y * width + xl]) * 0.5;
      const dzdy = (elevation[yd * width + x] - elevation[yu * width + x]) * 0.5;

      const n = normalize3(-dzdx * zScale, -dzdy * zScale, 1);
      normalX[index] = n.x;
      normalY[index] = n.y;
      normalZ[index] = n.z;

      let directional = 0;
      for (const l of lights) {
        directional += Math.max(0, n.x * l.vector.x + n.y * l.vector.y + n.z * l.vector.z) * l.weight;
      }
      const diffuseWrap = clamp01(0.5 + 0.5 * n.z);
      const ambient = 0.22 + diffuseWrap * 0.24;
      const raw = clamp01(ambient + directional * 0.68);
      const toned = Math.pow(raw, 0.88);
      light[index] = clamp01(toned);

      const localSlope = Math.hypot(dzdx, dzdy) * (2.2 / reliefSpan);
      slope[index] = clamp01(localSlope);
    }
  }

  return { light, slope, normalX, normalY, normalZ };
}

import { computeFlowFields } from './hydrology';
import type { FlowFields } from './hydrology';

const NEIGHBORS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type ErosionOptions = {
  iterations: number;
  incisionK: number;
  diffusionK: number;
  channelThreshold: number;
  m: number;
  n: number;
};

export type ErosionResult = {
  elevation: Float32Array;
  flow: FlowFields;
};

export function runIncisionDiffusion(
  width: number,
  height: number,
  elevation: Float32Array,
  options: ErosionOptions,
  outletMask?: Uint8Array,
): ErosionResult {
  let current = elevation.slice();
  let flow = computeFlowFields(width, height, current, outletMask);

  for (let iter = 0; iter < options.iterations; iter += 1) {
    flow = computeFlowFields(width, height, current, outletMask);
    const incised = current.slice();

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const out = flow.downstream[index];
        if (out < 0 || out === index) {
          continue;
        }
        const acc = flow.flowNorm[index];
        if (acc < options.channelThreshold) {
          continue;
        }
        const slope = Math.max(0, current[index] - current[out]);
        if (slope <= 1e-7) {
          continue;
        }
        const incision = options.incisionK * Math.pow(acc, options.m) * Math.pow(slope, options.n);
        incised[index] -= clamp(incision, 0, 0.018);
      }
    }

    const diffused = incised.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        let sum = 0;
        for (const [dx, dy] of NEIGHBORS_4) {
          sum += incised[(y + dy) * width + (x + dx)];
        }
        const lap = sum * 0.25 - incised[index];
        const channelFactor = flow.flowNorm[index] > options.channelThreshold ? 0.35 : 1;
        diffused[index] += lap * options.diffusionK * channelFactor;
      }
    }

    current = diffused;
  }

  flow = computeFlowFields(width, height, current, outletMask);
  return {
    elevation: current,
    flow,
  };
}

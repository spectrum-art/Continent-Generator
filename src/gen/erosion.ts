import type { FlowFields } from './hydrology';

export type ErosionResult = {
  elevation: Float32Array;
  flow: FlowFields;
};

export function runIncisionDiffusion(
  width: number,
  height: number,
  elevation: Float32Array,
  flow: FlowFields,
): ErosionResult {
  const total = width * height;
  if (flow.downstream.length !== total) {
    throw new Error('flow/downstream size mismatch');
  }
  return {
    elevation: elevation.slice(),
    flow,
  };
}

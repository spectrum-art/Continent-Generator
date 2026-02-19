import type { ContinentControls } from './continent';

export type DemCoreInput = {
  width: number;
  height: number;
  seed: number;
  controls: ContinentControls;
};

export type DemCoreState = {
  demBase: Float32Array;
  demConditioned: Float32Array;
  demEroded: Float32Array;
  demFinal: Float32Array;
  seaLevel: number;
  land: Uint8Array;
  ocean: Uint8Array;
  lake: Uint8Array;
  river: Uint8Array;
  flowDirection: Int32Array;
  flowAccumulation: Float32Array;
  flowNormalized: Float32Array;
};

export function createEmptyDemState(width: number, height: number): DemCoreState {
  const total = width * height;
  return {
    demBase: new Float32Array(total),
    demConditioned: new Float32Array(total),
    demEroded: new Float32Array(total),
    demFinal: new Float32Array(total),
    seaLevel: 0,
    land: new Uint8Array(total),
    ocean: new Uint8Array(total),
    lake: new Uint8Array(total),
    river: new Uint8Array(total),
    flowDirection: new Int32Array(total),
    flowAccumulation: new Float32Array(total),
    flowNormalized: new Float32Array(total),
  };
}

export function generateDemCore(input: DemCoreInput): DemCoreState {
  return createEmptyDemState(input.width, input.height);
}

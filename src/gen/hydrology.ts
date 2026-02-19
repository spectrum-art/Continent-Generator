export type HydrologyPolicy = 'drain-mostly' | 'allow-lakes';

export type FlowFields = {
  downstream: Int32Array;
  accumulation: Float32Array;
  flowNorm: Float32Array;
  sinkMask: Uint8Array;
  sinkCount: number;
};

export type HydrologyConditionResult = {
  elevation: Float32Array;
  sinkCount: number;
  sinkMask: Uint8Array;
};

export function conditionHydrology(
  width: number,
  height: number,
  elevation: Float32Array,
  _policy: HydrologyPolicy,
): HydrologyConditionResult {
  const total = width * height;
  return {
    elevation: elevation.slice(),
    sinkCount: 0,
    sinkMask: new Uint8Array(total),
  };
}

export function computeFlowFields(width: number, height: number, _elevation: Float32Array): FlowFields {
  const total = width * height;
  return {
    downstream: new Int32Array(total),
    accumulation: new Float32Array(total),
    flowNorm: new Float32Array(total),
    sinkMask: new Uint8Array(total),
    sinkCount: 0,
  };
}

export function shouldUseLodMode(zoom: number, lodZoomThreshold: number): boolean {
  return zoom < lodZoomThreshold;
}

export function shouldDrawOutlines(
  autoBordersEnabled: boolean,
  zoom: number,
  outlineZoomThreshold: number,
): boolean {
  return autoBordersEnabled && zoom >= outlineZoomThreshold;
}

export function allowedChunkLoadsForFrame(chunkLoadTokens: number, perFrameCap: number): number {
  if (chunkLoadTokens <= 0 || perFrameCap <= 0) {
    return 0;
  }
  return Math.min(Math.floor(chunkLoadTokens), Math.floor(perFrameCap));
}

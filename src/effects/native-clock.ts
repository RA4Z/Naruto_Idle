/** Body frame is the timeline index, never the deduplicated texture-frame name. */
export function effectFrameForBody(bodyFrame: number, bodyFps: number, startFrame: number, effectFps: number, effectFrames: number) {
  if (![bodyFrame, bodyFps, startFrame, effectFps, effectFrames].every(Number.isFinite)
    || bodyFps <= 0 || effectFps <= 0 || effectFrames <= 0 || bodyFrame < startFrame) return undefined;
  const frame = Math.floor((bodyFrame - startFrame) * effectFps / bodyFps + 1e-9);
  return frame < effectFrames ? frame : undefined;
}

export function nativePlacement(x: number, y: number, scale: number, flip: boolean, offset: readonly [number, number] = [0, 0]) {
  return { x: x + offset[0] * scale * (flip ? -1 : 1), y: y + offset[1] * scale, scaleX: scale * (flip ? -1 : 1), scaleY: scale };
}

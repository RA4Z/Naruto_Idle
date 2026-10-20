import type { WorldMap } from "./maps";
export function foregroundPlan(map: WorldMap, webGL: boolean) {
  const masked = webGL && !!map.nativeAlpha;
  return { url: masked ? map.nativeAlpha!.url : map.foreground, masked,
    colorTexture: masked ? "map-" + map.id : "map-" + map.id + "-foreground" };
}

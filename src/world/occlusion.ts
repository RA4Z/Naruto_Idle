import type Phaser from "phaser";
import type { WorldMap } from "./maps";

// Opaque polygons copied from background.jpg also copy the ground. Disabled:
// depth needs isolated alpha-masked objects and their original placement.
// Keep this lifecycle interface for a future verified modular scene loader.
export class WorldOcclusion {
  constructor(_scene: Phaser.Scene) {}
  snapshot(): { x: number; y: number; depth: number }[] { return []; }
  clear() {}
  setMap(_map: WorldMap) {}
}

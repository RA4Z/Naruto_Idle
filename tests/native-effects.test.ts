import { nativeEffectBounds } from "../src/effects/native-bounds";
import assert from "node:assert/strict";
import test from "node:test";
import { effectFrameForBody, nativePlacement } from "../src/effects/native-clock";
import { animationFrames, frameRectangle, queueAnimation } from "../src/entities/animation-texture";
import type { AnimationDef } from "../src/entities/types";

const animation: AnimationDef = { url: "/effect.png", packedAtlasUrl: "/effect.json", frames: 2, timeline: [0, 0, 1, 0], frameWidth: 90, frameHeight: 80, origin: [0, 1], fps: 24, status: "ready" };
test("native timing follows the body timeline, including repeated texture frames and different FPS", () => {
  assert.equal(effectFrameForBody(0, 24, 1, 24, 90), undefined);
  assert.equal(effectFrameForBody(1, 24, 1, 24, 90), 0);
  assert.equal(effectFrameForBody(2, 24, 1, 24, 90), 1);
  assert.equal(effectFrameForBody(25, 24, 1, 12, 90), 12);
  assert.equal(effectFrameForBody(91, 24, 1, 24, 90), undefined);
  assert.equal(effectFrameForBody(3, 0, 1, 24, 90), undefined);
  assert.equal(effectFrameForBody(NaN, 24, 1, 24, 90), undefined);
});
test("source displacement mirrors around the actor origin without changing ground height", () => {
  assert.deepEqual(nativePlacement(100, 50, .5, false, [70, -20]), { x:135, y:40, scaleX:.5, scaleY:.5 });
  assert.deepEqual(nativePlacement(100, 50, .5, true, [70, -20]), { x:65, y:40, scaleX:-.5, scaleY:.5 });
});
test("variable rectangles use actual crop dimensions, not the maximum pose cell", () => {
  const atlas = { frames: { "0": { frame: { x:1,y:1,w:10,h:20 } }, "1": { frame: { x:14,y:1,w:40,h:30 } } } };
  assert.deepEqual(frameRectangle(animation, 1, 256, atlas), { x:14,y:1,w:40,h:30 });
  assert.throws(() => frameRectangle(animation, 3, 256, atlas));
  assert.throws(() => frameRectangle(animation, 0, 256));
  const { packedAtlasUrl, ...legacy } = animation;
  assert.deepEqual(frameRectangle(legacy, 3, 180), { x:90, y:80,w:90,h:80 });
});
test("packed frame names and repeated timeline entries survive loading; legacy remains numeric", () => {
  const calls: unknown[][] = [];
  const scene = { load: { atlas: (...args: unknown[]) => calls.push(args), spritesheet: (...args: unknown[]) => calls.push(args) } };
  queueAnimation(scene as never, "native", animation);
  assert.deepEqual(calls[0], ["native", "/effect.png", "/effect.json"]);
  assert.deepEqual(animationFrames("native", animation).map(f => f.frame), ["0","0","1","0"]);
  const { packedAtlasUrl, ...legacy } = animation;
  queueAnimation(scene as never, "old", legacy);
  assert.deepEqual(animationFrames("old", legacy).map(f => f.frame), [0,0,1,0]);
  assert.equal(calls[1][0], "old");
});

test("front and back layers share one native plane even when each symbol has different bounds",()=>{
  const front={...animation,sourceBounds:[-200,-100,600,500] as [number,number,number,number]};
  const back={...animation,sourceBounds:[-800,-900,100,100] as [number,number,number,number]};
  assert.deepEqual(nativeEffectBounds([front,back]),[-40,-45,30,25]);
  assert.deepEqual(nativeEffectBounds([{...animation,origin:[.5,1]}]),[-45,-80,45,0]);
});

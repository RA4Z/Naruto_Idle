import test from "node:test";
import assert from "node:assert/strict";
import { sourceReviewItem } from "../src/admin/source-review-entry";

const fixture = () => ({ id: "source:123456789abcdef0:123456abcdef", sourceOnly: true, definition: { res: "assets/battle/effect/demo.swf", frontAction: "shang" }, bindings: [{ skillId: "invented" }], layers: [{ plane: "front", action: "shang", animation: { url: "/assets/effects/native/source/action/effect.webp", packedAtlasUrl: "/assets/effects/native/source/action/effect-atlas.json", sourcePixelScale: 1, frames: 2, frameWidth: 40, frameHeight: 60, timeline: [0, 1, 1], fps: 24 } }] });

test("source preview keeps original timing and always removes claimed gameplay bindings", () => {
  const entry = fixture(), row = sourceReviewItem(entry)!;
  assert.equal(row.status, "ready"); assert.deepEqual(row.preview?.bindings, []);
  assert.deepEqual(row.preview?.layers[0].animation.timeline, [0, 1, 1]); assert.equal(row.preview?.layers[0].animation.fps, 24);
  assert.equal(entry.bindings.length, 1);
});
test("live numeric entries and unmarked data cannot become source previews", () => {
  assert.equal(sourceReviewItem({ ...fixture(), id: "2015" }), undefined);
  assert.equal(sourceReviewItem({ ...fixture(), sourceOnly: false }), undefined);
});
test("full source sequences never request an atlas or invent a fallback animation", () => {
  const entry: any = fixture(); entry.layers[0].sourceSequence = { manifestPath: "private/manifest.json" };
  const row = sourceReviewItem(entry)!; assert.equal(row.status, "sequence"); assert.equal(row.preview, undefined);
});
test("scene source kind is explicit and cannot borrow the battle identity", () => {
  const entry: any = fixture(); entry.definition.res = "assets/role/npc/scene/npcres/demo.swf";
  assert.equal(sourceReviewItem(entry)?.status, "invalid"); entry.sourceKind = "scene-exported-sprite";
  assert.equal(sourceReviewItem(entry)?.kind, "scene"); assert.equal(sourceReviewItem(entry)?.status, "ready");
});
test("invalid timeline, pixel scale and asset paths disable preview", () => {
  for (const delta of [{ fps: 0 }, { timeline: [2] }, { sourcePixelScale: .5 }, { url: "/assets/effects/native/../../bad.webp" }, { atlasPageUrls: ["https://example.com/file.webp"] }]) {
    const entry = fixture(); Object.assign(entry.layers[0].animation, delta);
    assert.equal(sourceReviewItem(entry)?.status, "invalid");
  }
});

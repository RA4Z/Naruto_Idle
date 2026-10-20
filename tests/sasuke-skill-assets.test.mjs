import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("blue Sasuke uses regenerated source atlases and the historical fallback cannot overwrite them", async () => {
  const path = "public/assets/characters/sasuke-11000211/manifest.json";
  const before = await readFile(path, "utf8");
  const m = JSON.parse(before);
  for (const name of ["SP_skill1", "SP_skill2"]) {
    const a = m.modes.battle.animations[name];
    assert.equal(a.rendererRevision, "external-symbol-namespace-v1");
    assert.equal(a.fallback, undefined);
    assert.equal(a.url, `/assets/characters/sasuke-11000211/battle/${name}.png`);
    const png = await readFile("public" + a.url);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16) % a.frameWidth, 0);
    assert.equal(png.readUInt32BE(20) % a.frameHeight, 0);
    assert.ok(a.frames <= png.readUInt32BE(16) / a.frameWidth * (png.readUInt32BE(20) / a.frameHeight));
    assert.ok(a.timeline.every(f => Number.isInteger(f) && f >= 0 && f < a.frames));
    assert.ok(a.origin.every(Number.isFinite));
  }
  execFileSync(process.execPath, ["tools/repair-sasuke-skill-fallback.mjs"]);
  assert.equal(await readFile(path, "utf8"), before);
});

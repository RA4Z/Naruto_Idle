import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("31 repaired actions retain validated atlas bytes, portable provenance, timing and finite per-frame origins", async () => {
  const read = async (path) => JSON.parse(await readFile(path, "utf8"));
  const catalog = await read("public/assets/catalog/entities.json");
  const proof = await read("reports/compact-animation-validation.json");
  const audit = await read("reports/external-symbol-audit.json");
  assert.equal(audit.actionsPendingReview, 0);
  assert.equal(proof.count, 31);
  assert.equal(new Set(proof.actions.map((a) => a.id)).size, 30);
  for (const verified of proof.actions) {
    const entry = catalog.entities.find((e) => e.id === verified.id);
    const manifest = await read("public" + entry.manifestUrl);
    const a = manifest.modes[verified.mode].animations[verified.action];
    const png = await readFile("public" + a.url);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    assert.ok(Math.max(width, height) <= 8192 && width * height <= 16000000);
    assert.equal(width % a.frameWidth, 0);
    assert.equal(height % a.frameHeight, 0);
    assert.ok(a.frames <= (width / a.frameWidth) * (height / a.frameHeight));
    assert.equal(a.frameOrigins.length, a.frames);
    assert.ok(
      a.frameOrigins.every((p) => p.length === 2 && p.every(Number.isFinite)),
    );
    assert.ok(
      a.timeline.length > 0 &&
        a.timeline.every((i) => Number.isInteger(i) && i >= 0 && i < a.frames),
    );
    assert.equal(
      createHash("sha256").update(png).digest("hex"),
      verified.atlasSha256,
    );
    assert.equal(
      a.sourceEvidence.path,
      `assets/battle/role/left/${verified.id}.swf`,
    );
    assert.match(a.sourceEvidence.sha256, /^[a-f0-9]{64}$/);
    assert.equal(a.rendererRevision, "external-symbol-compact-frame-origin-v2");
    assert.equal(verified.groundOffsetsAndPixelsMatch, true);
    assert.ok(verified.sampledTimelineFrames.length >= 3);
    if (a.externalEffects.length) assert.equal(a.status, "partial");
  }
});

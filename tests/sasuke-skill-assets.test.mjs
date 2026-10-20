import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("blue Sasuke's skills use explicit clean same-model fallbacks while originals remain recoverable", async () => {
  const m = JSON.parse(
    await readFile(
      "public/assets/characters/sasuke-11000211/manifest.json",
      "utf8",
    ),
  );
  const report = JSON.parse(
    await readFile("reports/sasuke-skill-fallback.json", "utf8"),
  );
  const originals = JSON.parse(
    await readFile(
      "reports/animation-backups/sasuke-11000211/skill-originals.json",
      "utf8",
    ),
  );
  for (const action of ["SP_skill1", "SP_skill2"]) {
    const active = m.modes.battle.animations[action];
    const source = m.modes.battle.animations[active.fallback.sourceAction];
    assert.equal(active.status, "temporary-fallback");
    assert.equal(active.fallback.requiresOriginalSwf, true);
    assert.equal(active.url, source.url);
    assert.deepEqual(active.timeline, source.timeline);
    assert.deepEqual(active.origin, source.origin);
    assert.equal(source.status, "ready");
    assert.deepEqual(source.externalEffects, []);
    assert.notEqual(active.url, originals[action].url);
    const bytes = await readFile("public" + originals[action].url);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      report.actions.find((row) => row.action === action).preservedSha256,
    );
  }
});

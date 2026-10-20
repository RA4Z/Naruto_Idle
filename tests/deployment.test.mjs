import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLfsAssets } from "../tools/check-lfs.mjs";
test("deployment fails before publishing Git LFS pointers masquerading as images", async () => {
  const root = await mkdtemp(join(tmpdir(), "naruto-lfs-"));
  try {
    await mkdir(join(root, "character"));
    await writeFile(
      join(root, "character", "portrait.png"),
      "version https://git-lfs.github.com/spec/v1\noid sha256:123\nsize 10000\n",
    );
    await assert.rejects(() => checkLfsAssets(root), /Git LFS.*portrait.png/);
    await writeFile(
      join(root, "character", "portrait.png"),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    assert.equal(await checkLfsAssets(root), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

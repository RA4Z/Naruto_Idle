import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { createServer } from "node:http";
import { createGameApi } from "../server/game-api.mjs";
test("lab metadata requires admin auth, is read-only and never needs a full asset scan", async () => {
  const root = await mkdtemp(join(tmpdir(), "idle-lab-"));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
  const dir = join(root, "public/assets/catalog"); await mkdir(dir, { recursive: true });
  const runtime = JSON.stringify({ version: 1, entities: { "11000211": { name: "Sasuke", url: "/assets/characters/blue/manifest.json" } }, maps: [] });
  await writeFile(join(dir, "runtime.json"), runtime);
  // Deliberately no full entity catalog, reviews, source assets or database.
  const api = createGameApi(root, { password: "fixture-only" });
  const server = createServer((req, res) => void api(req, res, () => res.end()));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/`;
  try {
    assert.equal((await fetch(base + "lab")).status, 401);
    const login = await fetch(base + "login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "fixture-only" }) });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const data = await fetch(base + "lab", { headers: { Cookie: cookie } });
    assert.equal(data.status, 200); assert.equal(data.headers.get("cache-control"), "no-store");
    assert.deepEqual(await data.json(), JSON.parse(runtime));
    const sourceDir = join(root, "asset-source/role-source-exports"); await mkdir(sourceDir, { recursive: true });
    const id = "role-source-0123456789abcdef";
    await writeFile(join(sourceDir, "index.json"), JSON.stringify({ models: {
      [id]: { sourceOnly: true, source: { path: "assets/battle/role/right/11000101.swf" }, sourceGroup: "battle-right", manifest: `/assets/para-revisao/fontes-alternativas/${id}/manifest.json` },
      "role-source-ffffffffffffffff": { sourceOnly: true, manifest: "/../../private.json" },
      "11000211": { sourceOnly: true, manifest: "/assets/malicious.json" }
    } }));
    const extended = await (await fetch(base + "lab", { headers: { Cookie: cookie } })).json();
    assert.equal(extended.entities[id].sourceOnly, true);
    assert.deepEqual(extended.entities[id].capabilities, {});
    assert.equal(extended.entities[id].collection, "review");
    assert.equal(extended.entities["role-source-ffffffffffffffff"], undefined);
    assert.equal(extended.entities["11000211"].name, "Sasuke");
    assert.equal((await fetch(base + "lab", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" })).status, 405);
    assert.equal(await readFile(join(dir, "runtime.json"), "utf8"), runtime);
    assert.deepEqual(await readdir(dir), ["runtime.json"]);
  } finally {
    api.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    await rm(root, { recursive: true });
  }
});

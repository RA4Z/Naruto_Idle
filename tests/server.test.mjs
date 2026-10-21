import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createGameApi } from "../server/game-api.mjs";
test("admin API requires a server session, rejects bad passwords and cross-origin login, and invalidates logout", async () => {
  const api = createGameApi(fileURLToPath(new URL("../", import.meta.url)), {
    password: "admin",
  });
  const server = createServer(
    (req, res) =>
      void api(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    let r = await fetch(base + "/api/admin/characters");
    assert.equal(r.status, 401);
    assert.equal((await fetch(base + "/api/admin/scene-audio")).status, 401);
    r = await fetch(base + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    assert.equal(r.status, 401);
    r = await fetch(base + "/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.org",
      },
      body: JSON.stringify({ password: "admin" }),
    });
    assert.equal(r.status, 403);
    r = await fetch(base + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "admin" }),
    });
    assert.equal(r.status, 200);
    const setCookie = r.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(";")[0];
    r = await fetch(base + "/api/admin/characters", {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).entities.length, 1466);
    r = await fetch(base + "/api/admin/maps", { headers: { Cookie: cookie } });
    const maps = (await r.json()).maps;
    assert.ok(["10001", "10005", "10006", "10008", "10007", "10009"].every(id => maps.some(map => map.id === id)));
    r = await fetch(base + "/api/admin/scene-audio", { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).files["/assets/audio/scenes/adv05.mp3"]);
    r = await fetch(base + "/api/admin/characters/11000101", {
      headers: { Cookie: cookie },
    });
    assert.equal((await r.json()).name, "Naruto");
    r = await fetch(base + "/api/admin/progression", {
      headers: { Cookie: cookie },
    });
    const progression = await r.json();
    assert.equal(progression.items.length, 22);
    assert.equal(progression.quests.length, 5);
    r = await fetch(base + "/api/admin/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    r = await fetch(base + "/api/admin/overview", {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 401);
  } finally {
    api.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production admin reads the deployed asset metadata rather than mutable preparation files", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve, sep } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "naruto-deployed-assets-"));
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  await mkdir(join(dir, "assets", "maps"), { recursive: true });
  await writeFile(
    join(dir, "assets", "maps", "index.json"),
    JSON.stringify({ maps: [{ id: "deployed-snapshot" }] }),
  );
  const api = createGameApi(fileURLToPath(new URL("../", import.meta.url)), {
    publicDirectory: dir,
  });
  const server = createServer(
    (req, res) =>
      void api(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const login = await fetch(base + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "admin" }),
    });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const response = await fetch(base + "/api/admin/maps", {
      headers: { Cookie: cookie },
    });
    assert.deepEqual((await response.json()).maps, [
      { id: "deployed-snapshot" },
    ]);
  } finally {
    api.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

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
    assert.equal((await r.json()).maps.length, 4);
    r = await fetch(base + "/api/admin/characters/11000101", {
      headers: { Cookie: cookie },
    });
    assert.equal((await r.json()).name, "Naruto Kid");
    r = await fetch(base + "/api/admin/progression", {
      headers: { Cookie: cookie },
    });
    const progression = await r.json();
    assert.equal(progression.items.length, 4);
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
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

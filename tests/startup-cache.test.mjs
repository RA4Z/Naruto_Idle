import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { serveFile } from "../server/static-file.mjs";

test("unchanged assets return no body; changed assets revalidate and ranges remain readable", async () => {
  const path = new URL("../public/assets/catalog/reviews.json", import.meta.url);
  const bytes = await readFile(path);
  let modified = 1000000;
  const server = createServer((req, res) => serveFile(req, res, path, bytes.length, "application/json", modified));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port + "/asset";
  try {
    const first = await fetch(url);
    const tag = first.headers.get("etag");
    assert.ok(tag);
    assert.match(first.headers.get("cache-control"), /must-revalidate/);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), bytes);
    const cached = await fetch(url, { headers: { "If-None-Match": tag } });
    assert.equal(cached.status, 304);
    assert.equal((await cached.arrayBuffer()).byteLength, 0);
    modified++;
    const changed = await fetch(url, { headers: { "If-None-Match": tag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get("etag"), tag);
    const range = await fetch(url, { headers: { Range: "bytes=0-0", "If-None-Match": changed.headers.get("etag") } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 1);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

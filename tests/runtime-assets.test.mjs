import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("compact runtime preserves every catalog ID, manifest path and role capability", async () => {
  const full = JSON.parse(
    await readFile("public/assets/catalog/entities.json", "utf8"),
  );
  const runtime = JSON.parse(
    await readFile("public/assets/catalog/runtime.json", "utf8"),
  );
  assert.equal(Object.keys(runtime.entities).length, full.entities.length);
  for (const entity of full.entities) {
    const compact = runtime.entities[entity.id];
    assert.equal(compact.name, entity.name);
    assert.deepEqual(compact.capabilities, entity.capabilities);
    assert.equal(compact.collection, entity.collection);
    assert.equal(
      compact.url,
      entity.manifestUrl || `/assets/characters/${entity.slug}/manifest.json`,
    );
  }
});

test("optimized maps keep world dimensions and reference real WebP files generated from current originals", async () => {
  const maps = JSON.parse(
    await readFile("public/assets/maps/index.json", "utf8"),
  ).maps;
  const runtime = JSON.parse(
    await readFile("public/assets/catalog/runtime.json", "utf8"),
  );
  const images = JSON.parse(
    await readFile("public/assets/catalog/runtime-images.json", "utf8"),
  );
  for (const map of maps) {
    const loaded = runtime.maps.find((m) => m.id === map.id);
    assert.equal(loaded.width, map.width);
    assert.equal(loaded.height, map.height);
    assert.equal(loaded.navigation, map.navigation);
    const source = await readFile("public" + map.background);
    assert.equal(
      images[map.background].sourceSha256,
      createHash("sha256").update(source).digest("hex"),
    );
    const webp = await readFile("public" + loaded.background);
    assert.equal(webp.toString("ascii", 0, 4), "RIFF");
    assert.equal(webp.toString("ascii", 8, 12), "WEBP");
  }
});

test("native foreground runtime derives losslessly from the recovered mask and keeps stable PNG URLs", async () => {
 const maps=JSON.parse(await readFile("public/assets/maps/index.json","utf8")).maps;
 const runtime=JSON.parse(await readFile("public/assets/catalog/runtime.json","utf8"));
 const images=JSON.parse(await readFile("public/assets/catalog/runtime-images.json","utf8"));
 for(const map of maps.filter(m=>m.layers?.nativeForeground)){
  const derivative=images[map.foreground];assert.equal(derivative.lossless,true);
  assert.equal(derivative.sourceSha256,createHash("sha256").update(await readFile("public"+map.foreground)).digest("hex"));
  assert.equal(runtime.maps.find(m=>m.id===map.id).foreground,derivative.url);
  const data=await readFile("public"+derivative.url);assert.equal(data.toString("ascii",8,12),"WEBP");
 }
});

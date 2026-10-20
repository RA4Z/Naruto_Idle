import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const catalog = JSON.parse(
  await readFile("public/assets/catalog/entities.json", "utf8"),
);
const sourceMaps = JSON.parse(
  await readFile("public/assets/maps/index.json", "utf8"),
).maps;
let optimized = {};
try {
  optimized = JSON.parse(
    await readFile("public/assets/catalog/runtime-images.json", "utf8"),
  );
} catch {}
const replacements = {};
for (const [source, image] of Object.entries(optimized)) {
  const input = await readFile("public" + source);
  if (createHash("sha256").update(input).digest("hex") === image.sourceSha256) {
    await stat("public" + image.url);
    replacements[source] = image.url;
  }
}
const entities = Object.fromEntries(
  catalog.entities.map((e) => [
    e.id,
    {
      name: e.name,
      preview: e.preview,
      variant: e.variant,
      url: e.manifestUrl || `/assets/characters/${e.slug}/manifest.json`,
      capabilities: e.capabilities,
      collection: e.collection,
    },
  ]),
);
const maps = sourceMaps.map((map) => ({
  ...map,
  background: replacements[map.background] || map.background,
  foreground: replacements[map.foreground] || map.foreground,
}));
const result = JSON.stringify({ version: 1, entities, maps });
await writeFile("public/assets/catalog/runtime.json", result + "\n");
console.log(
  `Runtime: ${Object.keys(entities).length} modelos em ${result.length} caracteres; originais preservados.`,
);

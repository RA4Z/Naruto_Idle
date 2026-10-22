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
      portrait: e.portrait || undefined,
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

// Compile a tiny URL list for the early loading screen; never fetch the full entity catalog there.
try {
  const loading=JSON.parse(await readFile("public/assets/loading/index.json","utf8"));
  const selection=JSON.parse(await readFile("public/assets/loading/selection.json","utf8"));
  if(!Array.isArray(selection.activeIds)||new Set(selection.activeIds).size!==selection.activeIds.length)throw new Error("Invalid loading artwork selection");
  const urls=selection.activeIds.map(id=>{
    const image=loading.images.find(image=>image.id===id);
    if(!image)throw new Error("Selected loading artwork absent from catalog: "+id);
    return image.url;
  });
  if(!urls.length||urls.some(url=>!/^\/assets\/loading\/\d+\.(jpg|png)$/.test(url)))throw new Error("Invalid loading artwork catalog");
  const source="export const LOADING_ART_URLS = "+JSON.stringify(urls)+" as const;\n";
  let previous="";try{previous=await readFile("src/config/loading-art.ts","utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
  if(source!==previous)await writeFile("src/config/loading-art.ts",source);
} catch(error) { if(error.code!=="ENOENT"||error.path!=="public/assets/loading/index.json")throw error; }

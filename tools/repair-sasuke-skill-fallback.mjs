// No source SWF is available here. Do not erase pixels from the flattened
// atlases: the bogus external body overlaps the real body irreversibly.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const manifestPath = "public/assets/characters/sasuke-11000211/manifest.json";
const rawManifest = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(rawManifest);
const lineEnding = rawManifest.includes("\r\n") ? "\r\n" : "\n";
const animations = manifest.modes.battle.animations;
// This historical mitigation must never replace a source-regenerated action.
const skillNames = ["SP_skill1", "SP_skill2"];
if (skillNames.every(name => animations[name]?.rendererRevision === "external-symbol-namespace-v1")) {
  console.log("Sasuke: source-regenerated skills already present; historical fallback skipped.");
  process.exit(0);
}
const directory = "reports/animation-backups/sasuke-11000211";
await mkdir(directory, { recursive: true });
const backupPath = directory + "/skill-originals.json";
let originals;
try {
  originals = JSON.parse(await readFile(backupPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  originals = Object.fromEntries(
    ["SP_skill1", "SP_skill2"].map((name) => [name, animations[name]]),
  );
  await writeFile(backupPath, JSON.stringify(originals, null, 2) + "\n");
}
const checks = [];
for (const [action, sourceAction] of [
  ["SP_skill1", "C_idle"],
  ["SP_skill2", "A_1hit"],
]) {
  if (animations[action]?.rendererRevision === "external-symbol-namespace-v1") continue;
  const original = originals[action];
  const source = animations[sourceAction];
  if (source.status !== "ready" || source.externalEffects?.length)
    throw new Error(
      "Fallback must use a clean animation from this same model.",
    );
  const originalBytes = await readFile("public" + original.url);
  animations[action] = {
    ...structuredClone(source),
    status: "temporary-fallback",
    fallback: {
      sourceAction,
      originalUrl: original.url,
      reason:
        "Cópia indevida do corpo sobreposta à skill. Prévia provisória com poses limpas deste Sasuke; reconstrução fiel aguarda o SWF original.",
      requiresOriginalSwf: true,
    },
  };
  checks.push({
    action,
    sourceAction,
    originalUrl: original.url,
    preservedSha256: createHash("sha256").update(originalBytes).digest("hex"),
    activeUrl: source.url,
  });
}
await writeFile(manifestPath, (JSON.stringify(manifest, null, 2) + "\n").replaceAll("\n", lineEnding));
await writeFile(
  "reports/sasuke-skill-fallback.json",
  JSON.stringify(
    {
      id: manifest.id,
      policy:
        "temporary clean same-model poses; original atlases and XML unchanged",
      requiresOriginalSwf: true,
      actions: checks,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Sasuke 11000211: two temporary clean skill mappings; originals preserved.",
);

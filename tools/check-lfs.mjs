import { open, opendir, stat } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
export async function checkLfsAssets(root) {
  let checked = 0;
  async function walk(folder) {
    const dir = await opendir(folder);
    for await (const entry of dir) {
      if (entry.isSymbolicLink()) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if ([".png", ".jpg", ".webp", ".mp3"].includes(extname(path))) {
        const file = await open(path, "r");
        try {
          const head = Buffer.alloc(64),
            { bytesRead } = await file.read(head, 0, head.length, 0);
          if (
            head
              .subarray(0, bytesRead)
              .toString("utf8")
              .startsWith("version https://git-lfs.github.com/spec/v1")
          )
            throw new Error(
              `Asset ainda é um ponteiro Git LFS: ${path}. Na Vercel: Settings > Git > Git LFS > Enable; depois faça Redeploy. Localmente: git lfs pull.`,
            );
          checked++;
        } finally {
          await file.close();
        }
      }
    }
  }
  await walk(root);
  return checked;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const root = resolve(
      fileURLToPath(new URL("../public/assets/", import.meta.url)),
    );
    for (const file of [
      "characters/naruto-kid/portrait.png",
      "characters/sasuke-kid/portrait.png",
      "characters/sakura-kid/portrait.png",
      "maps/10001/background.jpg",
    ])
      await stat(resolve(root, file));
    console.log(
      `Git LFS: ${await checkLfsAssets(root)} imagens/sons verificados, sem ponteiros publicados.`,
    );
  } catch (error) {
    console.error(String(error.message));
    process.exitCode = 1;
  }
}

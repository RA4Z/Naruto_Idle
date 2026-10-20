// Transcode existing recovered artwork; originals remain untouched.
import { chromium } from "@playwright/test";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const maps = JSON.parse(
  await readFile("public/assets/maps/index.json", "utf8"),
).maps;
const sources = ["/assets/world.jpg", ...maps.map((map) => map.background)];
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--renderer-process-limit=1"],
});
let images = {};
try { images = JSON.parse(await readFile("public/assets/catalog/runtime-images.json", "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
try {
  const page = await browser.newPage();
  for (const source of sources) {
    const input = await readFile("public" + source);
    const result = await page.evaluate(
      async ({ data, cover, mime }) => {
        const image = new Image();
        image.src = `data:${mime};base64,` + data;
        await image.decode();
        const scale = cover ? Math.min(1, 1536 / image.width) : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        return {
          data: canvas.toDataURL("image/webp", 0.88).split(",")[1],
          width: canvas.width,
          height: canvas.height,
        };
      },
      { data: input.toString("base64"), cover: source === "/assets/world.jpg", mime: source.endsWith(".png") ? "image/png" : "image/jpeg" },
    );
    const url = source.replace(/\.(jpg|png)$/, ".webp");
    await writeFile("public" + url, Buffer.from(result.data, "base64"));
    images[source] = {
      url,
      sourceSha256: createHash("sha256").update(input).digest("hex"),
      originalBytes: input.length,
      bytes: (await stat("public" + url)).size,
      width: result.width,
      height: result.height,
    };
    console.log(
      source,
      images[source].originalBytes,
      "→",
      images[source].bytes,
    );
  }
  await writeFile(
    "public/assets/catalog/runtime-images.json",
    JSON.stringify(images, null, 2) + "\n",
  );
} finally {
  await browser.close();
}

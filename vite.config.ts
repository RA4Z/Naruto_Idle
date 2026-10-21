import { createGameApi } from "./server/game-api.mjs";
import { defineConfig } from "vite";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
const publicRoot = fileURLToPath(new URL("./public/", import.meta.url));
export default defineConfig({
  plugins: [
    {
      name: "incremental-recovered-assets",
      configureServer(server) {
        const api = createGameApi(
          fileURLToPath(new URL("./", import.meta.url)),
        );
        server.httpServer?.once("close", () => api.close());
        server.middlewares.use((req, res, next) => void api(req, res, next));
        // Vite caches its public-file inventory. Conversion outputs are deliberately
        // unwatched; serve these bounded directories directly so new batches work
        // without rescanning hundreds of thousands of preserved source files.
        server.middlewares.use(async (request, response, next) => {
          const url = request.url?.split("?")[0] || "";
          if (
            !/^\/assets\/(characters|para-revisao|catalog|maps|effects|audio|loading)\//.test(
              url,
            ) ||
            !["GET", "HEAD"].includes(request.method || "")
          )
            return next();
          let path: string;
          try {
            path = resolve(publicRoot, decodeURIComponent(url).slice(1));
          } catch {
            response.statusCode = 400;
            response.end();
            return;
          }
          if (!path.startsWith(resolve(publicRoot) + sep)) {
            response.statusCode = 403;
            response.end();
            return;
          }
          const mime: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".webp": "image/webp",
            ".json": "application/json; charset=utf-8",
            ".xml": "application/xml",
            ".mp3": "audio/mpeg",
          };
          if (!mime[extname(path)]) return next();
          try {
            const file = await stat(path);
            if (!file.isFile()) return next();
            response.setHeader("Content-Type", mime[extname(path)]);
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("Accept-Ranges", "bytes");
            let start = 0,
              end = file.size - 1;
            const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
            if (range) {
              start = Number(range[1]);
              end = range[2] ? Math.min(Number(range[2]), end) : end;
              if (start > end || start >= file.size) {
                response.statusCode = 416;
                response.end();
                return;
              }
              response.statusCode = 206;
              response.setHeader(
                "Content-Range",
                `bytes ${start}-${end}/${file.size}`,
              );
            }
            response.setHeader("Content-Length", end - start + 1);
            if (request.method === "HEAD") {
              response.end();
              return;
            }
            const stream = createReadStream(path, { start, end });
            stream.on("error", () => response.destroy());
            response.on("close", () => stream.destroy());
            stream.pipe(response);
          } catch {
            response.statusCode = 404;
            response.end("Asset not found");
          }
        });
      },
    },
  ],
  server: {
    watch: {
      ignored: [
        "**/assets-extraidos/**",
        "**/reports/**",
        "**/tools/**",
        "**/public/assets/characters/**",
        "**/public/assets/para-revisao/**",
        "**/public/assets/catalog/**",
        "**/public/assets/maps/**",
        "**/public/assets/effects/**",
        "**/public/assets/audio/**",
        "**/public/assets/loading/**",
      ],
    },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/.env",
        "**/.env.*",
        "**/.git/**",
        "*.{crt,pem}",
        "**/assets-extraidos/**",
      ],
    },
  },
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
  },
});

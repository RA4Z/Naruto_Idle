import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameApi } from "./game-api.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  dist = resolve(root, "dist"),
  api = createGameApi(root, { publicDirectory: dist });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".xml": "application/xml",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
};
const server = createServer(
  (req, res) =>
    void api(req, res, async () => {
      try {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname.startsWith("/api/")) {
          res.writeHead(404);
          return res.end();
        }
        let path = resolve(
          dist,
          decodeURIComponent(url.pathname).slice(1) || "index.html",
        );
        if (!path.startsWith(dist + sep)) {
          res.writeHead(403);
          return res.end();
        }
        let info;
        try {
          info = await stat(path);
        } catch {
          if (!extname(path)) {
            path = resolve(dist, "index.html");
            info = await stat(path);
          } else throw new Error();
        }
        if (!info.isFile()) throw new Error();
        res.setHeader(
          "Content-Type",
          mime[extname(path)] || "application/octet-stream",
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (req.method === "HEAD") return res.end();
        const stream = createReadStream(path);
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    }),
).listen(
  Number(process.env.PORT) || 5180,
  process.env.HOST || "0.0.0.0",
  () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5180;
    console.log(`Jogo: http://127.0.0.1:${port}/`);
    if (!process.env.HOST || process.env.HOST === "0.0.0.0") {
      for (const entries of Object.values(networkInterfaces()))
        for (const entry of entries || [])
          if (entry.family === "IPv4" && !entry.internal)
            console.log(`Rede: http://${entry.address}:${port}/`);
    }
  },
);

server.once("close", () => api.close());

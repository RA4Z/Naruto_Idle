// Local-only compiled bundle + canonical public assets. Never deploy this fixture.
import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep, extname } from "node:path";
import { serveFile } from "../server/static-file.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = resolve(root, "assets-extraidos/qa-prod-delivery"), assets = resolve(root, "public");
if ((await readFile(resolve(compiled,"local-fixture.txt"),"utf8")) !== "LOCAL TEST ONLY\n") throw new Error("Local preview marker missing");
const mime = {".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".mp3":"audio/mpeg"};
const server = createServer(async (req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if (path!=="/" && !path.startsWith("/assets/")) {res.writeHead(404);res.end();return;}
    const relative = path==="/" ? "index.html" : path.slice(1);
    for (const base of path==="/" ? [compiled] : [compiled,assets]) {
      const file=resolve(base,relative);
      if (!file.startsWith(base+sep) || !mime[extname(file)]) continue;
      let info;try {info=await stat(file);} catch {continue;}
      if (!info.isFile()) continue;
      serveFile(req,res,file,info.size,mime[extname(file)]);return;
    }
    res.writeHead(404);res.end();
  } catch {res.writeHead(400);res.end();}
});
server.listen(5194,"127.0.0.1",()=>console.log("Local compiled preview on http://localhost:5194"));
process.on("SIGINT",()=>server.close(()=>process.exit()));
process.on("SIGTERM",()=>server.close(()=>process.exit()));

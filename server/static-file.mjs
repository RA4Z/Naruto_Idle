import { createReadStream } from "node:fs";
// HTMLAudio needs a stable length and byte ranges to seek and determine duration.
export function serveFile(req, res, path, size, type, modifiedMs) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" }); res.end(); return;
  }
  res.setHeader("Content-Type", type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
  // Stable asset paths can change after a source correction: revalidate rather
  // than freezing them in an immutable cache. Matching bytes need no download.
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  if (Number.isFinite(modifiedMs)) {
    const tag = `W/"${size.toString(16)}-${modifiedMs.toString(16)}"`;
    res.setHeader("ETag", tag);
    res.setHeader("Last-Modified", new Date(modifiedMs).toUTCString());
    const matches = req.headers["if-none-match"]?.split(",").some(value => value.trim() === tag || value.trim() === "*");
    if (!req.headers.range && matches) {
      res.writeHead(304); res.end(); return;
    }
  }
  let start=0, end=size-1;
  if (req.headers.range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    let valid=!!match && !!(match[1] || match[2]) && size>0;
    if (valid) {
      if (!match[1]) {
        const suffix=Number(match[2]);
        valid=Number.isSafeInteger(suffix)&&suffix>0;
        start=Math.max(0,size-suffix);
      } else {
        start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;
      }
      valid=valid&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start;
    }
    if (!valid) {
      res.writeHead(416,{"Content-Range":"bytes */"+size,"Content-Length":"0"});res.end();return;
    }
    res.statusCode=206;
    res.setHeader("Content-Range",`bytes ${start}-${end}/${size}`);
  }
  res.setHeader("Content-Length",Math.max(0,end-start+1));
  if(req.method==="HEAD" || size===0){res.end();return;}
  const stream=createReadStream(path,{start,end});
  stream.on("error",()=>res.destroy());
  res.on("close",()=>stream.destroy());
  stream.pipe(res);
}

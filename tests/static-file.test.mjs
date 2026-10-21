import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { serveFile } from "../server/static-file.mjs";
test("streamed original audio supports lengths, HEAD, closed/open/suffix ranges and rejects impossible reads",async()=>{
 const path=new URL("../public/assets/audio/scenes/adv05.mp3",import.meta.url);
 const source=await readFile(path);
 const server=createServer((req,res)=>serveFile(req,res,path,source.length,"audio/mpeg"));
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port+"/track";
 try{
  let r=await fetch(url,{method:"HEAD"});assert.equal(r.status,200);assert.equal(Number(r.headers.get("content-length")),source.length);assert.equal((await r.arrayBuffer()).byteLength,0);
  for(const [range,start,end] of [["bytes=0-127",0,127],["bytes=128-",128,source.length-1],["bytes=-64",source.length-64,source.length-1],["bytes=0-999999999",0,source.length-1]]){
   r=await fetch(url,{headers:{Range:range}});assert.equal(r.status,206);
   assert.equal(r.headers.get("content-range"),`bytes ${start}-${end}/${source.length}`);
   assert.deepEqual(Buffer.from(await r.arrayBuffer()),source.subarray(start,end+1));
  }
  for(const range of ["bytes=999999999-","bytes=10-2","bytes=-0","bytes=0-1,3-4"]){
   r=await fetch(url,{headers:{Range:range}});assert.equal(r.status,416);assert.equal(r.headers.get("content-range"),"bytes */"+source.length);
  }
  r=await fetch(url,{method:"POST"});assert.equal(r.status,405);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

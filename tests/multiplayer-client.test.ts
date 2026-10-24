import test from "node:test";
import assert from "node:assert/strict";
import {VillageClient,multiplayerUrl} from "../src/multiplayer/client.ts";

class Socket {
  readyState=0; bufferedAmount=0; frames:any[]=[];
  onopen?:()=>void; onmessage?:(event:{data:string})=>void; onclose?:()=>void; onerror?:()=>void;
  send(raw:string){this.frames.push(JSON.parse(raw));}
  open(){this.readyState=1;this.onopen?.();}
  receive(data:unknown){this.onmessage?.({data:JSON.stringify(data)});}
  close(){this.readyState=3;this.onclose?.();}
}
const alice={id:"alice",username:"alice"};
const bob={id:"bob",username:"bob",state:{x:400,y:300,characterId:"11000211",direction:2,moving:true}};
async function fixture(){
  const sockets:Socket[]=[];let members:any[]=[];let status="";
  const client=new VillageClient({
    url:"ws://localhost:10000/ws",token:async()=>"token",
    socket:()=>{const s=new Socket();sockets.push(s);return s as unknown as WebSocket;},
    players:p=>{members=p;},status:s=>{status=s;},
  });
  client.setMap("10001");await new Promise(r=>setImmediate(r));
  const ws=sockets[0]!;ws.open();
  return {client,ws,sockets,members:()=>members,status:()=>status};
}
test("multiplayer URL accepts Render HTTPS and rejects credentials and query tokens",()=>{
  assert.equal(multiplayerUrl("https://game.onrender.com"),"wss://game.onrender.com/ws");
  assert.equal(multiplayerUrl("ws://localhost:10000/ws"),"ws://localhost:10000/ws");
  assert.equal(multiplayerUrl("https://game.example/ws?token=secret"),undefined);
  assert.equal(multiplayerUrl("wss://user:secret@game.example/ws"),undefined);
  assert.equal(multiplayerUrl(""),undefined);
});
test("auth uses a frame, waits for map state, and filters self from remote players",async t=>{
  const f=await fixture();t.after(()=>f.client.dispose());
  assert.deepEqual(f.ws.frames[0],{type:"auth",accessToken:"token"});
  f.ws.receive({type:"authenticated",player:alice});
  assert.deepEqual(f.ws.frames[1],{type:"join_map",mapId:"10001"});
  f.ws.receive({type:"map_state",mapId:"10001",players:[alice,bob]});
  assert.equal(f.status(),"online");assert.deepEqual(f.members(),[bob]);
  f.ws.receive({type:"player_left",mapId:"10002",playerId:"bob"});
  assert.equal(f.members().length,1);
  f.ws.receive({type:"player_left",mapId:"10001",playerId:"bob"});
  assert.equal(f.members().length,0);
});
test("leaving the village closes socket, clears remote players and pending state",async t=>{
  const f=await fixture();t.after(()=>f.client.dispose());
  f.ws.receive({type:"authenticated",player:alice});
  f.ws.receive({type:"map_state",mapId:"10001",players:[bob]});
  f.client.setMap("10006");
  assert.equal(f.ws.readyState,3);assert.deepEqual(f.members(),[]);assert.equal(f.status(),"disabled");
});
test("refreshed session reauthenticates without rejoining an existing map",async t=>{
  const f=await fixture();t.after(()=>f.client.dispose());
  f.ws.receive({type:"authenticated",player:alice});
  f.ws.receive({type:"map_state",mapId:"10001",players:[bob]});
  f.client.refresh();await new Promise(r=>setImmediate(r));
  assert.equal(f.ws.frames.at(-1).type,"auth");
  f.ws.receive({type:"authenticated",player:alice});
  assert.equal(f.ws.frames.filter(m=>m.type==="join_map").length,1);
  assert.deepEqual(f.members(),[bob]);
});
test("terminal auth errors close the socket without an automatic retry loop",async t=>{
  const f=await fixture();t.after(()=>f.client.dispose());
  f.ws.receive({type:"error",code:"ALREADY_CONNECTED"});
  assert.equal(f.ws.readyState,3);assert.equal(f.status(),"unavailable");
  await new Promise(r=>setTimeout(r,1200));
  assert.equal(f.sockets.length,1);
});

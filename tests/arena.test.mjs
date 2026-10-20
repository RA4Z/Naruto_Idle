import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createArena, ArenaError } from "../server/arena.mjs";
import { createGameApi } from "../server/game-api.mjs";

const rejects = (run, status) =>
  assert.throws(run, (e) => e instanceof ArenaError && e.status === status);
function match(options) {
  const arena = createArena(options),
    a = arena.create("naruto"),
    b = arena.join(a.room.code, "sasuke");
  const act = (seat, action, extra = {}) =>
    arena.act([a.token, b.token][seat], {
      action,
      turnNumber: arena.session(a.token).room.turnNumber,
      requestId: randomUUID(),
      ...extra,
    });
  return { arena, a, b, act };
}
test("arena assigns secret seats, limits rooms, rejects self-join, full rooms and invalid fighters", () => {
  const arena = createArena({ rules: { maxRooms: 1 } });
  rejects(() => arena.create("__proto__"), 400);
  const a = arena.create("naruto");
  assert.match(a.room.code, /^[A-F0-9]{10}$/);
  assert.equal(a.token.length, 64);
  rejects(() => arena.create("naruto", a.token), 409);
  rejects(() => arena.join(a.room.code, "sasuke", a.token), 409);
  rejects(() => arena.create("sakura"), 503);
  rejects(() => arena.join("BAD", "sasuke"), 400);
  const b = arena.join(a.room.code, "sasuke");
  assert.notEqual(a.token, b.token);
  assert.equal(b.seat, 1);
  rejects(() => arena.join(a.room.code, "sakura"), 409);
  assert.equal(JSON.stringify(arena.diagnostics()).includes(a.token), false);
});
test("arena validates turns, authoritative damage, idempotency and stale requests", () => {
  const { arena, a, b, act } = match();
  rejects(() => act(1, "attack"), 409);
  rejects(() => act(0, "hacked"), 400);
  rejects(() => act(0, "attack", { turnNumber: 0 }), 409);
  rejects(
    () =>
      arena.act("fake", {
        action: "attack",
        requestId: randomUUID(),
        turnNumber: 1,
      }),
    401,
  );
  const request = {
    action: "skill",
    turnNumber: 1,
    requestId: randomUUID(),
    damage: 999999,
    chakra: 99999,
  };
  let s = arena.act(a.token, request).room;
  assert.equal(s.players[1].hp, 112);
  assert.equal(s.players[0].chakra, 65);
  assert.equal(s.turn, 1);
  s = arena.act(a.token, request).room;
  assert.equal(s.turnNumber, 2);
  assert.equal(s.log.length, 1);
  assert.equal(s.players[1].hp, 112);
  rejects(() => arena.act(a.token, { ...request, action: "attack" }), 409);
  act(1, "attack");
  rejects(() => act(0, "skill"), 409);
  assert.equal(arena.session(b.token).room.players[0].hp, 153);
  act(0, "attack");
  act(1, "charge");
  act(0, "attack");
  act(1, "charge");
  assert.equal(arena.session(a.token).room.players[0].cooldown, 0);
  act(0, "skill");
  assert.equal(arena.session(a.token).room.players[1].hp, 4);
  act(1, "charge");
  act(0, "attack");
  assert.equal(arena.session(a.token).room.status, "finished");
  assert.equal(arena.session(b.token).room.winner, 0);
  rejects(() => act(1, "attack"), 409);
});
test("defense halves damage once, chakra is bounded, Sakura heals without exceeding max HP", () => {
  const { arena, a, act } = match();
  act(0, "guard");
  let s = act(1, "skill").room;
  assert.equal(s.players[0].hp, 149);
  assert.equal(s.players[0].guarding, false);
  act(0, "charge");
  s = act(1, "attack").room;
  assert.equal(s.players[0].hp, 122);
  assert.equal(s.players[0].chakra, 100);
  const c = createArena(),
    x = c.create("naruto"),
    y = c.join(x.room.code, "sakura");
  const attack = (token, action) =>
    c.act(token, {
      action,
      turnNumber: c.session(x.token).room.turnNumber,
      requestId: randomUUID(),
    }).room;
  attack(x.token, "attack");
  s = attack(y.token, "skill");
  assert.equal(s.players[1].hp, 190);
  assert.equal(s.log.at(-1).heal, 25);
  assert.equal(s.players[0].hp, 180);
  const low = match({ rules: { chakra: 20 } });
  rejects(() => low.act(0, "skill"), 409);
  assert.equal(low.arena.session(low.a.token).room.turnNumber, 1);
});
test("timers expire invitations, award turn timeouts, allow reconnects and clear retained secrets", () => {
  let time = 1000;
  const now = () => time;
  const { arena, a, b } = match({ now });
  time += 29000;
  assert.equal(arena.session(a.token).room.status, "active");
  time += 1001;
  assert.equal(arena.session(a.token).room.reason, "turn-timeout");
  assert.equal(arena.session(b.token).room.winner, 1);
  time += 300001;
  arena.expire();
  assert.equal(arena.session(a.token).room, null);
  const waiting = arena.create("sakura");
  time += 900001;
  assert.equal(arena.session(waiting.token).room.status, "expired");
  let t = 1000;
  const offline = match({ now: () => t, rules: { turnMs: 120000 } });
  t += 59000;
  offline.arena.session(offline.a.token);
  t += 1001;
  assert.equal(
    offline.arena.session(offline.a.token).room.reason,
    "disconnected",
  );
  assert.equal(offline.arena.session(offline.a.token).room.winner, 0);
});
test("independent HTTP clients receive the same authoritative state over SSE and recover HttpOnly sessions", async () => {
  const api = createGameApi(fileURLToPath(new URL("../", import.meta.url)));
  const server = createServer(
    (req, res) =>
      void api(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, data, cookie, extra = {}) =>
    fetch(base + path, {
      method: data ? "POST" : "GET",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  const controllers = [];
  try {
    let response = await request("/api/arena/action", { action: "attack" });
    assert.equal(response.status, 401);
    response = await request(
      "/api/arena/create",
      { character: "naruto" },
      null,
      { Origin: "https://evil.example" },
    );
    assert.equal(response.status, 403);
    response = await fetch(base + "/api/arena/create", {
      method: "POST",
      body: "{broken",
    });
    assert.equal(response.status, 400);
    response = await request("/api/arena/create", { character: "naruto" });
    const cookieA = response.headers.get("set-cookie").split(";")[0];
    assert.match(
      response.headers.get("set-cookie"),
      /HttpOnly; SameSite=Strict/,
    );
    const a = await response.json();
    assert.equal(a.token, undefined);
    response = await request("/api/arena/join", {
      code: a.room.code,
      character: "sakura",
    });
    const cookieB = response.headers.get("set-cookie").split(";")[0];
    const b = await response.json();
    assert.equal(b.seat, 1);
    const open = async (cookie) => {
      const controller = new AbortController();
      controllers.push(controller);
      const response = await fetch(base + "/api/arena/events", {
        headers: { Cookie: cookie },
        signal: controller.signal,
      });
      assert.match(response.headers.get("content-type"), /text\/event-stream/);
      const reader = response.body.getReader();
      let buffer = "";
      return async () => {
        const until = Date.now() + 5000;
        while (Date.now() < until) {
          let end = buffer.indexOf("\n\n");
          if (end < 0) {
            const { value, done } = await reader.read();
            if (done) throw new Error("SSE ended");
            buffer += new TextDecoder().decode(value);
            continue;
          }
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (line) return JSON.parse(line.slice(6));
        }
        throw new Error("No SSE state");
      };
    };
    const readA = await open(cookieA),
      readB = await open(cookieB);
    const untilTurn = async (read, n) => {
      let s;
      do {
        s = await read();
      } while (s.turnNumber < n);
      return s;
    };
    await readA();
    await readB();
    const input = {
      action: "attack",
      turnNumber: 1,
      requestId: randomUUID(),
      damage: 999,
    };
    response = await request("/api/arena/action", input, cookieA);
    assert.equal(response.status, 200);
    const sa = await untilTurn(readA, 2),
      sb = await untilTurn(readB, 2);
    assert.deepEqual(sa, sb);
    assert.equal(sa.players[1].hp, 165);
    response = await request("/api/arena/action", input, cookieA);
    assert.equal((await response.json()).room.turnNumber, 2);
    response = await request("/api/arena/session", undefined, cookieB);
    assert.equal((await response.json()).seat, 1);
    response = await request("/api/admin/arena");
    assert.equal(response.status, 401);
    response = await request("/api/arena/leave", {}, cookieB);
    assert.equal((await response.json()).room.winner, 0);
    assert.equal((await untilTurn(readA, 2)).status, "finished");
  } finally {
    controllers.forEach((c) => c.abort());
    api.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("journey duel derives real gear and level attributes, snapshots the build, and keeps balanced mode separate", () => {
  const arena = createArena(),
    profile = {
      level: 5,
      upgrades: 2,
      equipment: {
        weapon: "kunai-reforcada",
        armor: "colete-shinobi",
        charm: "amuleto-chakra",
      },
    };
  const a = arena.create("naruto", undefined, "journey", profile);
  const p = a.room.players[0];
  assert.equal(p.maxHp, 234);
  assert.equal(p.attack, 37);
  assert.equal(p.maxChakra, 147);
  assert.equal(p.chakraRegen, 11);
  assert.equal(p.skillDamage, 67);
  profile.equipment.weapon = "kunai-treino";
  assert.equal(
    arena.session(a.token).room.players[0].loadout.equipment.weapon,
    "kunai-reforcada",
  );
  const b = arena.join(a.room.code, "sasuke", undefined, {
    level: 1,
    upgrades: 0,
    equipment: {},
  });
  assert.equal(b.room.mode, "journey");
  assert.equal(b.room.turn, 1);
  assert.equal(b.room.players[1].attack, 18);
  arena.act(b.token, {
    action: "guard",
    turnNumber: 1,
    requestId: randomUUID(),
  });
  const hit = arena.act(a.token, {
    action: "skill",
    turnNumber: 2,
    requestId: randomUUID(),
    damage: 999999,
  });
  assert.equal(hit.room.players[1].hp, 78);
  assert.equal(hit.room.players[0].chakra, 112);
  const balanced = createArena().create(
    "naruto",
    undefined,
    "balanced",
    profile,
  );
  assert.equal(balanced.room.players[0].attack, 25);
  assert.equal(balanced.room.players[0].loadout, null);
});
test("journey duel rejects unknown equipment, invalid slots, forged raw stats and invalid progression", () => {
  const a = createArena(),
    good = { level: 1, upgrades: 0, equipment: {} };
  for (const bad of [
    { ...good, attack: 9999 },
    { ...good, level: -1 },
    { ...good, level: 101 },
    { ...good, upgrades: Infinity },
    { ...good, equipment: { weapon: "colete-shinobi" } },
    { ...good, equipment: { armor: "hacked" } },
  ])
    rejects(() => a.create("naruto", undefined, "journey", bad), 400);
  rejects(() => a.create("naruto", undefined, "hacked", good), 400);
});

test("journey Sakura healing uses her derived vitality and ninjutsu", () => {
  const arena = createArena();
  const healer = arena.create("sakura", undefined, "journey", {
    level: 5, upgrades: 2, equipment: { armor: "colete-shinobi", charm: "amuleto-chakra" },
  });
  const attacker = arena.join(healer.room.code, "naruto", undefined, {
    level: 5, upgrades: 30, equipment: { weapon: "kunai-reforcada" },
  });
  assert.equal(attacker.room.turn, 1);
  assert.equal(attacker.room.players[0].skillHeal, 53);
  arena.act(attacker.token, { action: "attack", turnNumber: 1, requestId: randomUUID() });
  const healed = arena.act(healer.token, { action: "skill", turnNumber: 2, requestId: randomUUID() });
  assert.equal(healed.room.log.at(-1).heal, 53);
  assert.equal(healed.room.players[0].hp, 191);
});

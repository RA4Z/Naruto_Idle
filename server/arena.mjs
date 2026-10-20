import {
  validateArenaLoadout,
  arenaJourneyStats,
} from "../src/progression/combat-stats.ts";
import { randomBytes } from "node:crypto";
import { ARENA_FIGHTERS, ARENA_RULES } from "../src/arena/rules.ts";

export class ArenaError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new ArenaError(status, message);
};
// Only the server owns HP, chakra, turn clocks, cooldowns and damage.
export function createArena({ now = Date.now, rules: overrides = {} } = {}) {
  const rules = { ...ARENA_RULES, ...overrides },
    rooms = new Map(),
    sessions = new Map();
  function player(character, mode = "balanced", input) {
    if (!Object.hasOwn(ARENA_FIGHTERS, character))
      fail(400, "Escolha Naruto, Sasuke ou Sakura.");
    const f = ARENA_FIGHTERS[character];
    let loadout = null;
    if (mode === "journey") {
      try {
        loadout = validateArenaLoadout(input);
      } catch (e) {
        fail(400, e.message);
      }
    }
    const derived = loadout && arenaJourneyStats(character, loadout);
    const maxHp = derived ? derived.maxHp : f.hp;
    return {
      loadout,
      attack: derived ? derived.attack : f.attack,
      skillDamage: derived
        ? character === "sakura"
          ? 0
          : derived.skillDamage
        : f.damage,
      skillHeal: derived
        ? character === "sakura"
          ? derived.skillHeal
          : 0
        : f.heal,
      maxChakra: derived ? derived.maxChakra : rules.chakra,
      chakraRegen: derived
        ? Math.round(derived.chakraRegen * 1.6)
        : rules.regen,
      interval: derived ? derived.interval : 1000,
      character,
      hp: maxHp,
      maxHp,
      chakra: derived ? derived.maxChakra : rules.chakra,
      guarding: false,
      readyAt: 0,
      turns: 0,
      lastSeen: now(),
      streams: new Set(),
      requests: new Map(),
    };
  }
  function member(token) {
    const m = sessions.get(token),
      room = m && rooms.get(m.code);
    if (!room)
      fail(401, "Sessão da arena encerrada. Crie ou entre em uma sala.");
    return { room, seat: m.seat, p: room.players[m.seat] };
  }
  function snapshot(room) {
    return {
      code: room.code,
      mode: room.mode,
      revision: room.revision,
      status: room.status,
      players: room.players.map((p) => ({
        character: p.character,
        attack: p.attack,
        skillDamage: p.skillDamage,
        skillHeal: p.skillHeal,
        maxChakra: p.maxChakra,
        chakraRegen: p.chakraRegen,
        loadout: p.loadout,
        hp: p.hp,
        maxHp: p.maxHp,
        chakra: p.chakra,
        guarding: p.guarding,
        cooldown: Math.max(0, p.readyAt - p.turns),
        connected: p.streams.size > 0,
      })),
      turn: room.turn,
      turnNumber: room.turnNumber,
      deadline: room.deadline,
      serverTime: now(),
      winner: room.winner,
      reason: room.reason,
      log: room.log.slice(-30),
      rules,
    };
  }
  function publish(room) {
    room.revision++;
    const data =
      "event: state\ndata: " + JSON.stringify(snapshot(room)) + "\n\n";
    for (const p of room.players)
      for (const res of p.streams) if (!res.destroyed) res.write(data);
  }
  function finish(room, winner, reason, status = "finished") {
    if (!["active", "waiting"].includes(room.status)) return;
    room.status = status;
    room.winner = winner;
    room.reason = reason;
    room.endedAt = now();
    room.deadline = 0;
    publish(room);
  }
  function expire() {
    const t = now();
    for (const [code, room] of rooms) {
      for (const p of room.players) if (p.streams.size) p.lastSeen = t;
      if (room.status === "waiting" && t - room.createdAt >= rules.waitingMs)
        finish(room, null, "waiting-expired", "expired");
      if (room.status === "active") {
        const missing = room.players
          .map((p, i) =>
            !p.streams.size && t - p.lastSeen >= rules.disconnectMs ? i : -1,
          )
          .filter((i) => i >= 0);
        if (missing.length)
          finish(
            room,
            missing.length === 2 ? null : 1 - missing[0],
            "disconnected",
          );
        else if (t - room.startedAt >= rules.maxMatchMs)
          finish(room, null, "match-expired", "expired");
        else if (t >= room.deadline)
          finish(room, 1 - room.turn, "turn-timeout");
      }
      if (room.endedAt !== null && t - room.endedAt >= rules.retentionMs) {
        rooms.delete(code);
        for (const [token, m] of sessions)
          if (m.code === code) sessions.delete(token);
        for (const p of room.players) for (const res of p.streams) res.end();
      }
    }
  }
  function available(token) {
    expire();
    const m = sessions.get(token),
      r = m && rooms.get(m.code);
    if (r && ["waiting", "active"].includes(r.status))
      fail(409, "Você já está em uma sala. Retome ou saia dela primeiro.");
  }
  function attach(room, seat) {
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { code: room.code, seat });
    return { token, seat, room: snapshot(room) };
  }
  return {
    expire,
    create(character, token, mode = "balanced", loadout) {
      available(token);
      if (!["balanced", "journey"].includes(mode))
        fail(400, "Modo de duelo inválido.");
      const p = player(character, mode, loadout);
      if (rooms.size >= rules.maxRooms)
        fail(503, "Arena ocupada. Tente novamente mais tarde.");
      let code;
      do {
        code = randomBytes(5).toString("hex").toUpperCase();
      } while (rooms.has(code));
      const room = {
        code,
        mode,
        revision: 1,
        players: [p],
        status: "waiting",
        turn: 0,
        turnNumber: 1,
        createdAt: now(),
        startedAt: 0,
        endedAt: null,
        deadline: 0,
        winner: null,
        reason: null,
        log: [],
      };
      rooms.set(code, room);
      return attach(room, 0);
    },
    join(code, character, token, loadout) {
      available(token);
      if (typeof code !== "string" || !/^[A-F0-9]{10}$/.test(code))
        fail(400, "Chave de sala inválida.");
      const room = rooms.get(code);
      if (!room) fail(404, "Sala não encontrada ou expirada.");
      if (room.status !== "waiting" || room.players.length !== 1)
        fail(409, "Esta sala não está disponível.");
      const p = player(character, room.mode, loadout);
      room.players.push(p);
      if (room.mode === "journey" && p.interval < room.players[0].interval)
        room.turn = 1;
      room.status = "active";
      room.startedAt = now();
      room.deadline = now() + rules.turnMs;
      publish(room);
      return attach(room, 1);
    },
    session(token) {
      expire();
      if (!sessions.has(token)) return { room: null, seat: null };
      const { room, seat, p } = member(token);
      p.lastSeen = now();
      return { room: snapshot(room), seat };
    },
    connect(token, res) {
      expire();
      const { room, p } = member(token);
      // A seat can recover after refresh; bound duplicated tabs and stale streams.
      while (p.streams.size >= 2) {
        const old = p.streams.values().next().value;
        p.streams.delete(old);
        old.end();
      }
      p.streams.add(res);
      p.lastSeen = now();
      publish(room);
      res.on("close", () => {
        if (!p.streams.delete(res)) return;
        p.lastSeen = now();
        if (rooms.has(room.code)) publish(room);
      });
    },
    act(token, input) {
      expire();
      const { room, p, seat } = member(token);
      if (
        !input ||
        typeof input.requestId !== "string" ||
        !/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId)
      )
        fail(400, "Identificador de ação inválido.");
      if (!["attack", "skill", "guard", "charge"].includes(input.action))
        fail(400, "Ação inválida.");
      if (p.requests.has(input.requestId)) {
        const previous = p.requests.get(input.requestId);
        if (
          previous.action !== input.action ||
          previous.turnNumber !== input.turnNumber
        )
          fail(409, "Identificador de ação já utilizado.");
        return { room: snapshot(room), seat };
      }
      if (room.status !== "active") fail(409, "O duelo não está ativo.");
      if (seat !== room.turn) fail(409, "Aguarde seu turno.");
      if (
        !Number.isSafeInteger(input.turnNumber) ||
        input.turnNumber !== room.turnNumber
      )
        fail(409, "O turno mudou. Atualize o duelo.");
      if (
        input.action === "skill" &&
        (p.chakra < rules.skillCost || p.turns < p.readyAt)
      )
        fail(409, "Jutsu sem chakra ou em recarga.");
      const target = room.players[1 - seat],
        f = ARENA_FIGHTERS[p.character];
      let damage = 0,
        heal = 0;
      if (input.action === "attack") damage = p.attack;
      if (input.action === "skill") {
        p.chakra -= rules.skillCost;
        p.readyAt = p.turns + rules.skillCooldown + 1;
        damage = p.skillDamage;
        heal = Math.min(p.skillHeal, p.maxHp - p.hp);
        p.hp += heal;
      }
      if (damage && target.guarding) {
        damage = Math.ceil(damage / 2);
        target.guarding = false;
      }
      target.hp = Math.max(0, target.hp - damage);
      if (input.action === "guard") p.guarding = true;
      if (input.action === "charge")
        p.chakra = Math.min(p.maxChakra, p.chakra + rules.charge);
      const names = {
        attack: "Ataque",
        skill: f.skill,
        guard: "Defesa",
        charge: "Concentrar chakra",
      };
      room.log.push({
        id: room.turnNumber,
        seat,
        action: input.action,
        damage,
        heal,
        text: `${f.name}: ${names[input.action]}${damage ? " · " + damage + " de dano" : ""}${heal ? " · +" + heal + " de vida" : ""}`,
      });
      if (room.log.length > 30) room.log.shift();
      p.requests.set(input.requestId, {
        action: input.action,
        turnNumber: input.turnNumber,
      });
      if (p.requests.size > 100)
        p.requests.delete(p.requests.keys().next().value);
      p.turns++;
      p.lastSeen = now();
      room.turnNumber++;
      if (!target.hp) finish(room, seat, "knockout");
      else {
        room.turn = 1 - seat;
        target.guarding = false;
        target.chakra = Math.min(
          target.maxChakra,
          target.chakra + target.chakraRegen,
        );
        room.deadline = now() + rules.turnMs;
        publish(room);
      }
      return { room: snapshot(room), seat };
    },
    leave(token) {
      expire();
      const { room, seat } = member(token);
      finish(room, room.status === "active" ? 1 - seat : null, "left");
      return { room: snapshot(room), seat };
    },
    diagnostics() {
      expire();
      return {
        rooms: [...rooms.values()].map((r) => ({
          code: r.code,
          mode: r.mode,
          status: r.status,
          turnNumber: r.turnNumber,
          createdAt: r.createdAt,
          winner: r.winner,
          reason: r.reason,
          players: snapshot(r).players,
        })),
        capacity: rules.maxRooms,
      };
    },
    close() {
      for (const r of rooms.values())
        for (const p of r.players) for (const res of p.streams) res.end();
      rooms.clear();
      sessions.clear();
    },
  };
}

export function createArenaApi(options) {
  const arena = createArena(options),
    attempts = new Map();
  const timer = setInterval(() => arena.expire(), 1000);
  timer.unref();
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  const cookie = (req) =>
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("naruto_arena="))
      ?.slice(13);
  const handler = async (req, res, next) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith("/api/arena/")) return next();
    try {
      const token = cookie(req);
      if (req.method === "GET" && path === "/api/arena/session")
        return json(res, 200, arena.session(token));
      if (req.method === "GET" && path === "/api/arena/events") {
        const session = arena.session(token);
        if (!session.room) fail(401, "Sessão da arena encerrada.");
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
        arena.connect(token, res);
        return;
      }
      if (req.method !== "POST")
        return json(res, 405, { error: "Método não permitido." });
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        fail(403, "Origem inválida.");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2048)
          fail(413, "Requisição muito grande.");
      }
      let input;
      try {
        input = JSON.parse(body || "{}");
      } catch {
        fail(400, "JSON inválido.");
      }
      if (!input || typeof input !== "object" || Array.isArray(input))
        fail(400, "Dados inválidos.");
      const identity = token || req.socket.remoteAddress || "local",
        time = Date.now();
      if (attempts.size > 1000)
        for (const [k, v] of attempts)
          if (time - v.start >= 60000) attempts.delete(k);
      let limit = attempts.get(identity);
      if (!limit || time - limit.start >= 60000) {
        limit = { start: time, count: 0 };
        attempts.set(identity, limit);
      }
      if (++limit.count > 90) fail(429, "Muitas ações. Aguarde um minuto.");
      let result;
      if (path === "/api/arena/create")
        result = arena.create(
          input.character,
          token,
          input.mode,
          input.loadout,
        );
      else if (path === "/api/arena/join")
        result = arena.join(input.code, input.character, token, input.loadout);
      else if (path === "/api/arena/action") result = arena.act(token, input);
      else if (path === "/api/arena/leave") result = arena.leave(token);
      else fail(404, "Operação não encontrada.");
      if (result.token) {
        res.setHeader(
          "Set-Cookie",
          `naruto_arena=${result.token}; HttpOnly; SameSite=Strict; Path=/api/arena; Max-Age=10800${req.socket.encrypted ? "; Secure" : ""}`,
        );
        const { token: secret, ...publicResult } = result;
        result = publicResult;
      }
      json(res, 200, result);
    } catch (e) {
      if (!res.headersSent)
        json(res, e instanceof ArenaError ? e.status : 500, {
          error: e instanceof ArenaError ? e.message : "Arena indisponível.",
        });
      else res.end();
    }
  };
  handler.diagnostics = () => arena.diagnostics();
  handler.close = () => {
    clearInterval(timer);
    arena.close();
  };
  return handler;
}

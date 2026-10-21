import { createArenaApi } from "./arena.mjs";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { readFile, readdir, stat, writeFile, rename } from "node:fs/promises";
import { resolve, join, relative, sep, dirname } from "node:path";
export function createGameApi(
  root,
  {
    password = process.env.NARUTO_ADMIN_PASSWORD || "admin",
    publicDirectory = resolve(root, "public"),
  } = {},
) {
  const arena = createArenaApi();
  const sessions = new Map(),
    attempts = new Map();
  let fileCache = [],
    fileTime = 0;
  const publicRoot = resolve(publicDirectory);
  const digest = (value) => createHash("sha256").update(String(value)).digest();
  const cookie = (req) =>
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("naruto_admin="))
      ?.slice(13);
  const authorized = (req) => {
    const key = cookie(req),
      expiry = sessions.get(key);
    if (expiry > Date.now()) return true;
    if (key) sessions.delete(key);
    return false;
  };
  const read = async (file) =>
    JSON.parse(
      await readFile(
        resolve(publicRoot, file.replace(/^public\//, "")),
        "utf8",
      ),
    );
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  async function files() {
    if (Date.now() - fileTime < 60000) return fileCache;
    const output = [];
    async function walk(folder) {
      for (const item of await readdir(folder, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const path = join(folder, item.name);
        if (item.isDirectory()) await walk(path);
        else {
          const info = await stat(path);
          output.push({
            url: "/" + relative(publicRoot, path).split(sep).join("/"),
            bytes: info.size,
            type: item.name.split(".").at(-1).toLowerCase(),
          });
        }
      }
    }
    await walk(resolve(publicRoot, "assets"));
    fileCache = output;
    fileTime = Date.now();
    return output;
  }
  // Keep editable reviews outside the immutable deployed asset snapshot.
  const reviewPath = resolve(root, "public/assets/catalog/reviews.json");
  let reviewWrites = Promise.resolve();
  const reviews = async () => JSON.parse(await readFile(reviewPath, "utf8"));
  const characterData = async (id) => {
    const catalog = await read("public/assets/catalog/entities.json");
    const entry = catalog.entities.find((e) => e.id === id);
    if (!entry || !entry.manifestUrl) return null;
    const path = resolve(publicRoot, entry.manifestUrl.slice(1));
    if (!path.startsWith(resolve(publicRoot, "assets") + sep)) throw new Error("Invalid path");
    return { entry, path, manifest: JSON.parse(await readFile(path, "utf8")) };
  };
  const handler = async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    // Reviews are editable at runtime. Serve the live source file even when
    // the rest of the production site comes from a previously built dist/.
    if (url.pathname === "/assets/catalog/reviews.json" && ["GET", "HEAD"].includes(req.method)) {
      try {
        const data = await reviews();
        if (req.method === "HEAD") {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          return res.end();
        }
        return json(res, 200, data);
      } catch {
        return json(res, 500, { error: "Revisões indisponíveis." });
      }
    }
    if (!url.pathname.startsWith("/api/admin/")) return arena(req, res, next);
    try {
      if (req.method === "POST") {
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          return json(res, 403, { error: "Origem inválida." });
        if (url.pathname === "/api/admin/login") {
          const key = req.socket.remoteAddress || "local";
          let limit = attempts.get(key);
          if (!limit || limit.until < Date.now()) {
            limit = { count: 0, until: Date.now() + 600000 };
            attempts.set(key, limit);
          }
          if (limit.count >= 10)
            return json(res, 429, {
              error: "Muitas tentativas. Aguarde alguns minutos.",
            });
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 2048)
              return json(res, 413, { error: "Requisição muito grande." });
          }
          const input = JSON.parse(body || "{}");
          if (
            typeof input.password !== "string" ||
            !timingSafeEqual(digest(input.password), digest(password))
          ) {
            limit.count++;
            return json(res, 401, { error: "Senha incorreta." });
          }
          attempts.delete(key);
          for (const [k, v] of sessions) if (v < Date.now()) sessions.delete(k);
          if (sessions.size >= 100)
            sessions.delete(sessions.keys().next().value);
          const token = randomBytes(32).toString("hex");
          sessions.set(token, Date.now() + 8 * 3600000);
          res.setHeader(
            "Set-Cookie",
            `naruto_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.socket.encrypted ? "; Secure" : ""}`,
          );
          return json(res, 200, { authenticated: true });
        }
        if (url.pathname === "/api/admin/logout") {
          sessions.delete(cookie(req));
          res.setHeader(
            "Set-Cookie",
            "naruto_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return json(res, 200, { authenticated: false });
        }
        const reviewMatch = url.pathname.match(/^\/api\/admin\/characters\/(\d{6,12})\/review$/);
        if (reviewMatch) {
          if (!authorized(req)) return json(res, 401, { error: "Login required." });
          let body = "";
          for await (const chunk of req) { body += chunk; if (body.length > 4096) return json(res, 413, { error: "Request too large." }); }
          let input;
          try { input = JSON.parse(body); } catch { return json(res, 400, { error: "Invalid data." }); }
          if (!input || !["pending", "approved", "rejected"].includes(input.decision) || typeof input.notes !== "string" || input.notes.length > 1000 || !input.capabilities || ["npc", "companion", "enemy"].some(role => typeof input.capabilities[role] !== "boolean")) return json(res, 400, { error: "Invalid review." });
          const data = await characterData(reviewMatch[1]);
          if (!data) return json(res, 404, { error: "Modelo nao encontrado." });
          const world = data.manifest.modes?.world?.animations || {}, battle = data.manifest.modes?.battle?.animations || {};
          if ((input.capabilities.npc && !world.idle_0) || (input.capabilities.companion && (!world.idle_0 || !world.run_0)) || (input.capabilities.enemy && (!battle.C_idle || !battle.A_1hit))) return json(res, 400, { error: "Faltam animacoes basicas para uma das funcoes selecionadas." });
          if (input.decision !== "approved" && Object.values(input.capabilities).some(Boolean)) return json(res, 400, { error: "Aprove o modelo para habilitar funcoes." });
          const record = { decision: input.decision, notes: input.notes, capabilities: input.capabilities, updatedAt: new Date().toISOString() };
          const operation = reviewWrites.then(async () => {
            const all = await reviews(); all[reviewMatch[1]] = record;
            const temp = reviewPath + ".tmp";
            await writeFile(temp, JSON.stringify(all, null, 2) + "\n", "utf8");
            await rename(temp, reviewPath);
          });
          reviewWrites = operation.catch(() => {});
          await operation;
          return json(res, 200, record);
        }
        return json(res, 405, { error: "Operação indisponível." });
      }
      if (req.method !== "GET")
        return json(res, 405, { error: "Método não permitido." });
      if (!authorized(req))
        return json(res, 401, { error: "Entre como administrador." });
      if (url.pathname === "/api/admin/arena")
        return json(res, 200, arena.diagnostics());
      if (url.pathname === "/api/admin/session")
        return json(res, 200, { authenticated: true });
      if (url.pathname === "/api/admin/characters")
        return json(
          res,
          200,
          await read("public/assets/catalog/entities.json"),
        );
      if (url.pathname === "/api/admin/reviews") return json(res, 200, await reviews());
      if (url.pathname === "/api/admin/maps")
        return json(res, 200, await read("public/assets/maps/index.json"));
      if (url.pathname === "/api/admin/presentation")
        return json(res, 200, await read("public/assets/presentation.json"));
      if (url.pathname === "/api/admin/scene-audio")
        return json(res, 200, await read("public/assets/audio/scenes/index.json"));
      if (url.pathname === "/api/admin/files") {
        const list = await files(),
          q = (url.searchParams.get("q") || "").toLowerCase().slice(0, 100),
          type = (url.searchParams.get("type") || "").slice(0, 10),
          page = Math.max(
            0,
            Math.min(10000, Number(url.searchParams.get("page")) || 0),
          );
        const filtered = list.filter(
          (f) =>
            (!q || f.url.toLowerCase().includes(q)) &&
            (!type || f.type === type),
        );
        return json(res, 200, {
          total: filtered.length,
          page,
          files: filtered.slice(page * 60, page * 60 + 60),
        });
      }
      if (url.pathname === "/api/admin/overview") {
        const [catalog, maps, presentation, list] = await Promise.all([
          read("public/assets/catalog/entities.json"),
          read("public/assets/maps/index.json"),
          read("public/assets/presentation.json"),
          files(),
        ]);
        return json(res, 200, {
          characters: catalog.entities.length,
          playable: catalog.entities.filter((e) => e.collection === "playable")
            .length,
          previews: catalog.entities.filter((e) => e.preview).length,
          maps: maps.maps.length,
          effects: Object.keys(presentation.effects).length,
          sounds: Object.values(presentation.sounds).reduce(
            (n, s) => n + s.urls.length,
            0,
          ),
          files: list.length,
          bytes: list.reduce((n, f) => n + f.bytes, 0),
        });
      }
      if (url.pathname === "/api/admin/progression") {
        const { ITEMS, QUESTS } = await import("../src/progression/rules.ts");
        return json(res, 200, {
          items: ITEMS,
          quests: QUESTS.map(({ progress, ...q }) => q),
        });
      }
      const match = url.pathname.match(
        /^\/api\/admin\/characters\/(\d{6,12})$/,
      );
      if (match) {
        const data = await characterData(match[1]);
        if (!data) return json(res, 404, { error: "Modelo n?o encontrado." });
        const assets = [];
        async function walkCharacter(folder) {
          for (const item of await readdir(folder, { withFileTypes: true })) {
            if (item.isSymbolicLink()) continue;
            const path = join(folder, item.name);
            if (item.isDirectory()) await walkCharacter(path);
            else assets.push({ url: "/" + relative(publicRoot, path).split(sep).join("/"), bytes: (await stat(path)).size });
          }
        }
        await walkCharacter(dirname(data.path));
        return json(res, 200, { ...data.manifest, assets, review: (await reviews())[match[1]] || null });
      }
      return json(res, 404, { error: "Tela indisponível." });
    } catch (error) {
      json(res, 500, {
        error: "Não foi possível carregar os dados solicitados.",
      });
    }
  };
  handler.close = () => arena.close();
  return handler;
}

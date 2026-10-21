import { t, th, errorText, translateText } from "../i18n/core.ts";
import {
  arenaJourneyStats,
  type CombatLoadout,
} from "../progression/combat-stats";
import { ITEMS } from "../progression/rules";
import {
  ARENA_FIGHTERS,
  type ArenaAction,
  type ArenaCharacter,
  type ArenaSession,
  type ArenaState,
} from "./rules";
import { ArenaView } from "./view";
import { arenaRequestId } from "./request-id";
import "./arena.css";
export function installArena(
  character: () => ArenaCharacter,
  loadout: (character: ArenaCharacter) => CombatLoadout = () => ({
    level: 1,
    upgrades: 0,
    equipment: {},
  }),
) {
  const dialog = document.createElement("dialog");
  dialog.className = "arena-panel";
  dialog.setAttribute("aria-label", t("arena.ui.da8fa6e923"));
  dialog.innerHTML = `<header class="library-heading"><div><p class="eyebrow">${th("arena.ui.64cf0b94b4")}</p><h2>${th("arena.ui.da8fa6e923")}</h2></div><button class="secondary" data-close>${th("arena.ui.0f2bd88ef0")}</button></header>
    <p class="arena-intro">${th("arena.ui.e52a569b7b")}</p>
    <form data-entry><label>${th("arena.ui.b26f614334")}<select aria-label="${th("arena.ui.4037200994")}" name="character"></select></label><label>${th("arena.ui.f795bab533")}<select aria-label="${th("arena.ui.aef1bad7b5")}" name="mode"><option value="balanced">${th("arena.ui.4d68b46241")}</option><option value="journey">${th("arena.ui.94fd629981")}</option></select></label><p data-build-preview></p><div class="arena-entry-actions"><button type="button" data-create>${th("arena.ui.b5dddc9be1")}</button><label>${th("arena.ui.29e0d1c043")}<input name="code" aria-label="${th("arena.ui.29e0d1c043")}" maxlength="10" autocomplete="off" placeholder="${th("common.codeExample")}"></label><button type="submit">${th("arena.ui.f1388bfdc0")}</button></div></form>
    <section data-duel hidden><div class="arena-room"><strong data-code></strong><button class="secondary" data-copy>${th("arena.ui.7cd76ef5b6")}</button><span data-connection></span></div><p data-phase role="status"></p><div class="arena-fighters"></div><canvas class="arena-stage" aria-label="${th("arena.ui.49686b9f6a")}"></canvas><div class="arena-actions"></div><p data-rules></p><ol class="arena-log" aria-label="${th("arena.ui.0c846cc99f")}"></ol><button data-leave class="secondary">${th("arena.ui.7d9b7fe65c")}</button></section>
    <label class="arena-sound"><input type="checkbox" data-arena-sound> ${th("arena.ui.2cd1cc4c34")}</label><p data-feedback role="status"></p><p class="arena-note">${th("arena.ui.001bf6303d")}</p>`;
  document.body.append(dialog);
  const find = <T extends HTMLElement>(s: string) =>
    dialog.querySelector<T>(s)!;
  const entry = find<HTMLFormElement>("[data-entry]"),
    duel = find<HTMLElement>("[data-duel]"),
    feedback = find<HTMLElement>("[data-feedback]"),
    select = find<HTMLSelectElement>('select[name="character"]'),
    codeInput = find<HTMLInputElement>('input[name="code"]'),
    mode = find<HTMLSelectElement>('select[name="mode"]');
  for (const [key, f] of Object.entries(ARENA_FIGHTERS)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${f.name} · ${f.skill}`;
    select.append(option);
  }
  function previewBuild() {
    const profile = loadout(select.value as ArenaCharacter);
    const stats = arenaJourneyStats(select.value as ArenaCharacter, profile);
    const names = Object.values(profile.equipment)
      .map((id) => ITEMS.find((i) => i.id === id)?.name || id)
      .join(" · ");
    find("[data-build-preview]").textContent =
      mode.value === "journey"
        ? t("arena.ui.75dc2640c6", {
            v0: profile.level,
            v1: profile.upgrades,
            v2: stats.maxHp,
            v3: stats.attack,
            v4: stats.maxChakra,
            v5: names || t("arena.ui.329808e539"),
          })
        : t("arena.ui.acb51c487c");
  }
  select.onchange = mode.onchange = previewBuild;
  let state: ArenaState | null = null,
    seat: number | null = null,
    stream: EventSource | undefined,
    clock: ReturnType<typeof setInterval> | undefined,
    view: ArenaView | undefined,
    connected = false,
    busy = false,
    offset = 0,
    version = 0;
  const buttons = new Map<ArenaAction, HTMLButtonElement>();
  for (const [action, label] of [
    ["attack", t("arena.ui.88bdb16bc2")],
    ["skill", t("common.jutsuCost")],
    ["guard", t("arena.ui.157ddc59b5")],
    ["charge", t("arena.ui.dfa379429d")],
  ] as const) {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.arenaAction = action;
    b.onclick = () => void act(action);
    buttons.set(action, b);
    find(".arena-actions").append(b);
  }
  async function api(path: string, body?: unknown): Promise<ArenaSession> {
    const response = await fetch("/api/arena/" + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(errorText(data.error || t("arena.ui.b9f14258ad")));
    return data;
  }
  function update(session: ArenaSession) {
    if (!dialog.open) return;
    if (
      session.room &&
      state?.code === session.room.code &&
      session.room.revision < state.revision
    )
      return;
    state = session.room;
    seat = session.seat;
    if (state) {
      offset = state.serverTime - Date.now();
      view?.update(state);
    }
    render();
  }
  function connect() {
    stream?.close();
    connected = false;
    stream = new EventSource("/api/arena/events");
    stream.onopen = () => {
      connected = true;
      renderClock();
    };
    stream.addEventListener("state", (e) => {
      connected = true;
      try {
        update({ room: JSON.parse((e as MessageEvent).data), seat });
      } catch {
        feedback.textContent = t("arena.ui.8551d8d70c");
      }
    });
    stream.onerror = () => {
      connected = false;
      renderClock();
      feedback.textContent = t("arena.ui.644f90e547");
    };
  }
  function renderClock() {
    if (!state || seat === null) return;
    const me = state.players[seat],
      myTurn = state.status === "active" && state.turn === seat;
    const seconds = Math.max(
      0,
      Math.ceil((state.deadline - Date.now() - offset) / 1000),
    );
    find("[data-connection]").textContent = connected
      ? t("arena.ui.0647d1838a")
      : t("common.reconnecting");
    find("[data-phase]").textContent =
      state.status === "waiting"
        ? t("arena.ui.793b53e153")
        : state.status === "active"
          ? t("arena.ui.3580d205fa", {
              v0: state.turnNumber,
              v1: myTurn ? t("arena.ui.41576b0f25") : t("arena.ui.726f9dddbf"),
              v2: seconds,
            })
          : state.winner === null
            ? t("arena.ui.8087e10ef2") + reason(state.reason)
            : `${state.winner === seat ? t("arena.ui.51244f41bb") : t("arena.ui.bb33ebc796")} · ${reason(state.reason)}`;
    for (const [action, b] of buttons) {
      b.disabled =
        busy ||
        !connected ||
        !myTurn ||
        seconds === 0 ||
        (action === "skill" &&
          (me.chakra < state.rules.skillCost || me.cooldown > 0));
      if (action === "skill")
        b.textContent = me.cooldown
          ? t("arena.ui.b305905414", { v0: me.cooldown })
          : t("arena.ui.5a59c447fb", {
              v0: ARENA_FIGHTERS[me.character].skill,
              v1: state.rules.skillCost,
            });
    }
  }
  function render() {
    entry.hidden = !!state;
    duel.hidden = !state;
    if (!state || seat === null) return;
    find("[data-code]").textContent =
      t("common.room") +
      state.code +
      (state.mode === "journey"
        ? t("common.journeySuffix")
        : t("common.balancedSuffix"));
    const list = find(".arena-fighters");
    list.replaceChildren();
    state.players.forEach((p, i) => {
      const card = document.createElement("article");
      card.className =
        "arena-fighter" +
        (state?.status === "active" && state.turn === i ? " current" : "");
      card.dataset.seat = String(i);
      const title = document.createElement("h3");
      title.textContent = `${ARENA_FIGHTERS[p.character].name} · ${i === seat ? t("arena.ui.b21e91730d") : t("arena.ui.77ba10b67c")}`;
      const text = document.createElement("p");
      text.textContent = t("arena.ui.517f7e48b4", {
        v0: p.hp,
        v1: p.maxHp,
        v2: p.chakra,
        v3: p.maxChakra,
        v4: p.attack,
        v5: p.guarding ? t("common.guardingSuffix") : "",
        v6: p.connected ? "" : t("common.disconnectedSuffix"),
      });
      const hp = document.createElement("progress");
      hp.max = p.maxHp;
      hp.value = p.hp;
      hp.setAttribute(
        "aria-label",
        t("arena.ui.16680f4cd3") + ARENA_FIGHTERS[p.character].name,
      );
      card.append(title, hp, text);
      if (p.loadout) {
        const build = document.createElement("p");
        build.textContent =
          t("arena.ui.61236074e6", {
            v0: p.loadout.level,
            v1: p.loadout.upgrades,
          }) +
          (Object.values(p.loadout.equipment)
            .map((id) => ITEMS.find((i) => i.id === id)?.name || id)
            .join(" · ") || t("arena.ui.329808e539"));
        card.append(build);
      }
      list.append(card);
    });
    const log = find(".arena-log");
    log.replaceChildren();
    for (const event of state.log.slice(-8).reverse()) {
      const li = document.createElement("li");
      const fighter = state.players[event.seat];
      const action =
        event.action === "attack"
          ? translateText("Ataque")
          : event.action === "skill"
            ? ARENA_FIGHTERS[fighter.character].skill
            : event.action === "guard"
              ? translateText("Defesa")
              : event.action === "charge"
                ? t("arena.ui.dfa379429d")
                : event.action === "timeout"
                  ? t("arena.timeout")
                  : t("arena.leave");
      li.textContent =
        `#${event.id} ` +
        t("arena.log", {
          name: ARENA_FIGHTERS[fighter.character].name,
          action,
          damage: event.damage
            ? t("arena.damage", { count: event.damage })
            : "",
          heal: event.heal ? t("arena.heal", { count: event.heal }) : "",
        });
      log.append(li);
    }
    find("[data-rules]").textContent = t("arena.ui.9c1aa0c9b5", {
      v0: state.players[seat].chakraRegen,
      v1: state.mode === "journey" ? t("arena.ui.b0466e5f04") : "",
    });
    find<HTMLButtonElement>("[data-leave]").textContent = [
      "active",
      "waiting",
    ].includes(state.status)
      ? t("arena.ui.a4c0b7b0ce")
      : t("arena.ui.405d7ac360");
    renderClock();
  }
  async function start(path: "create" | "join") {
    if (busy) return;
    busy = true;
    feedback.textContent = t("common.connecting");
    entry.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const request = version;
    try {
      const result = await api(path, {
        character: select.value,
        code: codeInput.value.trim().toUpperCase(),
        mode: mode.value,
        loadout: loadout(select.value as ArenaCharacter),
      });
      if (request !== version || !dialog.open) return;
      update(result);
      connect();
      feedback.textContent = t("arena.ui.70b7ec7748");
    } catch (e) {
      if (request === version) feedback.textContent = errorText(e);
    } finally {
      busy = false;
      entry.querySelectorAll("button").forEach((b) => (b.disabled = false));
      renderClock();
    }
  }
  async function act(action: ArenaAction) {
    if (
      !state ||
      seat === null ||
      busy ||
      !connected ||
      buttons.get(action)!.disabled
    )
      return;
    busy = true;
    renderClock();
    const request = version;
    try {
      const data = await api("action", {
        action,
        turnNumber: state.turnNumber,
        requestId: arenaRequestId(),
      });
      if (request === version) {
        update(data);
        feedback.textContent = "";
      }
    } catch (e) {
      if (request === version) {
        feedback.textContent = errorText(e);
        try {
          update(await api("session"));
        } catch {
          /* EventSource retries. */
        }
      }
    } finally {
      busy = false;
      renderClock();
    }
  }
  find<HTMLButtonElement>("[data-create]").onclick = () => void start("create");
  entry.onsubmit = (e) => {
    e.preventDefault();
    void start("join");
  };
  find<HTMLButtonElement>("[data-copy]").onclick = async () => {
    try {
      await navigator.clipboard.writeText(state?.code || "");
      feedback.textContent = t("arena.ui.726d606ca2");
    } catch {
      feedback.textContent = t("arena.ui.57c8c979f6");
    }
  };
  find<HTMLButtonElement>("[data-leave]").onclick = async () => {
    if (busy || !state) return;
    busy = true;
    try {
      await api("leave", {});
      stream?.close();
      connected = false;
      update({ room: null, seat: null });
      feedback.textContent = t("arena.ui.5a0b8df418");
    } catch (e) {
      feedback.textContent = errorText(e);
    } finally {
      busy = false;
      renderClock();
    }
  };
  find<HTMLButtonElement>("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    version++;
    stream?.close();
    stream = undefined;
    clearInterval(clock);
    view?.destroy();
    view = undefined;
    connected = false;
  });
  return async () => {
    if (dialog.open) return;
    const request = ++version;
    state = null;
    seat = null;
    busy = true;
    render();
    select.value = character();
    previewBuild();
    feedback.textContent = t("arena.ui.5f14dd6cdb");
    dialog.showModal();
    view = new ArenaView(
      find<HTMLCanvasElement>("canvas"),
      (error) => {
        if (dialog.open) feedback.textContent = error;
      },
      () => ({
        enabled: find<HTMLInputElement>("[data-arena-sound]").checked,
        volume: 0.4,
      }),
    );
    clock = setInterval(renderClock, 250);
    try {
      const data = await api("session");
      if (request !== version || !dialog.open) return;
      update(data);
      if (data.room) connect();
      feedback.textContent = "";
    } catch (e) {
      if (request === version) feedback.textContent = errorText(e);
    } finally {
      busy = false;
      renderClock();
    }
  };
}
function reason(value: string | null) {
  return (
    (
      {
        knockout: t("arena.knockout"),
        "turn-timeout": t("arena.ui.c854380dfc"),
        disconnected: t("arena.ui.4bf3f7fc27"),
        left: t("arena.ui.717efa7450"),
        "waiting-expired": t("arena.ui.cdfde07eb7"),
        "match-expired": t("arena.ui.7d8b71ffbd"),
      } as Record<string, string>
    )[value || ""] || t("arena.ui.2493221869")
  );
}

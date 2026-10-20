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
import "./arena.css";

export function installArena(
  character: () => ArenaCharacter,
  loadout: () => CombatLoadout = () => ({
    level: 1,
    upgrades: 0,
    equipment: {},
  }),
) {
  const dialog = document.createElement("dialog");
  dialog.className = "arena-panel";
  dialog.setAttribute("aria-label", "Arena PvP");
  dialog.innerHTML = `<header class="library-heading"><div><p class="eyebrow">DESAFIO SHINOBI</p><h2>Arena PvP</h2></div><button class="secondary" data-close>Fechar</button></header>
    <p class="arena-intro">Convide outra pessoa pela chave. Dois jogadores conectados ao mesmo servidor disputam por turnos de 30 segundos. Escolha um duelo nivelado ou lute com o nível, os treinos e equipamentos da sua jornada.</p>
    <form data-entry><label>Seu ninja<select aria-label="Ninja da arena" name="character"></select></label><label>Modo ao criar<select aria-label="Modo do duelo" name="mode"><option value="balanced">Nivelado · atributos fixos</option><option value="journey">Jornada · meus atributos e equipamentos</option></select></label><p data-build-preview></p><div class="arena-entry-actions"><button type="button" data-create>Criar sala</button><label>Chave da sala<input name="code" aria-label="Chave da sala" maxlength="10" autocomplete="off" placeholder="Ex.: A12B34C56D"></label><button type="submit">Entrar na sala</button></div></form>
    <section data-duel hidden><div class="arena-room"><strong data-code></strong><button class="secondary" data-copy>Copiar chave</button><span data-connection></span></div><p data-phase role="status"></p><div class="arena-fighters"></div><canvas class="arena-stage" aria-label="Combate sincronizado da arena"></canvas><div class="arena-actions"></div><p data-rules></p><ol class="arena-log" aria-label="Histórico do duelo"></ol><button data-leave class="secondary">Sair da sala</button></section>
    <label class="arena-sound"><input type="checkbox" data-arena-sound> Sons originais da arena</label><p data-feedback role="status"></p><p class="arena-note">Fechar mantém a sessão para retomar, mas o relógio continua. A ausência por 60 segundos encerra o duelo. Sem ranking ou recompensas nesta versão; salas ficam na memória e se encerram ao reiniciar o servidor.</p>`;
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
    const profile = loadout();
    const stats = arenaJourneyStats(select.value as ArenaCharacter, profile);
    const names = Object.values(profile.equipment)
      .map((id) => ITEMS.find((i) => i.id === id)?.name || id)
      .join(" · ");
    find("[data-build-preview]").textContent =
      mode.value === "journey"
        ? `Sua build: nível ${profile.level} · ${profile.upgrades} treinos · ${stats.maxHp} vida · ${stats.attack} ataque · ${stats.maxChakra} chakra. ${names || "Sem equipamentos"}. Amistoso com save local, sem ranking; a build é fixada ao entrar.`
        : "Nivelado: todos usam atributos fixos. Ao entrar por uma chave, vale o modo escolhido pelo criador da sala.";
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
    ["attack", "Atacar"],
    ["skill", "Jutsu · 35 chakra"],
    ["guard", "Defender"],
    ["charge", "Concentrar chakra"],
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
    if (!response.ok) throw new Error(data.error || "Arena indisponível.");
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
        feedback.textContent = "Resposta inválida da arena.";
      }
    });
    stream.onerror = () => {
      connected = false;
      renderClock();
      feedback.textContent =
        "Conexão interrompida. Tentando reconectar à sala…";
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
      ? "● Conectado ao servidor"
      : "○ Reconectando…";
    find("[data-phase]").textContent =
      state.status === "waiting"
        ? "Aguardando o segundo jogador. Compartilhe a chave acima."
        : state.status === "active"
          ? `Turno ${state.turnNumber} · ${myTurn ? "Sua vez" : "Vez do adversário"} · ${seconds}s`
          : state.winner === null
            ? "Sala encerrada · " + reason(state.reason)
            : `${state.winner === seat ? "Você venceu!" : "Você perdeu este duelo."} · ${reason(state.reason)}`;
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
          ? `Jutsu · recarga ${me.cooldown} turno(s)`
          : `${ARENA_FIGHTERS[me.character].skill} · ${state.rules.skillCost} chakra`;
    }
  }
  function render() {
    entry.hidden = !!state;
    duel.hidden = !state;
    if (!state || seat === null) return;
    find("[data-code]").textContent =
      "Sala " +
      state.code +
      (state.mode === "journey" ? " · Jornada" : " · Nivelado");
    const list = find(".arena-fighters");
    list.replaceChildren();
    state.players.forEach((p, i) => {
      const card = document.createElement("article");
      card.className =
        "arena-fighter" +
        (state?.status === "active" && state.turn === i ? " current" : "");
      card.dataset.seat = String(i);
      const title = document.createElement("h3");
      title.textContent = `${ARENA_FIGHTERS[p.character].name} · ${i === seat ? "Você" : "Adversário"}`;
      const text = document.createElement("p");
      text.textContent = `${p.hp}/${p.maxHp} vida · ${p.chakra}/${p.maxChakra} chakra · ${p.attack} ataque${p.guarding ? " · Defendendo" : ""}${p.connected ? "" : " · Desconectado"}`;
      const hp = document.createElement("progress");
      hp.max = p.maxHp;
      hp.value = p.hp;
      hp.setAttribute(
        "aria-label",
        "Vida de " + ARENA_FIGHTERS[p.character].name,
      );
      card.append(title, hp, text);
      if (p.loadout) {
        const build = document.createElement("p");
        build.textContent =
          `Nível ${p.loadout.level} · ${p.loadout.upgrades} treinos · ` +
          (Object.values(p.loadout.equipment)
            .map((id) => ITEMS.find((i) => i.id === id)?.name || id)
            .join(" · ") || "Sem equipamentos");
        card.append(build);
      }
      list.append(card);
    });
    const log = find(".arena-log");
    log.replaceChildren();
    for (const event of state.log.slice(-8).reverse()) {
      const li = document.createElement("li");
      li.textContent = `#${event.id} ${event.text}`;
      log.append(li);
    }
    find("[data-rules]").textContent =
      `Defender reduz o próximo golpe à metade. Concentrar recupera 30 chakra. +${state.players[seat].chakraRegen} chakra por turno; jutsus recarregam por dois turnos próprios.${state.mode === "journey" ? " A agilidade do ninja define quem começa; em empate, o criador inicia." : ""}`;
    find<HTMLButtonElement>("[data-leave]").textContent = [
      "active",
      "waiting",
    ].includes(state.status)
      ? "Desistir e sair da sala"
      : "Voltar para criar outra sala";
    renderClock();
  }
  async function start(path: "create" | "join") {
    if (busy) return;
    busy = true;
    feedback.textContent = "Conectando…";
    entry.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const request = version;
    try {
      const result = await api(path, {
        character: select.value,
        code: codeInput.value.trim().toUpperCase(),
        mode: mode.value,
        loadout: loadout(),
      });
      if (request !== version || !dialog.open) return;
      update(result);
      connect();
      feedback.textContent =
        "Sala pronta. Compartilhe apenas a chave; sua sessão fica neste navegador.";
    } catch (e) {
      if (request === version) feedback.textContent = String(e);
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
        requestId: crypto.randomUUID(),
      });
      if (request === version) {
        update(data);
        feedback.textContent = "";
      }
    } catch (e) {
      if (request === version) {
        feedback.textContent = String(e);
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
      feedback.textContent = "Chave copiada.";
    } catch {
      feedback.textContent = "Copie a chave exibida acima.";
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
      feedback.textContent = "Sala encerrada. Você pode iniciar outro duelo.";
    } catch (e) {
      feedback.textContent = String(e);
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
    feedback.textContent = "Verificando sessão…";
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
      if (request === version) feedback.textContent = String(e);
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
        knockout: "nocaute",
        "turn-timeout": "tempo do turno esgotado",
        disconnected: "ausência prolongada",
        left: "desistência",
        "waiting-expired": "convite expirado",
        "match-expired": "limite de duração",
      } as Record<string, string>
    )[value || ""] || "duelo encerrado"
  );
}

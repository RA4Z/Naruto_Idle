import { entityCatalog, filterEntities } from "./catalog";
import type { ActorRole, EntitySummary } from "./types";
const roleLabels: Record<ActorRole, string> = {
  npc: "Adicionar à vila",
  enemy: "Enfrentar",
  companion: "Convidar para grupo",
};
export function installLibrary(
  onChoose: (id: string, role: ActorRole) => Promise<void>,
) {
  const dialog = document.createElement("dialog");
  dialog.className = "entity-library";
  dialog.innerHTML =
    '<div class="library-heading"><div><p class="eyebrow">ARQUIVO DA VILA</p><h2>Personagens</h2></div><button class="secondary" data-close aria-label="Fechar biblioteca">Fechar</button></div><div class="library-controls"><input type="search" placeholder="Buscar nome ou ID" aria-label="Buscar personagem"><select data-collection aria-label="Filtrar coleção"><option value="playable">Personagens com animações padrão</option><option value="review">Acervo para revisão</option><option value="all">Todo o acervo</option></select><select aria-label="Filtrar função"><option value="all">Todos os recursos</option><option value="npc">NPCs na vila</option><option value="companion">Companheiros</option><option value="enemy">Adversários</option></select></div><p class="caption" data-summary></p><div class="entity-grid"></div><div class="library-pages"><button class="secondary" data-prev>Anterior</button><span></span><button class="secondary" data-next>Próxima</button></div><p role="status" data-feedback></p>';
  document.body.append(dialog);
  dialog
    .querySelector("[data-close]")!
    .addEventListener("click", () => dialog.close());
  let entries: EntitySummary[] = [],
    page = 0;
  const size = 24;
  const search = dialog.querySelector("input")!,
    filter = dialog.querySelector<HTMLSelectElement>(
      '[aria-label="Filtrar função"]',
    )!,
    collection = dialog.querySelector<HTMLSelectElement>("[data-collection]")!,
    grid = dialog.querySelector(".entity-grid")!;
  const feedback = dialog.querySelector<HTMLElement>("[data-feedback]")!;
  function render() {
    const matches = filterEntities(
      entries.filter(
        (e) => collection.value === "all" || e.collection === collection.value,
      ),
      search.value,
      filter.value as ActorRole | "all",
    );
    const pages = Math.max(1, Math.ceil(matches.length / size));
    page = Math.min(page, pages - 1);
    dialog.querySelector("[data-summary]")!.textContent =
      `${matches.length} modelos nesta coleção. ${collection.value === "review" ? "NPCs, objetos, retratos e modelos incompletos preservados para conferência." : "Nomes e variantes da configuração original. Jutsus individuais ainda podem requerer integração."}`;
    grid.replaceChildren();
    for (const e of matches.slice(page * size, (page + 1) * size)) {
      const card = document.createElement("article");
      card.className = "entity-card";
      card.dataset.entity = e.id;
      if (e.preview || e.portrait) {
        const image = document.createElement("img");
        image.src = e.preview || e.portrait!;
        image.className = e.preview ? "entity-preview" : "portrait-only";
        image.alt = (e.preview ? "Corpo inteiro de " : "Retrato de ") + e.name;
        image.loading = "lazy";
        image.decoding = "async";
        card.append(image);
      }
      const title = document.createElement("h3");
      title.textContent = e.name + (e.variant ? " [" + e.variant + "]" : "");
      card.append(title);
      const info = document.createElement("p");
      info.className = "caption";
      info.textContent = `ID ${e.id} · ${e.identity === "unidentified" ? "Identidade a confirmar" : e.identity === "source-config" ? "Nome da configuração" : "Conferido visualmente"}${e.status === "partial" ? " · efeitos parciais" : ""}`;
      card.append(info);
      let available = false;
      for (const role of ["npc", "companion", "enemy"] as const)
        if (e.capabilities[role]) {
          available = true;
          const button = document.createElement("button");
          button.className = "secondary";
          button.dataset.role = role;
          button.textContent = roleLabels[role];
          button.onclick = async () => {
            const buttons = dialog.querySelectorAll<HTMLButtonElement>(
              ".entity-card button",
            );
            buttons.forEach((b) => (b.disabled = true));
            feedback.textContent = "Carregando " + e.name + "…";
            try {
              await onChoose(e.id, role);
              feedback.textContent = e.name + " está na vila.";
              dialog.close();
            } catch (error) {
              feedback.textContent =
                error instanceof Error
                  ? error.message
                  : "Não foi possível carregar";
            } finally {
              buttons.forEach((b) => (b.disabled = false));
            }
          };
          card.append(button);
        }
      if (!available) {
        const note = document.createElement("p");
        note.className = "caption";
        note.textContent =
          e.status === "pending"
            ? "Conversão pendente"
            : e.status === "portrait-only"
              ? "Retrato preservado; animação indisponível"
              : "Modelo preservado; requer reconstrução adicional";
        card.append(note);
      }
      grid.append(card);
    }
    dialog.querySelector(".library-pages span")!.textContent =
      `${page + 1} / ${pages}`;
    (dialog.querySelector("[data-prev]") as HTMLButtonElement).disabled =
      page === 0;
    (dialog.querySelector("[data-next]") as HTMLButtonElement).disabled =
      page === pages - 1;
  }
  search.oninput =
    filter.onchange =
    collection.onchange =
      () => {
        page = 0;
        render();
      };
  dialog.querySelector("[data-prev]")!.addEventListener("click", () => {
    page--;
    render();
  });
  dialog.querySelector("[data-next]")!.addEventListener("click", () => {
    page++;
    render();
  });
  return async () => {
    feedback.textContent = "";
    dialog.showModal();
    try {
      entries = await entityCatalog.list();
      render();
    } catch (error) {
      feedback.textContent = String(error);
    }
  };
}

import { t, th, errorText } from "../i18n/core.ts";
import { entityCatalog, filterEntities } from "./catalog";
import type { ActorRole, EntitySummary } from "./types";
import { FUTURE_CHARACTERS } from "../progression/character-progress";
const roleLabels: Record<ActorRole, string> = {
  npc: t("common.addResident"),
  enemy: t("common.face"),
  companion: t("entities.library.2e7fa90a28"),
};
export function installLibrary(
  onChoose: (id: string, role: ActorRole) => Promise<void>,
  getCollection: () => ReadonlySet<string> = () => new Set(),
) {
  const dialog = document.createElement("dialog");
  dialog.className = "entity-library";
  dialog.innerHTML = `<div class="library-heading"><div><p class="eyebrow">${th("entities.library.7a8c0444a5")}</p><h2>${th("entities.library.125523ff6a")}</h2></div><button class="secondary" data-close aria-label="${th("entities.library.2b3f2896e8")}">${th("entities.library.0f2bd88ef0")}</button></div><div class="library-controls"><input type="search" placeholder="${th("entities.library.bc97214cb2")}" aria-label="${th("entities.library.b372a62b56")}"><select data-collection aria-label="${th("entities.library.2be0bf6b31")}"><option value="playable">${th("entities.library.cbd6c5647a")}</option><option value="review">${th("entities.library.ea94beffa8")}</option><option value="all">${th("common.allArchive")}</option></select><select aria-label="${th("entities.library.b6a022d2fc")}"><option value="all">${th("entities.library.1834fad1ca")}</option><option value="npc">${th("entities.library.52d4055b68")}</option><option value="companion">${th("entities.library.3ca6985785")}</option><option value="enemy">${th("entities.library.c578315353")}</option></select></div><p class="caption" data-summary></p><div class="entity-grid"></div><div class="library-pages"><button class="secondary" data-prev>${th("entities.library.e4ce7c09d5")}</button><span></span><button class="secondary" data-next>${th("entities.library.2fe966afd7")}</button></div><p role="status" data-feedback></p>`;
  document.body.append(dialog);
  dialog
    .querySelector("[data-close]")!
    .addEventListener("click", () => dialog.close());
  let entries: EntitySummary[] = [],
    page = 0;
  const size = 24;
  const search = dialog.querySelector("input")!,
    filter = dialog.querySelector<HTMLSelectElement>(
      "select:not([data-collection])",
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
    dialog.querySelector("[data-summary]")!.textContent = t(
      "entities.library.5f49133584",
      {
        v0: matches.length,
        v1:
          collection.value === "review"
            ? t("entities.library.7ef4a240a3")
            : t("entities.library.0b79c0c856"),
      },
    );
    grid.replaceChildren();
    for (const e of matches.slice(page * size, (page + 1) * size)) {
      const card = document.createElement("article");
      card.className = "entity-card";
      card.dataset.entity = e.id;
      if (e.preview || e.portrait) {
        const image = document.createElement("img");
        image.src = e.preview || e.portrait!;
        image.className = e.preview ? "entity-preview" : "portrait-only";
        image.alt =
          (e.preview
            ? t("entities.library.40e5dc98cf")
            : t("entities.library.784b535812")) + e.name;
        image.loading = "lazy";
        image.decoding = "async";
        card.append(image);
      }
      const title = document.createElement("h3");
      title.textContent = e.name + (e.variant ? " [" + e.variant + "]" : "");
      card.append(title);
      const info = document.createElement("p");
      info.className = "caption";
      info.textContent = t("entities.library.205e4dac05", {
        v0: e.id,
        v1:
          e.identity === "unidentified"
            ? t("common.unidentified")
            : e.identity === "source-config"
              ? t("entities.library.bcb8a44461")
              : t("entities.library.e482b87e22"),
        v2: e.status === "partial" ? t("entities.library.637c3c3776") : "",
      });
      card.append(info);
      let available = false;
      for (const role of ["npc", "companion", "enemy"] as const)
        if (e.capabilities[role]) {
          available = true;
          const button = document.createElement("button");
          button.className = "secondary";
          button.dataset.role = role;
          button.disabled = FUTURE_CHARACTERS.has(e.id);
          button.textContent = FUTURE_CHARACTERS.has(e.id)
            ? t("entities.library.6c8f338cef")
            : role === "companion" && !getCollection().has(e.id)
              ? t("common.recruitCost")
              : roleLabels[role];
          button.onclick = async () => {
            const buttons = dialog.querySelectorAll<HTMLButtonElement>(
              ".entity-card button",
            );
            buttons.forEach((b) => (b.disabled = true));
            feedback.textContent =
              t("entities.library.dd49ceecd8") + e.name + "…";
            try {
              await onChoose(e.id, role);
              feedback.textContent = e.name + t("common.updatedSuffix");
              dialog.close();
            } catch (error) {
              feedback.textContent =
                error instanceof Error
                  ? error.message
                  : t("entities.library.bf516d966f");
            } finally {
              buttons.forEach(
                (b) =>
                  (b.disabled = FUTURE_CHARACTERS.has(
                    b.closest<HTMLElement>(".entity-card")?.dataset.entity ||
                      "",
                  )),
              );
            }
          };
          card.append(button);
        }
      if (!available) {
        const note = document.createElement("p");
        note.className = "caption";
        note.textContent =
          e.status === "pending"
            ? t("entities.library.7b26924e67")
            : e.status === "portrait-only"
              ? t("entities.library.f497013dcb")
              : t("entities.library.68cc338885");
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
      feedback.textContent = errorText(error);
    }
  };
}

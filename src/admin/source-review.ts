import { t } from "../i18n/core";
import { sourceReviewItem } from "./source-review-entry";
import type { NativeEffectEntry } from "../effects/native-review";

/** Small searchable list; atlases load only when an approved preview is opened. */
export function mountSourceExportBrowser(host: HTMLElement, catalog: unknown, open: (entry: NativeEffectEntry) => void) {
  const rows = Object.values(catalog && typeof catalog === "object" ? catalog : {}).map(sourceReviewItem).filter(row => row !== undefined);
  const section = document.createElement("section"); section.className = "admin-card"; section.style.gridColumn = "1 / -1";
  const title = document.createElement("h3"), note = document.createElement("p"), controls = document.createElement("div"), search = document.createElement("input"), filter = document.createElement("select"), status = document.createElement("p"), list = document.createElement("div"), more = document.createElement("button");
  title.textContent = t("source.review.title"); note.textContent = t("source.review.note");
  controls.style.display = "flex"; controls.style.gap = "8px"; controls.style.flexWrap = "wrap";
  search.type = "search"; search.placeholder = t("source.review.search"); search.setAttribute("aria-label", t("source.review.search")); search.style.flex = "1"; search.style.minWidth = "180px";
  filter.setAttribute("aria-label", t("source.review.filter"));
  for (const key of ["all", "battle", "scene", "ready", "sequence"] as const) filter.append(new Option(t(`source.review.${key}`), key));
  list.className = "admin-grid"; status.setAttribute("role", "status");
  more.type = "button"; more.className = "secondary"; more.textContent = t("source.review.more");
  let limit = 24;
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const selected = rows.filter(row => (!query || `${row.source} ${row.action} ${row.id}`.toLocaleLowerCase().includes(query)) && (filter.value === "all" || row.kind === filter.value || row.status === filter.value));
    list.replaceChildren();
    for (const row of selected.slice(0, limit)) {
      const card = document.createElement("article"), heading = document.createElement("h4"), detail = document.createElement("p"), state = document.createElement("p"), button = document.createElement("button");
      card.className = "admin-card"; card.dataset.sourceExport = row.id;
      heading.textContent = row.source.split("/").at(-1) + " · " + row.action; heading.style.overflowWrap = "anywhere"; detail.textContent = t(`source.review.${row.kind}`); detail.title = row.source;
      state.textContent = t(`source.review.${row.status}`); button.textContent = t("source.review.open"); button.type = "button"; button.className = "secondary"; button.disabled = !row.preview;
      if (row.preview) button.onclick = () => open(row.preview!);
      card.append(heading, detail, state, button); list.append(card);
    }
    status.textContent = t("source.review.count", { shown: Math.min(selected.length, limit), total: selected.length });
    more.hidden = selected.length <= limit;
  }
  search.oninput = filter.onchange = () => { limit = 24; render(); };
  more.onclick = () => { limit += 24; render(); };
  controls.append(search, filter); section.append(title, note, controls, status, list, more); host.prepend(section); render();
}

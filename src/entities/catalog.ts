import { t, localizeContent } from "../i18n/core.ts";
import type { EntityManifest, EntitySummary, ActorRole } from "./types";
import { runtimeIndex } from "../assets/runtime-index";
export function filterEntities(
  entries: EntitySummary[],
  search: string,
  role: ActorRole | "all",
) {
  const term = search
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return entries.filter(
    (e) =>
      (role === "all" || e.capabilities[role]) &&
      (!term ||
        [e.id, e.name, e.variant || "", ...(e.aliases || [])]
          .join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(term)),
  );
}
export class EntityCatalog {
  private index?: Promise<EntitySummary[]>;
  private manifests = new Map<string, Promise<EntityManifest>>();
  private reviews?: Promise<
    Record<
      string,
      {
        decision: string;
        capabilities: EntitySummary["capabilities"];
      }
    >
  >;
  private getReviews() {
    return (this.reviews ??= fetch("/assets/catalog/reviews.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("entities.catalog.1879f249a3"));
        return response.json();
      })
      .catch((error) => {
        this.reviews = undefined;
        throw error;
      }));
  }
  list(): Promise<EntitySummary[]> {
    return (this.index ??= fetch("/assets/catalog/entities.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(t("entities.catalog.b645176888"));
        const data = localizeContent(await response.json());
        if (!Array.isArray(data.entities))
          throw new Error(t("entities.catalog.1d4676885b"));
        const reviews = await this.getReviews();
        return (data.entities as EntitySummary[]).map(
          (entry): EntitySummary => {
            const review = reviews[entry.id];
            if (!review) return entry;
            return {
              ...entry,
              capabilities:
                review.decision === "approved"
                  ? review.capabilities
                  : { npc: false, companion: false, enemy: false },
              collection:
                review.decision === "approved" ? "playable" : "review",
            };
          },
        );
      })
      .catch((error) => {
        this.index = undefined;
        throw error;
      }));
  }
  async get(id: string): Promise<EntityManifest> {
    let entry = (await runtimeIndex()).entities[id];
    if (!entry) {
      const full = (await this.list()).find((e) => e.id === id);
      if (full)
        entry = {
          name: full.name,
          url:
            full.manifestUrl ||
            `/assets/characters/${encodeURIComponent(full.slug)}/manifest.json`,
          capabilities: full.capabilities,
          collection: full.collection,
        };
    }
    if (!entry) throw new Error(t("entities.catalog.73279dd547") + id);
    let cached = this.manifests.get(id);
    if (!cached) {
      cached = fetch(entry.url, { signal: AbortSignal.timeout(20000) })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(t("entities.catalog.ead5a398e6") + id);
          const manifest = localizeContent(
            await response.json(),
          ) as EntityManifest;
          const review = (await this.getReviews())[id];
          return {
            ...manifest,
            capabilities: review
              ? review.decision === "approved"
                ? review.capabilities
                : { npc: false, companion: false, enemy: false }
              : entry.capabilities,
            collection: review
              ? review.decision === "approved"
                ? "playable"
                : "review"
              : entry.collection,
          };
        })
        .catch((error) => {
          this.manifests.delete(id);
          throw error;
        });
      this.manifests.set(id, cached);
      if (this.manifests.size > 32)
        this.manifests.delete(this.manifests.keys().next().value!);
    }
    return cached;
  }
}
export const entityCatalog = new EntityCatalog();

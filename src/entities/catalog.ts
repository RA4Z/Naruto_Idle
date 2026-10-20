import type { EntityManifest, EntitySummary, ActorRole } from "./types";

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
  list(): Promise<EntitySummary[]> {
    return (this.index ??= fetch("/assets/catalog/entities.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Catálogo indisponível");
        const data = await response.json();
        if (!Array.isArray(data.entities)) throw new Error("Catálogo inválido");
        return data.entities as EntitySummary[];
      })
      .catch((error) => {
        this.index = undefined;
        throw error;
      }));
  }
  async get(id: string): Promise<EntityManifest> {
    const entry = (await this.list()).find((e) => e.id === id);
    if (!entry) throw new Error("Personagem não encontrado: " + id);
    let cached = this.manifests.get(id);
    if (!cached) {
      cached = fetch(
        entry.manifestUrl ||
          `/assets/characters/${encodeURIComponent(entry.slug)}/manifest.json`,
      )
        .then(async (response) => {
          if (!response.ok)
            throw new Error("Recursos ainda indisponíveis: " + entry.name);
          return response.json() as Promise<EntityManifest>;
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

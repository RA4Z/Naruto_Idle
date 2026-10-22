import { t, localizeContent } from "../i18n/core.ts";
import type { ActorRole, EntitySummary } from "../entities/types";
import type { WorldMap } from "../world/maps";
export type RuntimeEntry = {
  name: string;
  preview?: string;
  portrait?: string;
  variant?: string;
  url: string;
  capabilities: Partial<Record<ActorRole, boolean>>;
  collection?: EntitySummary["collection"];
};
let pending:
  | Promise<{
      entities: Record<string, RuntimeEntry>;
      maps: WorldMap[];
    }>
  | undefined;
export function runtimeIndex(): Promise<{
  entities: Record<string, RuntimeEntry>;
  maps: WorldMap[];
}> {
  return (pending ??= fetch("/assets/catalog/runtime.json", {
    signal: AbortSignal.timeout(20000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(t("assets.runtime-index.f205e63de1"));
      return localizeContent(await response.json());
    })
    .catch((error) => {
      pending = undefined;
      throw error;
    }));
}

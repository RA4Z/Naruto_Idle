import { restore, type Save } from "../model";

export const LOCAL_SAVE_KEY = "folha-idle-v1";
export const LOCAL_BACKUP_KEY = "folha-idle-before-cloud";

/** Migrate through the same validator as local saves, without claiming offline XP. */
export function cloudSnapshot(value: unknown): Save {
  const encoded = JSON.stringify(value);
  if (!encoded || new TextEncoder().encode(encoded).length > 131072)
    throw new Error("INVALID_SAVE");
  const input = JSON.parse(encoded);
  if (!input || typeof input !== "object" || !Number.isFinite(input.lastSaved))
    throw new Error("INVALID_SAVE");
  const restored = restore(
    { read: () => encoded, write: () => {} },
    input.lastSaved,
  );
  if (!restored) throw new Error("INVALID_SAVE");
  return restored.save;
}

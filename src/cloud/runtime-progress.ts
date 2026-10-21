import type { ProgressStore } from "../model";

/** Rendering/recovery state for this tab only. Never persisted or restored from a browser cache. */
export class MemoryProgressStore implements ProgressStore {
  private snapshot: string | null = null;
  read() { return this.snapshot; }
  write(snapshot: string) { this.snapshot = snapshot; }
  clear() { this.snapshot = null; }
}
export const runtimeProgress = new MemoryProgressStore();

/** Remove obsolete local saves, including account backups from earlier builds. */
export function clearLegacyProgress(storage: Storage) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys) {
    if (key && (key === "folha-idle-v1" || key === "folha-idle-cloud-owner" ||
      key.startsWith("folha-idle-before-") || key.startsWith("folha-idle-account-backup:")))
      storage.removeItem(key);
  }
}

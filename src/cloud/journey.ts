import { CloudSync, type SyncState } from "./sync";
import { cloudClient, transport } from "./client";
import { cloudSnapshot, LOCAL_SAVE_KEY, LOCAL_BACKUP_KEY } from "./snapshot";
import {
  acquireJourney,
  releaseJourney,
  writeJourney,
  ownsJourney,
  flushJourneyWrites,
} from "../journey-lock";
import { restore, type Save } from "../model";
import { requireAccount } from "./profile";

export const cloudSync = new CloudSync(transport, (state: SyncState) => {
  window.dispatchEvent(new CustomEvent("cloud-state", { detail: state }));
  if (state === "lost")
    window.dispatchEvent(
      new CustomEvent("journey-lock-lost", { detail: { cloud: true } }),
    );
});
let timer: ReturnType<typeof setInterval> | undefined;
let accountId = "";
export const cloudJourneyActive = () => !!accountId;
export const cloudJourneyOwner = () => !accountId || cloudSync.check();
export function queueCloudSave(snapshot: string) {
  if (accountId) cloudSync.queue(JSON.parse(snapshot));
}

export async function openCloudJourney(initial?: Save) {
  await requireAccount();
  if (!cloudClient) throw new Error("CLOUD_UNAVAILABLE");
  const {
    data: { session },
  } = await cloudClient.auth.getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  await acquireJourney();
  try {
    if (cloudSync.state === "lost") await cloudSync.close();
    const result = await cloudSync.open(initial);
    const previous = localStorage.getItem(LOCAL_SAVE_KEY);
    // Preserve a per-account recovery copy separately from the guest backup.
    const oldBinding = localStorage.getItem("folha-idle-cloud-owner");
    if (previous && !oldBinding)
      localStorage.setItem(LOCAL_BACKUP_KEY, previous);
    else if (!previous && !oldBinding)
      localStorage.removeItem(LOCAL_BACKUP_KEY);
    if (previous && oldBinding)
      localStorage.setItem(`folha-idle-account-backup:${oldBinding}`, previous);
    const restored = restore(
      { read: () => JSON.stringify(result.snapshot), write: () => {} },
      result.serverNow,
    );
    if (!restored) throw new Error("INVALID_SAVE");
    // The initial offline claim is flushed before gameplay. Interrupted attempts
    // resolve using the same request ID, never as a second reward interval.
    cloudSync.queue(restored.save);
    await cloudSync.flush();
    accountId = session.user.id;
    localStorage.setItem("folha-idle-cloud-owner", accountId);
    writeJourney(JSON.stringify(restored.save));
    timer = setInterval(() => {
      if (!ownsJourney() || !cloudSync.check()) return;
      void cloudSync.flush().catch(() => {});
    }, 30000);
    return restored;
  } catch (error) {
    if (cloudSync.active) await cloudSync.close().catch(() => {});
    releaseJourney();
    throw error;
  }
}

export async function closeCloudJourney() {
  if (!accountId) return;
  await cloudSync.close();
  await flushJourneyWrites();
  clearInterval(timer);
  accountId = "";
  restoreGuestCache();
}
export function restoreGuestCache() {
  if (accountId) return;
  const binding = localStorage.getItem("folha-idle-cloud-owner");
  if (!binding) return;
  const current = localStorage.getItem(LOCAL_SAVE_KEY);
  if (current)
    localStorage.setItem(`folha-idle-account-backup:${binding}`, current);
  const guest = localStorage.getItem(LOCAL_BACKUP_KEY);
  if (guest) localStorage.setItem(LOCAL_SAVE_KEY, guest);
  else localStorage.removeItem(LOCAL_SAVE_KEY);
  localStorage.removeItem("folha-idle-cloud-owner");
}
export function localSnapshot() {
  const raw = localStorage.getItem(
    localStorage.getItem("folha-idle-cloud-owner")
      ? LOCAL_BACKUP_KEY
      : LOCAL_SAVE_KEY,
  );
  return raw ? cloudSnapshot(JSON.parse(raw)) : undefined;
}
export function downloadLocalBackup() {
  const raw = localStorage.getItem(LOCAL_SAVE_KEY);
  if (!raw) throw new Error("SAVE_MISSING");
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "naruto-idle-backup.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.addEventListener("journey-lock-lost", () => {
  clearInterval(timer);
  if (accountId) cloudSync.invalidate();
  accountId = "";
  // Do not release an unknown in-flight commit or silently resume a stale cache.
});
cloudClient?.auth.onAuthStateChange((_event, session) => {
  if (accountId && session?.user.id !== accountId)
    window.dispatchEvent(new Event("journey-lock-lost"));
});

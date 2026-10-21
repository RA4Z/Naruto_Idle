import { CloudSync, type SyncState } from "./sync";
import { cloudClient, transport } from "./client";
import { acquireJourney, releaseJourney, writeJourney, ownsJourney } from "../journey-lock";
import { restore, type Save } from "../model";
import { requireAccount } from "./profile";
import { runtimeProgress } from "./runtime-progress";

export const cloudSync = new CloudSync(transport, (state: SyncState) => {
  window.dispatchEvent(new CustomEvent("cloud-state", { detail: state }));
  if (state === "lost")
    window.dispatchEvent(new CustomEvent("journey-lock-lost", { detail: { cloud: true } }));
});
let timer: ReturnType<typeof setInterval> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let accountId = "";
export const cloudJourneyActive = () => !!accountId;
export const cloudJourneyOwner = () => !accountId || cloudSync.check();
export function queueCloudSave(snapshot: string) {
  if (!accountId) return;
  cloudSync.queue(JSON.parse(snapshot));
  if (!saveTimer) saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void flushCloudSave().catch(() => {});
  }, 1000);
}
export async function flushCloudSave() {
  if (accountId && ownsJourney() && cloudSync.check()) await cloudSync.flush();
}

export async function openCloudJourney(initial?: Save) {
  const account = await requireAccount();
  await acquireJourney();
  try {
    if (cloudSync.state === "lost") await cloudSync.close();
    const result = await cloudSync.open(initial);
    const restored = restore(
      { read: () => JSON.stringify(result.snapshot), write: () => {} },
      result.serverNow,
    );
    if (!restored) throw new Error("INVALID_SAVE");
    cloudSync.queue(restored.save);
    await cloudSync.flush();
    accountId = account.user.id;
    writeJourney(JSON.stringify(restored.save));
    timer = setInterval(() => {
      if (!ownsJourney() || !cloudSync.check()) return;
      void cloudSync.flush().catch(() => {});
    }, 30000);
    return restored;
  } catch (error) {
    if (cloudSync.active) await cloudSync.close().catch(() => {});
    runtimeProgress.clear();
    releaseJourney();
    throw error;
  }
}
export async function closeCloudJourney() {
  if (!accountId) return;
  await cloudSync.close();
  clearInterval(timer);
  clearTimeout(saveTimer);
  saveTimer = undefined;
  accountId = "";
  runtimeProgress.clear();
}
window.addEventListener("journey-lock-lost", () => {
  clearInterval(timer);
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (accountId) cloudSync.invalidate();
  accountId = "";
  runtimeProgress.clear();
});
cloudClient?.auth.onAuthStateChange((_event, session) => {
  if (accountId && session?.user.id !== accountId)
    window.dispatchEvent(new Event("journey-lock-lost"));
});

import { t } from "./i18n/core.ts";
import { runtimeProgress } from "./cloud/runtime-progress";

// Transactions serialize takeovers; a synchronous fence blocks former owners.
// Local ownership needs no expiry because a new tab always replaces it. The
// remote lease remains authoritative across devices and expires on disconnection.
const NAME = "folha-idle-journey";
const FENCE = NAME + "-owner";
let owner = "";
let heartbeat: ReturnType<typeof setInterval> | undefined;
let acquiring: Promise<void> | undefined;
let db: Promise<IDBDatabase> | undefined;
function database() {
  return (db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("lease");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      db = undefined;
      reject(request.error);
    };
  }));
}
async function transact(id: string, release = false, renew = false) {
  const handle = await database();
  return new Promise<boolean>((resolve, reject) => {
    const tx = handle.transaction("lease", "readwrite");
    const store = tx.objectStore("lease");
    let accepted = false;
    const request = store.get("active");
    request.onsuccess = () => {
      const previous = request.result as { id: string } | undefined;
      if (release) {
        if (previous?.id === id) {
          store.delete("active");
          if (localStorage.getItem(FENCE) === id)
            localStorage.removeItem(FENCE);
        }
      } else if (
        !renew ||
        (owner === id &&
          previous?.id === id &&
          localStorage.getItem(FENCE) === id)
      ) {
        store.put({ id }, "active");
        localStorage.setItem(FENCE, id);
        accepted = true;
      }
    };
    tx.oncomplete = () => resolve(accepted);
    tx.onerror = tx.onabort = () =>
      reject(tx.error || new Error("Lease transaction failed"));
  });
}
export function ownsJourney() {
  if (!owner) return false;
  try {
    return localStorage.getItem(FENCE) === owner;
  } catch {
    return false;
  }
}
export function assertJourneyOwner() {
  if (!ownsJourney()) throw new Error(t("qol.otherTab"));
}
export function writeJourney(snapshot: string) {
  assertJourneyOwner();
  runtimeProgress.write(snapshot);
}
function lost() {
  releaseJourney();
  window.dispatchEvent(new Event("journey-lock-lost"));
}
export function acquireJourney(): Promise<void> {
  if (ownsJourney()) return Promise.resolve();
  return (acquiring ??= (async () => {
    const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
      n.toString(16),
    ).join("-");
    if (!(await transact(id))) throw new Error(t("qol.otherTab"));
    owner = id;
    assertJourneyOwner();
    heartbeat = setInterval(() => {
      if (!ownsJourney()) {
        lost();
        return;
      }
      void transact(id, false, true)
        .then((ok) => {
          if (!ok && owner === id) lost();
        })
        .catch(() => {
          if (owner === id) lost();
        });
    }, 4000);
  })().finally(() => {
    acquiring = undefined;
  }));
}
export function releaseJourney() {
  const previous = owner;
  owner = "";
  if (previous) {
    try {
      if (localStorage.getItem(FENCE) === previous)
        localStorage.removeItem(FENCE);
    } catch {
      /* A new tab can still take over explicitly. */
    }
  }
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = undefined;
  if (previous) void transact(previous, true).catch(() => {});
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === FENCE && owner && !ownsJourney()) lost();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      releaseJourney();
      window.location.reload();
    }
  });
}

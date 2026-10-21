import { t } from "./i18n/core.ts";
import { runtimeProgress } from "./cloud/runtime-progress";

// Web Locks survive background throttling. On insecure LAN origins an IndexedDB
// transaction arbitrates a fenced lease; an expired owner can never write again.
const NAME = "folha-idle-journey";
const FENCE = NAME + "-owner";
const TTL = 20000;
let owner = "";
let expires = 0;
let native = false;
let releaseNative: (() => void) | undefined;
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
async function transact(
  id: string,
  release = false,
  renew = false,
) {
  const databaseHandle = await database();
  return new Promise<boolean>((resolve, reject) => {
    const tx = databaseHandle.transaction("lease", "readwrite");
    const store = tx.objectStore("lease");
    let accepted = false;
    const request = store.get("active");
    request.onsuccess = () => {
      const previous = request.result as
        | { id: string; until: number }
        | undefined;
      if (release) {
        if (previous?.id === id) {
          store.delete("active");
          if (localStorage.getItem(FENCE) === id)
            localStorage.removeItem(FENCE);
        }
      } else if (
        renew
          ? owner === id &&
            previous?.id === id &&
            previous.until > Date.now() &&
            localStorage.getItem(FENCE) === id
          : !previous ||
            previous.until <= Date.now() ||
            !localStorage.getItem(FENCE)
      ) {
        const until = Date.now() + TTL;
        store.put({ id, until }, "active");
        localStorage.setItem(FENCE, id);
        expires = until;
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
  if (native) return true;
  try {
    return Date.now() < expires && localStorage.getItem(FENCE) === owner;
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
    if (navigator.locks) {
      await new Promise<void>((resolve, reject) => {
        void navigator.locks
          .request(NAME, { ifAvailable: true }, async (lock) => {
            if (!lock) {
              reject(new Error(t("qol.otherTab")));
              return;
            }
            native = true;
            owner = id;
            await new Promise<void>((release) => {
              releaseNative = release;
              resolve();
            });
          })
          .catch(reject);
      });
    } else {
      if (!(await transact(id))) throw new Error(t("qol.otherTab"));
      native = false;
      owner = id;
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
    }
  })().finally(() => {
    acquiring = undefined;
  }));
}
export function releaseJourney() {
  const previous = owner;
  owner = "";
  if (!native && previous) {
    try {
      if (localStorage.getItem(FENCE) === previous)
        localStorage.removeItem(FENCE);
    } catch {
      /* Lease expires if storage becomes unavailable. */
    }
  }
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = undefined;
  if (releaseNative) releaseNative();
  else if (previous) void transact(previous, true).catch(() => {});
  releaseNative = undefined;
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === FENCE && owner && !native && !ownsJourney()) lost();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      releaseJourney();
      window.location.reload();
    }
  });
}

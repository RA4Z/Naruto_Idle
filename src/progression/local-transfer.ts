import { t } from "../i18n/core.ts";
import { restore, type ProgressStore } from "../model";
export const TRANSFER_FRAGMENT = "folha-local-transfer";
export const LOCAL_TRANSFER_BACKUP = "folha-idle-before-localhost-transfer";
const loopback = (hostname: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
export function localhostTransferUrl(
  address: string,
  progress: string,
): string {
  const target = new URL(address);
  target.protocol = "http:";
  target.hostname = "localhost";
  target.pathname = "/";
  target.search = "";
  // Fragments are processed only by the browser and are never sent to the server.
  target.hash = new URLSearchParams({
    [TRANSFER_FRAGMENT]: progress,
  }).toString();
  return target.href;
}
export function acceptLocalhostTransfer(
  address: string,
  store: ProgressStore,
  backup: (previous: string) => void,
  now = Date.now(),
): boolean {
  const url = new URL(address);
  const progress = new URLSearchParams(url.hash.slice(1)).get(
    TRANSFER_FRAGMENT,
  );
  if (progress === null) return false;
  if (!loopback(url.hostname))
    throw new Error(t("progression.local-transfer.1bcf23efcb"));
  let validated: string | undefined;
  const result = restore(
    {
      read: () => progress,
      write: (raw) => {
        validated = raw;
      },
    },
    now,
  );
  if (!result || !validated)
    throw new Error(t("progression.local-transfer.e89645fc77"));
  const previous = store.read();
  if (previous && previous !== validated) backup(previous);
  store.write(validated);
  return true;
}

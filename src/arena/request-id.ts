// getRandomValues is available on HTTP LAN origins; randomUUID requires a
// secure context and is unavailable when opening http://192.168... or 10... .
export function arenaRequestId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

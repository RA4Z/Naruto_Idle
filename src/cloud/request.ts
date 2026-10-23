/** Bound every cloud request, including calls carrying an SDK abort signal. */
export function cloudFetch(input: RequestInfo | URL, init?: RequestInit) {
  const caller = init?.signal || (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  const deadline = AbortSignal.timeout(20000);
  return fetch(input, {
    ...init,
    // Best effort on tab close; large payloads use normal fetch.
    keepalive: typeof init?.body === "string" && new TextEncoder().encode(init.body).length <= 60000,
    signal: caller ? AbortSignal.any([caller, deadline]) : deadline,
  });
}

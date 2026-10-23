import test from "node:test";
import assert from "node:assert/strict";
import { cloudFetch } from "../src/cloud/request.ts";

test("SDK signals cannot disable the cloud deadline and caller cancellation is preserved", async (context) => {
  const deadline = new AbortController(), caller = new AbortController();
  let sent: RequestInit | undefined;
  context.mock.method(AbortSignal, "timeout", (ms: number) => { assert.equal(ms, 20000); return deadline.signal; });
  context.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => { sent = init; return new Response("{}"); });
  await cloudFetch("https://example.invalid", { signal: caller.signal, body: "{}", method: "POST" });
  assert.equal(sent!.keepalive, true);
  deadline.abort();
  assert.equal(sent!.signal!.aborted, true);
  const secondDeadline = new AbortController();
  context.mock.method(AbortSignal, "timeout", () => secondDeadline.signal);
  await cloudFetch("https://example.invalid", { signal: caller.signal });
  caller.abort();
  assert.equal(sent!.signal!.aborted, true);
  assert.equal(secondDeadline.signal.aborted, false);
});

test("large snapshots avoid the browser keepalive quota and Request cancellation survives", async (context) => {
  let sent: RequestInit | undefined;
  context.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => { sent = init; return new Response("{}"); });
  const caller = new AbortController();
  await cloudFetch(new Request("https://example.invalid", { signal: caller.signal }), { body: "x".repeat(60001), method: "POST" });
  assert.equal(sent!.keepalive, false);
  caller.abort();
  assert.equal(sent!.signal!.aborted, true);
});

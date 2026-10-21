import test from "node:test";
import assert from "node:assert/strict";
import { MemoryProgressStore, clearLegacyProgress } from "../src/cloud/runtime-progress.ts";

test("runtime progress is isolated in memory and never reads a browser save", () => {
  const a = new MemoryProgressStore(), b = new MemoryProgressStore();
  a.write('{"coins":42}');
  assert.equal(a.read(), '{"coins":42}');
  assert.equal(b.read(), null);
  a.clear();
  assert.equal(a.read(), null);
});
test("legacy saves and per-account backups are removed while session and preferences stay intact", () => {
  const values = new Map([
    ["folha-idle-v1", "untrusted"], ["folha-idle-before-cloud", "old"],
    ["folha-idle-before-localhost-transfer", "old"], ["folha-idle-account-backup:a", "old"],
    ["folha-idle-cloud-owner", "a"], ["folha-idle-language", "pt-BR"],
    ["sb-test-auth-token", "session"], ["folha-idle-journey-owner", "lock"],
  ]);
  const storage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    removeItem: (key: string) => { values.delete(key); } } as Storage;
  clearLegacyProgress(storage);
  assert.deepEqual([...values.keys()], ["folha-idle-language", "sb-test-auth-token", "folha-idle-journey-owner"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  CloudSync,
  type CloudTransport,
  type CloudReply,
} from "../src/cloud/sync.ts";
import { cloudSnapshot } from "../src/cloud/snapshot.ts";
import { fresh } from "../src/model.ts";

function fixture() {
  let now = 0,
    revision = 1,
    calls = 0;
  const commits: unknown[][] = [];
  const reply = (): CloudReply => ({
    revision,
    serverNow: 1000 + now,
    leaseUntil: 121000 + now,
    snapshot: fresh("sasuke", 1000),
  });
  const transport: CloudTransport = {
    claim: async () => reply(),
    commit: async (...args) => {
      commits.push(args);
      revision++;
      return reply();
    },
    heartbeat: async () => reply(),
    release: async () => {},
  };
  const states: string[] = [];
  const sync = new CloudSync(
    transport,
    (state) => states.push(state),
    () => now,
    () => `id-${++calls}`,
  );
  return {
    sync,
    transport,
    commits,
    states,
    advance: (ms: number) => {
      now += ms;
    },
    reply,
  };
}
test("cloud saves migrate the same character records and reject corrupt/oversize snapshots without offline rewards", () => {
  const value = fresh("sasuke", 1000);
  value.location = "10005";
  value.autoHunt = true;
  assert.equal(cloudSnapshot(value).xp, 0);
  assert.equal(cloudSnapshot(value).lastSaved, 1000);
  assert.deepEqual(
    cloudSnapshot(value).characterProgress,
    value.characterProgress,
  );
  assert.throws(() => cloudSnapshot({ ...value, coins: -1 }), /INVALID_SAVE/);
  assert.throws(
    () => cloudSnapshot({ ...value, padding: "x".repeat(150000) }),
    /INVALID_SAVE/,
  );
  assert.equal(value.xp, 0);
});
test("unknown commit outcome retries identical receipt and snapshot before newer progress", async () => {
  const f = fixture();
  await f.sync.open();
  let fail = true;
  f.transport.commit = async (...args) => {
    f.commits.push(structuredClone(args));
    if (fail) {
      fail = false;
      throw new Error("network disconnected after commit");
    }
    return { ...f.reply(), revision: 2 };
  };
  f.sync.queue(fresh("sasuke", 1000));
  await assert.rejects(f.sync.flush());
  assert.equal(f.sync.state, "retry");
  f.sync.queue({ ...fresh("sasuke", 1000), coins: 42 });
  await f.sync.flush();
  assert.deepEqual(f.commits[0], f.commits[1]);
  await f.sync.flush();
  assert.notEqual(f.commits[2][2], f.commits[1][2]);
  assert.equal((f.commits[2][3] as { coins: number }).coins, 42);
});
test("expired and conflicting sessions cannot resume stale writes", async () => {
  const f = fixture();
  await f.sync.open();
  f.advance(116000);
  assert.equal(f.sync.check(), false);
  f.sync.queue(fresh("naruto"));
  await f.sync.flush();
  assert.equal(f.commits.length, 0);
  const g = fixture();
  await g.sync.open();
  g.transport.commit = async () => {
    throw new Error("REVISION_CONFLICT");
  };
  g.sync.queue(fresh("sasuke"));
  await assert.rejects(g.sync.flush());
  assert.equal(g.sync.active, false);
});
test("close drains in-flight and newer progress before releasing the lease", async () => {
  const f = fixture();
  await f.sync.open();
  let releaseCount = 0;
  f.transport.release = async () => {
    releaseCount++;
  };
  let finish!: (reply: CloudReply) => void;
  f.transport.commit = async (...args) => {
    f.commits.push(args);
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  f.sync.queue(fresh("sasuke"));
  const flushing = f.sync.flush();
  f.sync.queue({ ...fresh("sasuke"), coins: 10 });
  const closing = f.sync.close();
  assert.equal(releaseCount, 0);
  finish({ ...f.reply(), revision: 2 });
  await flushing;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(f.commits.length, 2);
  finish({ ...f.reply(), revision: 3 });
  await closing;
  assert.equal(releaseCount, 1);
  assert.equal(f.sync.active, false);
});
test("late responses after losing a local lock never reactivate cloud ownership", async () => {
  const f = fixture();
  await f.sync.open();
  let finish!: (reply: CloudReply) => void;
  f.transport.commit = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  f.sync.queue(fresh("naruto"));
  const request = f.sync.flush();
  f.sync.invalidate();
  finish({ ...f.reply(), revision: 2 });
  await assert.rejects(request, /SESSION_LOST/);
  assert.equal(f.sync.active, false);
});

test("reopening after session loss discards stale receipts instead of overwriting another device's progress", async () => {
  const f = fixture(); await f.sync.open();
  f.transport.commit = async () => { throw new Error("SESSION_LOST"); };
  f.sync.queue({ ...fresh("sasuke"), coins: 999 });
  await assert.rejects(f.sync.flush());
  await f.sync.close();
  f.transport.claim = async () => ({ ...f.reply(), revision: 7, snapshot: { ...fresh("sasuke"), coins: 20 } });
  f.transport.commit = async (...args) => { f.commits.push(args); return { ...f.reply(), revision: 8 }; };
  const reopened = await f.sync.open();
  f.sync.queue(reopened.snapshot); await f.sync.flush();
  assert.equal((f.commits[0][3] as { coins: number }).coins, 20);
  assert.equal(f.commits[0][1], 7);
});

test("a failed close resumes accepting current progress and keeps the original uncertain receipt", async () => {
  const f = fixture(); await f.sync.open();
  f.transport.commit = async () => { throw new Error("offline"); };
  f.sync.queue(fresh("sasuke")); await assert.rejects(f.sync.close());
  f.sync.queue({ ...fresh("sasuke"), coins: 33 });
  f.transport.commit = async (...args) => { f.commits.push(args); return { ...f.reply(), revision: 2 }; };
  await f.sync.flush(); await f.sync.flush();
  assert.equal((f.commits[1][3] as { coins: number }).coins, 33);
});

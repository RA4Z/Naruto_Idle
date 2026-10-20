import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../src/model.ts";
import {
  localhostTransferUrl,
  acceptLocalhostTransfer,
} from "../src/progression/local-transfer.ts";

test("IP-to-localhost transfer keeps the same server port and carries progress only in the fragment", () => {
  const raw = JSON.stringify(fresh("naruto"));
  const target = new URL(
    localhostTransferUrl("http://10.1.43.80:5178/?old=value", raw),
  );
  assert.equal(target.origin, "http://localhost:5178");
  assert.equal(target.pathname, "/");
  assert.equal(target.search, "");
  assert.ok(target.hash.includes("folha-local-transfer"));
});

test("validated transfer preserves individual progression and backs up an existing localhost journey", () => {
  const source = fresh("naruto", 1000);
  source.level = 8;
  source.upgrades = 4;
  source.xp = 31;
  source.characterProgress!["11000201"].level = 3;
  const previous = JSON.stringify(fresh("sakura", 1000));
  let raw = previous,
    backup = "";
  const accepted = acceptLocalhostTransfer(
    localhostTransferUrl("http://10.1.43.80:5178", JSON.stringify(source)),
    {
      read: () => raw,
      write: (value) => {
        raw = value;
      },
    },
    (value) => {
      backup = value;
    },
    1000,
  );
  assert.equal(accepted, true);
  assert.equal(backup, previous);
  const save = JSON.parse(raw);
  assert.equal(save.character, "naruto");
  assert.equal(save.level, 8);
  assert.equal(save.xp, 31);
  assert.equal(save.upgrades, 4);
  assert.equal(save.characterProgress["11000201"].level, 3);
});

test("invalid transfers cannot replace or back up the existing save, and only loopback accepts transfers", () => {
  let writes = 0,
    backups = 0;
  const store = {
    read: () => JSON.stringify(fresh("sakura")),
    write: () => {
      writes++;
    },
  };
  assert.equal(
    acceptLocalhostTransfer("http://localhost:5178/", store, () => {
      backups++;
    }),
    false,
  );
  assert.throws(() =>
    acceptLocalhostTransfer(
      localhostTransferUrl("http://10.1.43.80:5178", "{bad"),
      store,
      () => {
        backups++;
      },
    ),
  );
  const badHost = new URL(
    localhostTransferUrl(
      "http://10.1.43.80:5178",
      JSON.stringify(fresh("naruto")),
    ),
  );
  badHost.hostname = "10.1.43.80";
  assert.throws(() =>
    acceptLocalhostTransfer(badHost.href, store, () => {
      backups++;
    }),
  );
  assert.equal(writes, 0);
  assert.equal(backups, 0);
});

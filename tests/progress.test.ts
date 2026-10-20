import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, restore, Hunt, needed, stats } from "../src/model.ts";
test("offline is committed before a reload and capped", () => {
  let raw = JSON.stringify({
    ...fresh("naruto", 1000),
    location: "10005",
    autoHunt: true,
  });
  const store = {
    read: () => raw,
    write: (v: string) => {
      raw = v;
    },
  };
  const first = restore(store, 1000 + 1000 * 86400)!;
  assert.ok(first.offline.xp > 0);
  assert.equal(first.offline.seconds, 7200);
  const coins = first.save.coins;
  const second = restore(store, 1000 + 1000 * 86400)!;
  assert.equal(second.offline.xp, 0);
  assert.equal(second.save.coins, coins);
});
test("all starters complete a hunt with a single reward and resume", () => {
  for (const id of ["naruto", "sasuke", "sakura"] as const) {
    const save = fresh(id),
      hunt = new Hunt(save, () => 0.1);
    assert.equal(hunt.encounter(), true);
    assert.equal(hunt.encounter(), false);
    for (let i = 0; i < 200; i++) hunt.tick(100);
    assert.equal(save.kills, 1);
    assert.equal(hunt.phase, "explorando");
    assert.ok(save.xp > 0);
    assert.ok(save.inventory.fragmento > 0);
  }
});
test("pause freezes combat and resumes without duplicating encounters", () => {
  const s = fresh("sasuke"),
    h = new Hunt(s);
  h.encounter();
  s.paused = true;
  for (let i = 0; i < 200; i++) h.tick(100);
  assert.equal(h.phase, "iniciando combate");
  assert.equal(s.kills, 0);
  s.paused = false;
  for (let i = 0; i < 200; i++) h.tick(100);
  assert.equal(s.kills, 1);
});
test("defeat recovers and retains inventory", () => {
  const s = fresh("sakura");
  s.area = 1;
  s.inventory.fragmento = 3;
  const h = new Hunt(s);
  h.hp = 1;
  h.encounter();
  for (let i = 0; i < 25; i++) h.tick(100);
  assert.equal(h.phase, "derrota");
  assert.equal(s.defeats, 1);
  assert.equal(s.inventory.fragmento, 3);
  for (let i = 0; i < 40; i++) h.tick(100);
  assert.equal(h.phase, "explorando");
  assert.equal(h.hp, stats(s).maxHp);
});
test("invalid saves and future dates do not create offline rewards", () => {
  assert.equal(restore({ read: () => "{bad", write: () => {} }), null);
  const s = fresh("naruto", 20000);
  let raw = JSON.stringify(s);
  const r = restore(
    {
      read: () => raw,
      write: (v) => {
        raw = v;
      },
    },
    1000,
  )!;
  assert.equal(r.offline.xp, 0);
  assert.equal(r.save.xp, 0);
});

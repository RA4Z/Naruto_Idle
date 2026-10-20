import test from "node:test";
import assert from "node:assert/strict";
import { filterEntities } from "../src/entities/catalog.ts";
import type { EntitySummary } from "../src/entities/types.ts";
import { fresh, restore } from "../src/model.ts";
import { isWalkable } from "../src/navigation.ts";
const entries: EntitySummary[] = [
  {
    id: "11000101",
    slug: "naruto-kid",
    name: "Naruto Kid",
    aliases: ["Naruto Uzumaki"],
    identity: "visually-verified",
    hostile: false,
    status: "ready",
    capabilities: { npc: true, enemy: true, companion: true },
  },
  {
    id: "11900708",
    slug: "11900708",
    name: "Teuchi",
    identity: "source-config",
    hostile: false,
    status: "ready",
    capabilities: { npc: true },
  },
  {
    id: "19010000",
    slug: "19010000",
    name: "Ninja Adversário",
    identity: "source-config",
    hostile: true,
    status: "partial",
    capabilities: { enemy: true },
  },
];
test("catalogue searches source names, aliases, accents and stable resource IDs by capability", () => {
  assert.equal(filterEntities(entries, "UZUMAKI", "all")[0].id, "11000101");
  assert.equal(
    filterEntities(entries, "adversario", "enemy")[0].id,
    "19010000",
  );
  assert.equal(filterEntities(entries, "11900708", "npc")[0].name, "Teuchi");
  assert.equal(filterEntities(entries, "Teuchi", "companion").length, 0);
});
test("old saves remain valid; entity and audio preferences persist and malformed values are rejected", () => {
  const save = fresh("naruto");
  const store = { read: () => JSON.stringify(save), write: () => {} };
  assert.ok(restore(store));
  Object.assign(save, {
    enemyId: "11000701",
    companionId: "11001201",
    npcIds: ["11900708"],
    soundVolume: 0.3,
    music: true,
  });
  assert.equal(restore(store)?.save.enemyId, "11000701");
  for (const invalid of [
    { npcIds: ["../escape"] },
    { soundVolume: 2 },
    { music: "yes" },
    { enemyId: "<img>" },
  ]) {
    const bad = { ...save, ...invalid };
    assert.equal(
      restore({ read: () => JSON.stringify(bad), write: () => {} }),
      null,
    );
  }
});
test("all authored NPC slots keep their feet inside the audited street", () => {
  for (const p of [
    { x: 385, y: 240 },
    { x: 465, y: 294 },
    { x: 595, y: 365 },
  ])
    assert.ok(isWalkable(p), JSON.stringify(p));
});

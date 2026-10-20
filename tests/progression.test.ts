import test from "node:test";
import assert from "node:assert/strict";
import { fresh, stats, Hunt, restore, addXp } from "../src/model.ts";
import {
  buyItem,
  equipItem,
  claimQuest,
  recruit,
} from "../src/progression/rules.ts";
test("shop purchases and equipment change actual combat attributes without duplicate purchases", () => {
  const s = fresh("naruto");
  s.coins = 200;
  const base = stats(s);
  buyItem(s, "kunai-treino");
  equipItem(s, "kunai-treino");
  assert.equal(s.coins, 155);
  assert.equal(stats(s).attack, base.attack + 3);
  assert.throws(() => buyItem(s, "kunai-treino"));
  assert.equal(s.coins, 155);
  buyItem(s, "amuleto-chakra");
  equipItem(s, "amuleto-chakra");
  assert.equal(stats(s).maxChakra, 125);
  assert.equal(stats(s).chakraRegen, 6.5);
  assert.ok(restore({ read: () => JSON.stringify(s), write: () => {} }));
});
test("quest rewards can be claimed only once and only after the objective", () => {
  const s = fresh("sakura");
  assert.throws(() => claimQuest(s, "first-victory"));
  s.kills = 1;
  const reward = claimQuest(s, "first-victory");
  addXp(s, reward.xp);
  assert.equal(s.coins, 40);
  assert.equal(s.xp, 30);
  assert.throws(() => claimQuest(s, "first-victory"));
  assert.equal(s.coins, 40);
});
test("recruitment spends the displayed resources once and keeps collection separate from active party", () => {
  const s = fresh("sasuke");
  s.coins = 60;
  s.inventory.fragmento = 3;
  recruit(s, "11001201");
  assert.equal(s.coins, 0);
  assert.equal(s.inventory.fragmento, 0);
  assert.ok(s.collection?.includes("11001201"));
  assert.deepEqual(s.partyIds, []);
  assert.throws(() => recruit(s, "11001201"));
});
test("chakra limits jutsus, cooldown prevents repeated casts and pause freezes regeneration", () => {
  const s = fresh("naruto"),
    h = new Hunt(s);
  h.encounter();
  for (let i = 0; i < 5; i++) h.tick(200);
  assert.equal(h.phase, "combatendo");
  h.enemyHp = 1000;
  const before = h.chakra;
  assert.equal(h.castSkill(), true);
  assert.equal(h.chakra, before - 35);
  assert.equal(h.castSkill(), false);
  h.chakra = 0;
  h.skillCooldown = 0;
  assert.equal(h.castSkill(), false);
  h.tick(200);
  assert.ok(h.chakra > 0);
  const paused = h.chakra;
  s.paused = true;
  h.tick(200);
  assert.equal(h.chakra, paused);
});
test("save validation rejects unknown equipment, duplicate quest claims and malformed collection", () => {
  for (const extra of [
    { equipment: { weapon: "unknown" } },
    { questClaims: ["first-victory", "first-victory"] },
    { collection: ["../bad"] },
  ])
    assert.equal(
      restore({
        read: () => JSON.stringify({ ...fresh("naruto"), ...extra }),
        write: () => {},
      }),
      null,
    );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fresh, stats, Hunt, reward, restore } from "../src/model.ts";
import { selectCharacter } from "../src/progression/character-progress.ts";
import {
  recruitProfile,
  RECRUIT_STYLES,
} from "../src/progression/recruit-profiles.ts";
import { ITEMS, buyItem, equipItem } from "../src/progression/rules.ts";
import { enemyProfile } from "../src/world/enemy-profiles.ts";
import { compareEquipment } from "../src/progression/equipment-comparison.ts";
import { validateArenaLoadout } from "../src/progression/combat-stats.ts";

const recruit = (id: string, level = 1) => {
  const s = fresh("naruto");
  s.collection!.push(id);
  selectCharacter(s, id);
  s.level = level;
  return s;
};
test("every currently playable recruit has an explicit family profile; cosmetic variants keep the same kit", () => {
  const runtime = JSON.parse(
    readFileSync(
      new URL("../public/assets/catalog/runtime.json", import.meta.url),
      "utf8",
    ),
  );
  const eligible = Object.entries(runtime.entities).filter(
    ([, value]: any) =>
      value.collection === "playable" &&
      value.capabilities.companion &&
      value.capabilities.enemy,
  );
  assert.equal(eligible.length, 312);
  for (const [id] of eligible)
    assert.equal(recruitProfile(id).configured, true, id);
  assert.deepEqual(recruitProfile("11001201"), recruitProfile("11001271"));
  assert.equal(Object.keys(RECRUIT_STYLES).length, 8);
  const lee = stats(recruit("11000411")),
    gaara = stats(recruit("11001301"));
  assert.ok(lee.attack > gaara.attack && lee.interval < gaara.interval);
  assert.ok(gaara.maxHp > lee.maxHp && gaara.defense > lee.defense);
  assert.equal(stats(recruit("11000801")).skillCost, 28);
  for (const id of [
    "11000411",
    "11001301",
    "11000801",
    "11002001",
    "11004901",
  ]) {
    const first = stats(recruit(id)),
      grown = stats(recruit(id, 12));
    assert.ok(
      grown.maxHp > first.maxHp && grown.skillDamage > first.skillDamage,
    );
    assert.ok(Object.values(grown.attributes).every(Number.isFinite));
  }
});

test("recruit techniques consume their own chakra cost, heal/guard appropriately and never emit a starter jutsu", () => {
  for (const id of ["11000411", "11001201", "11002001", "11000801"]) {
    const s = recruit(id),
      h = new Hunt(s),
      events: string[] = [];
    h.onEvent = (event) => events.push(event);
    h.encounter();
    h.phase = "combatendo";
    h.enemyHp = 10000;
    h.hp = 30;
    const chakra = h.chakra;
    assert.equal(h.castSkill(), true);
    assert.equal(h.chakra, chakra - stats(s).skillCost);
    assert.equal(events.includes("technique"), true);
    assert.equal(events.includes("skill"), false);
    assert.equal(h.castSkill(), false);
    if (id === "11001201") assert.equal(h.guard, 0.35);
    if (id === "11002001") assert.ok(h.hp > 30);
    s.paused = true;
    const before = [h.hp, h.enemyHp, h.chakra];
    h.tick(200);
    assert.deepEqual([h.hp, h.enemyHp, h.chakra], before);
  }
});

test("enemy armor distinguishes physical attacks from ninjutsu and healer actions stay capped", () => {
  const s = fresh("sasuke"),
    h = new Hunt(s),
    st = stats(s);
  h.encounter(enemyProfile("19001001"));
  h.phase = "combatendo";
  h.enemyHp = 10000;
  const before = h.enemyHp;
  h.castSkill();
  assert.equal(before - h.enemyHp, Math.round((st.skillDamage * 100) / 105));
  h.skillCooldown = 0;
  h.attacks = 0;
  h.playerClock = st.interval - 10;
  const prior = h.enemyHp;
  h.tick(10);
  assert.equal(prior - h.enemyHp, Math.round((st.attack * 100) / 128));
  const healer = new Hunt(fresh("naruto"));
  healer.encounter(enemyProfile("19004301"));
  healer.phase = "combatendo";
  healer.enemyHp = healer.enemyMax - 1;
  healer.enemyAttacks = 2;
  healer.enemyClock = healer.enemy.interval - 10;
  healer.playerClock = -10000;
  const hp = healer.hp;
  healer.tick(10);
  assert.equal(healer.enemyWindup, true);
  assert.equal(healer.enemyHp, healer.enemyMax - 1);
  healer.tick(250);
  healer.tick(50);
  assert.equal(healer.enemyHp, healer.enemyMax);
  assert.equal(healer.hp, hp);
  assert.equal(healer.enemyHealsLeft, 2);
  healer.enemyHealsLeft = 0;
  healer.enemyHp = healer.enemyMax - 5;
  healer.enemyAttacks = 5;
  healer.enemyClock = healer.enemy.interval - 10;
  healer.tick(10);
  healer.tick(250);
  healer.tick(50);
  assert.equal(healer.enemyHp, healer.enemyMax - 5);
  assert.ok(healer.hp < hp);
});

test("enemy specials are telegraphed and elites have proportionate rewards without duplicate claims", () => {
  const normal = enemyProfile("19000901"),
    elite = enemyProfile("19000901", true);
  assert.ok(
    elite.hp > normal.hp &&
      elite.defense > normal.defense &&
      elite.interval < normal.interval,
  );
  const h = new Hunt(fresh("naruto"));
  h.encounter(normal);
  h.phase = "combatendo";
  h.enemyAttacks = 2;
  h.playerClock = -10000;
  h.enemyClock = normal.interval - 300;
  const events: string[] = [];
  h.onEvent = (event) => events.push(event);
  h.tick(10);
  assert.equal(events.includes("enemy-windup"), true);
  for (let i = 0; i < 30; i++) h.tick(10);
  assert.equal(events.includes("enemy-special"), true);
  const s = fresh("naruto");
  s.level = 5;
  s.area = 1;
  const result = reward(s, () => 0, elite);
  assert.equal(result.xp, Math.round(48 * elite.xp));
  assert.equal(result.coins, Math.round(19 * elite.coins));
  assert.ok(result.equipment);
  const easy = fresh("naruto");
  easy.level = 25;
  const easyDrop = reward(easy, () => 0, elite);
  assert.equal(ITEMS.find((item) => item.id === easyDrop.equipment)!.tier, 1);
  assert.equal(ITEMS.find((i) => i.id === result.equipment)!.tier, 2);
  const battle = new Hunt(fresh("naruto"), () => 0.99);
  battle.encounter(elite);
  battle.phase = "combatendo";
  battle.enemyHp = 0;
  battle.tick(10);
  const coins = battle.save.coins;
  for (let i = 0; i < 20; i++) battle.tick(100);
  assert.equal(battle.save.coins, coins);
  assert.equal(battle.save.kills, 1);
});

test("equipment paths trade damage, health and chakra; tiers unlock per character and remain save-compatible", () => {
  assert.equal(ITEMS.length, 28);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, 28);
  const s = fresh("naruto");
  s.coins = 10000;
  s.level = 4;
  assert.throws(() => buyItem(s, "lamina-assalto-2"));
  assert.equal(s.coins, 10000);
  s.level = 5;
  buyItem(s, "lamina-assalto-2");
  equipItem(s, "lamina-assalto-2");
  const attack = stats(s);
  buyItem(s, "bastao-guardiao-2");
  equipItem(s, "bastao-guardiao-2");
  const tank = stats(s);
  assert.ok(
    attack.attack > tank.attack &&
      tank.maxHp > attack.maxHp &&
      tank.defense > attack.defense,
  );
  buyItem(s, "selo-canalizador-2");
  equipItem(s, "selo-canalizador-2");
  const chakra = stats(s);
  assert.ok(
    chakra.skillDamage > attack.skillDamage &&
      chakra.maxChakra > attack.maxChakra,
  );
  const before = JSON.stringify(s);
  const preview = compareEquipment(s, "lamina-assalto-3");
  assert.ok(preview.attack > 0 && preview.hp < 0);
  assert.equal(JSON.stringify(s), before);
  assert.ok(restore({ read: () => before, write: () => {} }));
  s.collection!.push("11001201");
  selectCharacter(s, "11001201");
  assert.throws(() => equipItem(s, "lamina-assalto-2"));
  assert.throws(() =>
    validateArenaLoadout({
      level: 1,
      upgrades: 0,
      equipment: { weapon: "lamina-assalto-2" },
    }),
  );
  assert.ok(
    validateArenaLoadout({
      level: 5,
      upgrades: 0,
      equipment: { weapon: "lamina-assalto-2" },
    }),
  );
});

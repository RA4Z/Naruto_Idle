import test from "node:test";
import assert from "node:assert/strict";
import { fresh, stats, restore } from "../src/model.ts";
import {
  EQUIPMENT_SLOTS,
  ITEMS,
  buyItem,
  equipItem,
  unequipItem,
} from "../src/progression/rules.ts";
import {
  characterProgress,
  activeCharacterId,
  syncCharacterProgress,
} from "../src/progression/character-progress.ts";
import { compareEquipment } from "../src/progression/equipment-comparison.ts";
import {
  savePreset,
  applyPreset,
} from "../src/progression/equipment-presets.ts";
import { cloudSnapshot } from "../src/cloud/snapshot.ts";
import { validateArenaLoadout } from "../src/progression/combat-stats.ts";

test("five real slots affect only the selected character and roundtrip cloud/restore", () => {
  const s = fresh("naruto", 1000);
  s.coins = 20000;
  s.level = 12;
  syncCharacterProgress(s);
  characterProgress(s, "11000211").level = 5;
  const activeBefore = stats(s),
    hero = activeCharacterId(s);
  for (const id of [
    "headband-shinobi-2",
    "scroll-shinobi-2",
    "kunai-treino",
    "colete-shinobi",
    "amuleto-chakra",
  ]) {
    buyItem(s, id, "11000211");
    equipItem(s, id, "11000211");
  }
  const p = characterProgress(s, "11000211");
  assert.deepEqual(
    Object.keys(p.equipment).sort(),
    [...EQUIPMENT_SLOTS].sort(),
  );
  assert.equal(activeCharacterId(s), hero);
  assert.deepEqual(stats(s), activeBefore);
  assert.ok(stats(s, "11000211").maxHp > 112);
  assert.ok(
    stats(s, "11000211").skillDamage > stats(fresh("sasuke", 1000)).skillDamage,
  );
  assert.deepEqual(
    cloudSnapshot(s).characterProgress!["11000211"].equipment,
    p.equipment,
  );
  const loaded = restore(
    { read: () => JSON.stringify(s), write() {} },
    1000,
  )!.save;
  assert.deepEqual(
    characterProgress(loaded, "11000211").equipment,
    p.equipment,
  );
  assert.deepEqual(
    validateArenaLoadout({ level: 5, upgrades: 0, equipment: p.equipment })
      .equipment,
    p.equipment,
  );
  const before = JSON.stringify(s);
  const delta = compareEquipment(s, "scroll-shinobi-1", "11000211");
  assert.ok(delta.skillDamage < 0);
  assert.equal(JSON.stringify(s), before);
  unequipItem(s, "headband", "11000211");
  assert.equal(p.equipment.headband, undefined);
  assert.deepEqual(stats(s), activeBefore);
});

test("selected level, ownership and combat gates reject changes without spending or modifying gear", () => {
  const s = fresh("naruto");
  s.level = 12;
  s.coins = 10000;
  assert.throws(() => buyItem(s, "headband-shinobi-2", "11000211"));
  buyItem(s, "headband-shinobi-3");
  const before = JSON.stringify(s);
  assert.throws(() => equipItem(s, "headband-shinobi-3", "11000211"));
  assert.throws(() => equipItem(s, "headband-shinobi-3", "11000101", false));
  assert.throws(() => unequipItem(s, "headband", "11000101", false));
  assert.throws(() => equipItem(s, "headband-shinobi-3", "11000201"));
  assert.throws(() => equipItem(s, "missing"));
  assert.equal(JSON.stringify(s), before);
});

test("presets save, apply and clear all five slots with legacy items preserved", () => {
  const s = fresh("naruto");
  s.coins = 10000;
  for (const id of [
    "headband-shinobi-1",
    "scroll-shinobi-1",
    "kunai-treino",
    "colete-shinobi",
    "amuleto-chakra",
  ]) {
    buyItem(s, id);
    equipItem(s, id);
  }
  savePreset(s, "damage");
  const expected = { ...s.equipment };
  for (const slot of EQUIPMENT_SLOTS) unequipItem(s, slot);
  assert.deepEqual(s.equipment, {});
  applyPreset(s, "damage", true);
  assert.deepEqual(s.equipment, expected);
  assert.equal(ITEMS.length, 28);
});

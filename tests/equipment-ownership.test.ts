import test from "node:test";
import assert from "node:assert/strict";
import { fresh, restore, reward } from "../src/model.ts";
import {
  buyItem,
  equipItem,
  unequipItem,
  replaceEquipment,
  validateEquipmentReplacement,
} from "../src/progression/rules.ts";
import { equipmentCopies } from "../src/progression/equipment-ownership.ts";
import {
  selectCharacter,
  characterProgress,
  syncCharacterProgress,
} from "../src/progression/character-progress.ts";
import {
  savePreset,
  applyPreset,
} from "../src/progression/equipment-presets.ts";
import { cloudSnapshot } from "../src/cloud/snapshot.ts";
import { enemyProfile } from "../src/world/enemy-profiles.ts";
import { equipmentCatalog } from "../src/progression/equipment-catalog.ts";

const naruto = "11000101",
  sasuke = "11000211",
  sakura = "11000301";
const item = "kunai-treino";

test("replacing equipment moves the chosen copy into an empty slot and atomically swaps occupied slots", () => {
  for (const active of ["naruto", "sasuke", "sakura"] as const) {
    const s = fresh(active, 1000);
    s.coins = 1000;
    buyItem(s, item);
    buyItem(s, "kunai-reforcada");
    buyItem(s, "colete-shinobi");
    equipItem(s, item, naruto);
    equipItem(s, "colete-shinobi", naruto);
    const inventory = { ...s.inventory },
      coins = s.coins;
    replaceEquipment(s, item, naruto, sasuke);
    assert.equal(characterProgress(s, naruto).equipment.weapon, undefined);
    assert.equal(characterProgress(s, sasuke).equipment.weapon, item);
    equipItem(s, "kunai-reforcada", naruto);
    replaceEquipment(s, item, sasuke, naruto);
    assert.equal(characterProgress(s, naruto).equipment.weapon, item);
    assert.equal(
      characterProgress(s, sasuke).equipment.weapon,
      "kunai-reforcada",
    );
    assert.equal(
      characterProgress(s, naruto).equipment.armor,
      "colete-shinobi",
    );
    assert.deepEqual(characterProgress(s, sakura).equipment, {});
    assert.deepEqual(s.equipment, characterProgress(s).equipment);
    assert.deepEqual(s.inventory, inventory);
    assert.equal(s.coins, coins);
    assert.equal(equipmentCopies(s, item).used, 1);
    assert.deepEqual(cloudSnapshot(s).characterProgress, s.characterProgress);
  }
});

test("replacement validation blocks combat, stale owners and unmet requirements without partial mutations", () => {
  const s = fresh("naruto");
  s.coins = 10000;
  syncCharacterProgress(s);
  characterProgress(s, sasuke).level = 12;
  buyItem(s, item);
  buyItem(s, "lamina-assalto-3", sasuke);
  equipItem(s, item, naruto);
  equipItem(s, "lamina-assalto-3", sasuke);
  const before = JSON.stringify(s);
  assert.throws(() => replaceEquipment(s, item, naruto, sasuke), /12/);
  assert.throws(() => replaceEquipment(s, item, naruto, sasuke, false));
  assert.throws(
    () => replaceEquipment(s, "lamina-assalto-3", sasuke, naruto),
    /12/,
  );
  assert.throws(() => replaceEquipment(s, item, sakura, sasuke));
  assert.throws(() => replaceEquipment(s, item, naruto, naruto));
  assert.throws(() => replaceEquipment(s, item, naruto, "missing"));
  assert.equal(JSON.stringify(s), before);
  const simple = fresh("naruto");
  simple.inventory[item] = 1;
  simple.equipment = { weapon: item };
  const legacy = JSON.stringify(simple);
  validateEquipmentReplacement(simple, item, naruto, sasuke);
  assert.equal(JSON.stringify(simple), legacy);
});

test("one copy cannot equip two characters; buying, replacing and unequipping release the right quantities", () => {
  const s = fresh("naruto", 1000);
  s.coins = 1000;
  buyItem(s, item);
  equipItem(s, item, sasuke);
  const before = JSON.stringify(s);
  assert.throws(() => equipItem(s, item, naruto));
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(equipmentCopies(s, item), {
    total: 1,
    used: 1,
    available: 0,
  });
  assert.equal(
    equipmentCatalog(s, naruto, { shop: false, availability: "usable" }).some(
      (i) => i.id === item,
    ),
    false,
  );
  assert.equal(
    equipmentCatalog(s, sasuke, { shop: false, availability: "usable" }).some(
      (i) => i.id === item,
    ),
    true,
  );
  equipItem(s, item, sasuke); // Re-equipping its own copy is idempotent.
  buyItem(s, item);
  equipItem(s, item, naruto);
  assert.equal(equipmentCopies(s, item).used, 2);
  assert.throws(() => equipItem(s, item, sakura));
  buyItem(s, "kunai-reforcada");
  equipItem(s, "kunai-reforcada", sasuke);
  equipItem(s, item, sakura);
  unequipItem(s, "weapon", naruto);
  assert.deepEqual(equipmentCopies(s, item), {
    total: 2,
    used: 1,
    available: 1,
  });
  selectCharacter(s, sasuke);
  assert.deepEqual(equipmentCopies(s, item), {
    total: 2,
    used: 1,
    available: 1,
  });
  const saved = cloudSnapshot(s);
  assert.equal(saved.inventory[item], 2);
  assert.deepEqual(saved.characterProgress, s.characterProgress);
});

test("presets reserve nothing and fail atomically when another character occupies the copy", () => {
  const s = fresh("naruto");
  s.coins = 1000;
  buyItem(s, item);
  equipItem(s, item);
  savePreset(s, "damage");
  unequipItem(s, "weapon");
  equipItem(s, item, sasuke);
  buyItem(s, "colete-shinobi");
  equipItem(s, "colete-shinobi");
  const before = JSON.stringify(s);
  assert.throws(() => applyPreset(s, "damage", true));
  assert.equal(JSON.stringify(s), before);
  unequipItem(s, "weapon", sasuke);
  applyPreset(s, "damage", true);
  assert.deepEqual(s.equipment, { weapon: item });
});

test("legacy duplicated equipment repairs deterministically on local and cloud restore, retaining active character and total copies", () => {
  for (const count of [1, 2]) {
    const s = fresh("sasuke", 1000);
    s.inventory[item] = count;
    s.equipment = { weapon: item };
    syncCharacterProgress(s);
    characterProgress(s, naruto).equipment.weapon = item;
    characterProgress(s, sakura).equipment.weapon = item;
    const legacy = JSON.stringify(s);
    const local = restore({ read: () => legacy, write() {} }, 1000)!.save;
    const cloud = cloudSnapshot(JSON.parse(legacy));
    for (const loaded of [local, cloud]) {
      assert.equal(loaded.inventory[item], count);
      assert.equal(loaded.equipment?.weapon, item);
      assert.equal(loaded.characterProgress![sasuke].equipment.weapon, item);
      assert.equal(
        loaded.characterProgress![naruto].equipment.weapon,
        count === 2 ? item : undefined,
      );
      assert.equal(
        loaded.characterProgress![sakura].equipment.weapon,
        undefined,
      );
      assert.equal(equipmentCopies(loaded, item).used, count);
      assert.equal(loaded.coins, s.coins);
      assert.deepEqual(cloudSnapshot(loaded), loaded); // Repeat loading is stable.
    }
  }
});

test("equipment drops add copies instead of replacing the owned quantity", () => {
  const s = fresh("naruto");
  s.inventory[item] = 2;
  reward(s, () => 0, enemyProfile());
  assert.equal(s.inventory[item], 3);
});

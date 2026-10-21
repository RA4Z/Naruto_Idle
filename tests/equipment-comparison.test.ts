import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../src/model.ts";
import { compareEquipment } from "../src/progression/equipment-comparison.ts";
import { ITEMS } from "../src/progression/rules.ts";

test("shop comparisons simulate ownership, replace the same slot and never mutate progress", () => {
  const save = fresh("naruto");
  const before = structuredClone(save);
  const item = ITEMS[0];
  const delta = compareEquipment(save, item.id);
  assert.equal(delta.attack, item.attack);
  assert.equal(delta.hp, item.hp);
  assert.equal(delta.chakra, item.chakra);
  assert.deepEqual(save, before);
  save.inventory[item.id] = 1;
  save.equipment = { [item.slot]: item.id };
  assert.deepEqual(compareEquipment(save, item.id), {
    attack: 0,
    hp: 0,
    chakra: 0,
    regen: 0,
  });
  const stronger = ITEMS.find(
    (other) => other.slot === item.slot && other.attack > item.attack,
  );
  if (stronger)
    assert.equal(
      compareEquipment(save, stronger.id).attack,
      stronger.attack - item.attack,
    );
});

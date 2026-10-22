import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../src/model.ts";
import {
  equipmentCatalog,
  shopLevel,
  buyShopItem,
  equipmentCopyCards,
  equipmentCopyCard,
} from "../src/progression/equipment-catalog.ts";
import {
  activeCharacterId,
  characterProgress,
  selectCharacter,
  syncCharacterProgress,
} from "../src/progression/character-progress.ts";
import { ITEMS, equipItem, unequipItem } from "../src/progression/rules.ts";

test("arsenal cards represent each copy and its owner without double-counting the active projection", () => {
  const s = fresh("naruto");
  s.inventory = { "kunai-treino": 3 };
  equipItem(s, "kunai-treino");
  equipItem(s, "kunai-treino", "11000211");
  const item = ITEMS.find((i) => i.id === "kunai-treino")!;
  const page = equipmentCopyCards(s, [item], "11000301");
  assert.equal(page.total, 3);
  assert.deepEqual(
    page.cards.map((c) => [c.key, c.owner]),
    [
      ["owner:11000101", "11000101"],
      ["owner:11000211", "11000211"],
      ["free:0", undefined],
    ],
  );
  assert.equal(equipmentCopyCard(s, item, "owner:11000211")?.owner, "11000211");
  assert.equal(equipmentCopyCard(s, item, "free:1"), undefined);
  assert.equal(equipmentCopyCard(s, item, "owner:missing"), undefined);
  selectCharacter(s, "11000211");
  assert.deepEqual(equipmentCopyCards(s, [item], "11000301"), page);
  assert.deepEqual(
    equipmentCopyCards(s, [item], "11000301", true).cards.map((c) => c.key),
    ["free:0"],
  );
  assert.deepEqual(
    equipmentCopyCards(s, [item], "11000101", true).cards.map((c) => c.key),
    ["owner:11000101", "free:0"],
  );
  unequipItem(s, "weapon");
  assert.equal(equipmentCopyCard(s, item, "owner:11000211"), undefined);
  assert.equal(
    equipmentCopyCards(s, [item], "11000301").cards.filter((c) => !c.owner)
      .length,
    2,
  );
});

test("large stacks count all copies while materializing only a bounded page", () => {
  const s = fresh("naruto");
  const item = ITEMS.find((i) => i.id === "kunai-treino")!;
  s.inventory[item.id] = 1000000;
  const first = equipmentCopyCards(s, [item], "11000101");
  const second = equipmentCopyCards(s, [item], "11000101", false, 120);
  assert.equal(first.total, 1000000);
  assert.equal(first.cards.length, 60);
  assert.equal(second.cards.length, 120);
  assert.deepEqual(second.cards.slice(0, 60), first.cards);
  assert.equal(second.cards[119].key, "free:119");
  assert.equal(equipmentCopyCard(s, item, "free:999999")?.key, "free:999999");
  assert.equal(equipmentCopyCard(s, item, "free:1000000"), undefined);
});

test("shop filters use collection level while character inventory filters use the selected level", () => {
  const s = fresh("naruto");
  s.level = 12;
  s.coins = 100;
  s.inventory = { "kunai-treino": 1 };
  const owned = equipmentCatalog(s, "11000211", { shop: false });
  assert.deepEqual(
    owned.map((i) => i.id),
    ["kunai-treino"],
  );
  const usable = equipmentCatalog(s, "11000211", {
    shop: true,
    availability: "usable",
  });
  assert.ok(usable.length > 0 && usable.some((i) => i.level === 12));
  assert.deepEqual(
    usable,
    equipmentCatalog(s, "11000301", { shop: true, availability: "usable" }),
  );
  const affordable = equipmentCatalog(s, "11000211", {
    shop: true,
    availability: "affordable",
  });
  assert.ok(
    affordable.length > 0 &&
      affordable.every((i) => i.price <= 100 && i.level === 1),
  );
  assert.equal(
    equipmentCatalog(s, "11000211", {
      shop: true,
      slot: "scroll",
      path: "damage",
    }).length,
    0,
  );
  const scrolls = equipmentCatalog(s, "11000211", {
    shop: true,
    slot: "scroll",
    path: "chakra",
    sort: "priceDescending",
  });
  assert.equal(scrolls.length, 3);
  assert.ok(scrolls.every((i) => i.slot === "scroll" && i.path === "chakra"));
  assert.ok(
    scrolls.every((i, n) => n === 0 || scrolls[n - 1].price >= i.price),
  );
  assert.throws(() => equipmentCatalog(s, "missing", { shop: false }));
});

test("shared shop unlocks and purchases never depend on the viewed or active character", () => {
  const s = fresh("naruto");
  s.coins = 5000;
  syncCharacterProgress(s);
  assert.equal(shopLevel(s), 1);
  assert.throws(() => buyShopItem(s, "headband-shinobi-3"));
  assert.equal(s.coins, 5000);
  characterProgress(s, "11000211").level = 12;
  assert.equal(shopLevel(s), 12);
  const expected = equipmentCatalog(s, "11000101", {
    shop: true,
    availability: "usable",
  }).map((i) => i.id);
  selectCharacter(s, "11000301");
  assert.deepEqual(
    equipmentCatalog(s, "11000301", { shop: true, availability: "usable" }).map(
      (i) => i.id,
    ),
    expected,
  );
  buyShopItem(s, "headband-shinobi-3");
  assert.equal(activeCharacterId(s), "11000301");
  assert.equal(s.level, 1);
  assert.deepEqual(s.equipment, {});
  assert.equal(s.inventory["headband-shinobi-3"], 1);
  assert.equal(s.coins, 4150);
  buyShopItem(s, "headband-shinobi-3");
  assert.equal(s.inventory["headband-shinobi-3"], 2);
  assert.equal(s.coins, 3300);
});

import test from "node:test";
import assert from "node:assert/strict";
import { fresh, restore, stats, reward, addXp } from "../src/model.ts";
import {
  CHARACTER_IDS as IDS,
  characterProgress,
  trainCharacter,
  characterLoadout,
  syncCharacterProgress,
  needed,
  addCharacterXp,
  selectCharacter,
  activeCharacterId,
} from "../src/progression/character-progress.ts";
import { recruit, equipItem } from "../src/progression/rules.ts";
import { validateArenaLoadout } from "../src/progression/combat-stats.ts";

test("legacy progress migrates only to the chosen protagonist and survives repeated restores", () => {
  const s = fresh("sasuke", 1000);
  delete s.characterProgress;
  s.level = 12;
  s.xp = 27;
  s.upgrades = 4;
  s.inventory = { "kunai-treino": 1 };
  s.equipment = { weapon: "kunai-treino" };
  s.collection!.push("11001201");
  let raw = JSON.stringify(s);
  const store = {
    read: () => raw,
    write: (v: string) => {
      raw = v;
    },
  };
  for (let i = 0; i < 3; i++) {
    const loaded = restore(store, 1000)!.save;
    assert.deepEqual(characterProgress(loaded), {
      level: 12,
      xp: 27,
      upgrades: 4,
      equipment: { weapon: "kunai-treino" },
    });
    for (const id of [IDS.naruto, IDS.sakura, "11001201"])
      assert.deepEqual(characterProgress(loaded, id), {
        level: 1,
        xp: 0,
        upgrades: 0,
        equipment: {},
      });
  }
});

test("level, training, gear and arena loadouts stay separate for each owned character", () => {
  const s = fresh("naruto"),
    protagonist = stats(s),
    sakura = stats(s, IDS.sakura);
  s.coins = 100;
  addCharacterXp(s, needed(1) + 9, IDS.sasuke);
  trainCharacter(s, IDS.sasuke);
  assert.equal(s.level, 1);
  assert.equal(s.xp, 0);
  assert.equal(s.upgrades, 0);
  assert.deepEqual(stats(s), protagonist);
  assert.deepEqual(stats(s, IDS.sakura), sakura);
  assert.equal(characterProgress(s, IDS.sasuke).level, 2);
  assert.equal(characterProgress(s, IDS.sasuke).xp, 9);
  assert.ok(stats(s, IDS.sasuke).moveSpeed > 120);
  s.inventory["kunai-treino"] = 1;
  equipItem(s, "kunai-treino");
  assert.equal(stats(s).attack, protagonist.attack + 3);
  assert.deepEqual(characterLoadout(s, "sasuke"), {
    level: 2,
    upgrades: 1,
    equipment: {},
  });
  assert.deepEqual(characterLoadout(s, "naruto"), {
    level: 1,
    upgrades: 0,
    equipment: { weapon: "kunai-treino" },
  });
  assert.deepEqual(stats(s, IDS.sakura), sakura);
  const loaded = restore({ read: () => JSON.stringify(s), write() {} })!.save;
  assert.deepEqual(
    characterLoadout(loaded, "sasuke"),
    characterLoadout(s, "sasuke"),
  );
  s.coins = 0;
  assert.throws(() => trainCharacter(s, IDS.sasuke));
  assert.equal(characterProgress(s, IDS.sasuke).upgrades, 1);
  assert.throws(() => trainCharacter(s, "11001201"));
});

test("victories award XP only to the active character even with legacy party IDs", () => {
  const s = fresh("naruto");
  s.partyIds = [IDS.sasuke, IDS.naruto, IDS.sasuke, "11001201"];
  reward(s, () => 1);
  assert.ok(s.xp > 0);
  assert.equal(characterProgress(s, IDS.sasuke).xp, 0);
  assert.equal(characterProgress(s, IDS.sakura).xp, 0);
  const partyXp = characterProgress(s, IDS.sasuke).xp;
  addXp(s, 10);
  assert.equal(characterProgress(s, IDS.sasuke).xp, partyXp);
  assert.ok(s.xp > 10);
});

test("offline XP belongs only to the active character and cannot be claimed twice", () => {
  const s = fresh("sakura", 1000);
  s.partyIds = [IDS.naruto];
  s.location = "10005";
  s.autoHunt = true;
  let raw = JSON.stringify(s);
  const store = {
    read: () => raw,
    write: (v: string) => {
      raw = v;
    },
  };
  const loaded = restore(store, 121000)!;
  assert.ok(loaded.offline.xp > 0);
  assert.equal(characterProgress(loaded.save, IDS.naruto).xp, 0);
  assert.equal(characterProgress(loaded.save, IDS.sasuke).xp, 0);
  assert.equal(restore(store, 121000)!.offline.xp, 0);
});

test("switching restores each owned model's level, training and gear without sharing XP", () => {
  const s = fresh("naruto", 1000);
  s.level = 8;
  s.xp = 17;
  s.upgrades = 3;
  s.inventory["kunai-treino"] = 1;
  s.equipment = { weapon: "kunai-treino" };
  s.partyIds = [IDS.sakura];
  selectCharacter(s, IDS.sasuke);
  assert.equal(s.character, "sasuke");
  assert.equal(s.level, 1);
  assert.deepEqual(s.partyIds, []);
  assert.deepEqual(s.equipment, {});
  addXp(s, 91);
  selectCharacter(s, IDS.naruto);
  assert.equal(s.level, 8);
  assert.equal(s.xp, 17);
  assert.equal(s.upgrades, 3);
  assert.deepEqual(s.equipment, { weapon: "kunai-treino" });
  const loaded = restore(
    { read: () => JSON.stringify(s), write() {} },
    1000,
  )!.save;
  selectCharacter(loaded, IDS.sasuke);
  assert.equal(loaded.level, 2);
  assert.equal(loaded.xp, 11);
  assert.throws(() => selectCharacter(loaded, "11001201"));
  loaded.collection!.push("11000201");
  assert.throws(() => selectCharacter(loaded, "11000201"));
});

test("legacy black outfit migrates to blue Sasuke while retaining the archived record", () => {
  const s = fresh("sasuke", 1000);
  delete s.activeEntityId;
  delete s.characterProgress;
  s.collection = [IDS.naruto, "11000201", IDS.sakura];
  s.level = 9;
  s.xp = 22;
  s.upgrades = 4;
  const loaded = restore(
    { read: () => JSON.stringify(s), write() {} },
    1000,
  )!.save;
  assert.equal(activeCharacterId(loaded), "11000211");
  assert.equal(loaded.level, 9);
  assert.equal(loaded.xp, 22);
  assert.equal(characterProgress(loaded, "11000201").level, 9);
  assert.equal(characterProgress(loaded, IDS.sasuke).upgrades, 4);
});

test("recruited models can be active and use their own balanced profiles without inheriting starter jutsus", () => {
  const s = fresh("sakura", 1000);
  s.coins = 60;
  s.inventory.fragmento = 3;
  recruit(s, "11001201");
  selectCharacter(s, "11001201");
  assert.equal(activeCharacterId(s), "11001201");
  assert.equal(stats(s).maxHp, 142);
  const loaded = restore(
    { read: () => JSON.stringify(s), write() {} },
    1000,
  )!.save;
  assert.equal(activeCharacterId(loaded), "11001201");
});

test("new recruits start at level one even when the protagonist is highly developed", () => {
  const s = fresh("naruto");
  s.level = 30;
  s.upgrades = 10;
  s.coins = 60;
  s.inventory.fragmento = 3;
  recruit(s, "11001201");
  assert.deepEqual(characterProgress(s, "11001201"), {
    level: 1,
    xp: 0,
    upgrades: 0,
    equipment: {},
  });
  assert.equal(stats(s, "11001201").maxHp, 142);
  assert.ok(stats(s).maxHp > stats(s, "11001201").maxHp);
});

test("invalid individual progress is rejected while character levels can grow beyond 100", () => {
  for (const extra of [
    { level: 0 },
    { level: 1.5 },
    { xp: -1 },
    { upgrades: 10001 },
    { equipment: { weapon: "unknown" } },
  ]) {
    const s = fresh("naruto");
    Object.assign(s.characterProgress![IDS.sasuke], extra);
    assert.equal(restore({ read: () => JSON.stringify(s), write() {} }), null);
  }
  const s = fresh("naruto");
  const p = characterProgress(s, IDS.sasuke);
  p.level = 100;
  p.xp = needed(100) - 1;
  addCharacterXp(s, 1, IDS.sasuke);
  assert.equal(p.level, 101);
  assert.equal(p.xp, 0);
  addCharacterXp(s, 10000, IDS.sasuke);
  assert.equal(p.xp, 10000);
  syncCharacterProgress(s);
  assert.equal(s.characterProgress![IDS.naruto].level, 1);
});

test("arena fighters outside the collection receive a valid base loadout without borrowing the hero's level", () => {
  const s = fresh("naruto");
  s.collection = [IDS.naruto];
  delete s.characterProgress;
  s.level = 25;
  const loadout = characterLoadout(s, "sakura");
  assert.deepEqual(validateArenaLoadout(loadout), {
    level: 1,
    upgrades: 0,
    equipment: {},
  });
  assert.deepEqual(s.collection, [IDS.naruto]);
});

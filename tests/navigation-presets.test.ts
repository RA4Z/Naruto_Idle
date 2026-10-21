import test from "node:test";
import assert from "node:assert/strict";
import { fresh, restore, stats, Hunt } from "../src/model.ts";
import {
  savePreset,
  applyPreset,
  comparePreset,
  presetEquipment,
} from "../src/progression/equipment-presets.ts";
import { selectCharacter } from "../src/progression/character-progress.ts";
import { ITEMS } from "../src/progression/rules.ts";
import { strikeDuration } from "../src/progression/combat-stats.ts";
import { mapProjection } from "../src/world/map-projection.ts";
import { cloudSnapshot } from "../src/cloud/snapshot.ts";
import { readFileSync } from "node:fs";

test("equipment sets copy every slot, stay per character and survive restoring", () => {
  const s = fresh("naruto", 1000);
  s.inventory = { "kunai-treino": 1, "colete-shinobi": 1 };
  s.equipment = { weapon: "kunai-treino" };
  savePreset(s, "damage");
  s.equipment.armor = "colete-shinobi";
  assert.deepEqual(presetEquipment(s, "damage"), { weapon: "kunai-treino" });
  const before = JSON.stringify(s),
    delta = comparePreset(s, "damage")!;
  assert.equal(delta.hp, -28);
  assert.equal(JSON.stringify(s), before);
  applyPreset(s, "damage", true);
  assert.deepEqual(s.equipment, { weapon: "kunai-treino" });
  selectCharacter(s, "11000211");
  assert.equal(presetEquipment(s, "damage"), undefined);
  savePreset(s, "survival");
  selectCharacter(s, "11000101");
  const loaded = restore(
    { read: () => JSON.stringify(s), write() {} },
    1000,
  )!.save;
  assert.deepEqual(loaded.equipmentPresets, s.equipmentPresets);
  assert.deepEqual(cloudSnapshot(s).equipmentPresets, s.equipmentPresets);
  assert.deepEqual(presetEquipment(loaded, "damage"), {
    weapon: "kunai-treino",
  });
  savePreset(loaded, "chakra");
  loaded.equipment = { armor: "colete-shinobi" };
  applyPreset(loaded, "chakra", true);
  assert.deepEqual(loaded.equipment, { weapon: "kunai-treino" });
});

test("set validation is atomic, respects ownership, required level and combat blocks", () => {
  const s = fresh("naruto");
  s.inventory = { "kunai-treino": 1 };
  s.equipment = { weapon: "kunai-treino" };
  savePreset(s, "damage");
  s.equipmentPresets!["11000101"].damage!.armor = "colete-shinobi";
  const before = JSON.stringify(s);
  assert.throws(() => applyPreset(s, "damage", true));
  assert.equal(JSON.stringify(s), before);
  s.inventory["colete-shinobi"] = 1;
  assert.throws(() => applyPreset(s, "damage", false));
  assert.deepEqual(s.equipment, { weapon: "kunai-treino" });
  const high = ITEMS.find((i) => i.level > 1)!;
  s.inventory[high.id] = 1;
  s.equipmentPresets!["11000101"].damage = { [high.slot]: high.id };
  assert.throws(() => applyPreset(s, "damage", true));
  assert.deepEqual(s.equipment, { weapon: "kunai-treino" });
  s.equipmentPresets!["11000101"].survival = {};
  applyPreset(s, "survival", true);
  assert.deepEqual(s.equipment, {});
});

test("restore rejects malformed set data without discarding valid legacy saves", () => {
  const s = fresh("sasuke", 1000),
    load = (extra: unknown) =>
      restore(
        {
          read: () => JSON.stringify({ ...s, equipmentPresets: extra }),
          write() {},
        },
        1000,
      );
  assert.ok(restore({ read: () => JSON.stringify(s), write() {} }, 1000));
  for (const bad of [
    [],
    null,
    { unknown: {} },
    { "11000211": { oops: {} } },
    { "11000211": { damage: { weapon: "colete-shinobi" } } },
    { "11000211": { damage: { extra: "kunai-treino" } } },
  ])
    assert.equal(load(bad), null);
});

for (const special of [false, true])
  for (const fast of [false, true])
    test(`victory waits for the final ${special ? "skill" : "attack"}, resumes promptly and rewards once (${fast ? "fast" : "normal"})`, () => {
      const s = fresh("sasuke");
      if (fast) {
        s.level = 100;
        s.upgrades = 10000;
      }
      const h = new Hunt(s, () => 0.5),
        events: string[] = [];
      h.onEvent = (type) => events.push(type);
      h.encounter({ ...h.enemy, hp: 100000 });
      h.enemyHp = 1;
      if (special) {
        assert.ok(h.castSkill());
        h.tick(0);
      } else {
        h.playerClock = stats(s).interval;
        h.tick(0);
      }
      assert.equal(h.phase, "recompensas");
      assert.equal(s.kills, 1);
      const delay = strikeDuration(special, stats(s).interval);
      let elapsed = 0;
      s.paused = true;
      h.tick(250);
      assert.equal(h.timer, 0);
      s.paused = false;
      while (elapsed + 10 < delay) {
        h.tick(10);
        elapsed += 10;
        assert.equal(h.phase, "recompensas");
      }
      h.tick(10);
      elapsed += 10;
      assert.equal(h.phase, "explorando");
      assert.ok(elapsed <= 700);
      for (let i = 0; i < 50; i++) h.tick(100);
      assert.equal(s.kills, 1);
      assert.equal(events.filter((e) => e === "victory").length, 1);
      assert.equal(events.filter((e) => e === "resume").length, 1);
    });

test("minimap projection preserves world positions and rejects letterbox clicks", () => {
  const shipped = JSON.parse(
    readFileSync("public/assets/maps/index.json", "utf8"),
  ) as { maps: { width: number; height: number }[] };
  for (const [w, h] of [
    ...shipped.maps.map((map) => [map.width, map.height]),
    [1000, 720],
    [6400, 3600],
    [3200, 5200],
    [1, 1],
  ]) {
    const p = mapProjection(w, h);
    for (const point of [
      { x: 0, y: 0 },
      { x: w, y: h },
      { x: w * 0.37, y: h * 0.81 },
    ]) {
      const restored = p.unproject(p.project(point))!;
      assert.ok(restored);
      assert.ok(Math.abs(restored.x - point.x) < 1e-8);
      assert.ok(Math.abs(restored.y - point.y) < 1e-8);
    }
    assert.equal(p.unproject({ x: 0, y: 0 }), undefined);
  }
});

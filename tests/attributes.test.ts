import test from "node:test";
import assert from "node:assert/strict";
import { fresh, stats, Hunt, restore } from "../src/model.ts";
import { damageAfterResistance, strikeDuration } from "../src/progression/combat-stats.ts";

test("starters have distinct attributes which determine attack and movement speed", () => {
  const naruto = stats(fresh("naruto")), sasuke = stats(fresh("sasuke")), sakura = stats(fresh("sakura"));
  assert.ok(sasuke.attributes.speed > naruto.attributes.speed);
  assert.ok(sasuke.interval < naruto.interval && naruto.interval < sakura.interval);
  assert.ok(sasuke.moveSpeed > naruto.moveSpeed && naruto.moveSpeed > sakura.moveSpeed);
  assert.ok(sakura.maxHp > naruto.maxHp && naruto.maxHp > sasuke.maxHp);
  assert.ok(sakura.chakraRegen > sasuke.chakraRegen);
  assert.ok(sasuke.skillDamage > naruto.skillDamage);
});

test("the first strikes start promptly, then higher speed produces more attacks", () => {
  const counts: number[] = [];
  for (const id of ["naruto", "sasuke", "sakura"] as const) {
    const hunt = new Hunt(fresh(id));
    let elapsed = 0, firstAttack = 0, firstEnemy = 0;
    hunt.onEvent = type => {
      if (type === "attack" && !firstAttack) firstAttack = elapsed;
      if (type === "hurt" && !firstEnemy) firstEnemy = elapsed;
    };
    hunt.encounter(); hunt.enemyHp = hunt.enemyMax = 100000;
    for (elapsed = 10; elapsed <= 16000; elapsed += 10) hunt.tick(10);
    assert.ok(firstAttack >= 120 && firstAttack <= 350, `${id}: first strike ${firstAttack}`);
    assert.ok(firstEnemy <= 500 && firstEnemy > firstAttack);
    counts.push(hunt.attacks);
  }
  assert.ok(counts[1] > counts[0] && counts[0] > counts[2]);
});

test("level, training and owned equipment affect actual derived attributes with speed caps", () => {
  const save = fresh("naruto"), base = stats(save);
  save.level = 10; save.upgrades = 20;
  save.inventory = { "colete-shinobi": 1, "kunai-treino": 1, "amuleto-chakra": 1 };
  save.equipment = { armor: "colete-shinobi", weapon: "kunai-treino", charm: "amuleto-chakra" };
  const trained = stats(save);
  for (const key of Object.keys(base.attributes) as (keyof typeof base.attributes)[]) assert.ok(trained.attributes[key] > base.attributes[key], key);
  assert.ok(trained.moveSpeed > base.moveSpeed && trained.interval < base.interval);
  assert.ok(trained.skillDamage > base.skillDamage && trained.skillHeal > base.skillHeal);
  assert.ok(damageAfterResistance(100, trained.defense) < damageAfterResistance(100, base.defense));
  save.level = 100; save.upgrades = 10000;
  const maximum = stats(save);
  assert.equal(maximum.moveSpeed, 180); assert.equal(maximum.interval, 450);
  assert.ok(strikeDuration(true, maximum.interval) < maximum.interval);
  assert.ok(strikeDuration(false, maximum.interval) < maximum.interval);
});

test("pause freezes the early attack and legacy saves derive their attributes without new fields", () => {
  const save = fresh("naruto"), hunt = new Hunt(save);
  hunt.encounter(); save.paused = true;
  for (let i = 0; i < 30; i++) hunt.tick(100);
  assert.equal(hunt.attacks, 0);
  save.paused = false;
  for (let i = 0; i < 35; i++) hunt.tick(10);
  assert.equal(hunt.attacks, 1);
  const loaded = restore({ read: () => JSON.stringify(save), write() {} });
  assert.ok(loaded);
  assert.deepEqual(stats(loaded.save).attributes, stats(save).attributes);
});

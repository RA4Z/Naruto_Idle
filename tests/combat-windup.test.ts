import test from "node:test";
import assert from "node:assert/strict";
import { Hunt, fresh } from "../src/model.ts";
import { enemyProfile } from "../src/world/enemy-profiles.ts";

function setup() {
  const h = new Hunt(fresh("naruto"), () => 1);
  h.encounter(
    { ...enemyProfile("19001001"), hp: 10000, attack: 0.1 },
    "one",
    true,
  );
  h.enemyAttacks = 2;
  h.opponents.get("one")!.inRange = false;
  for (let i = 0; i < 20; i++) h.tick(100);
  return h;
}

test("returning to melee must telegraph a ready special before dealing its damage", () => {
  const h = setup(),
    events: string[] = [];
  h.onEvent = (event) => events.push(event);
  const hp = h.hp;
  h.opponents.get("one")!.inRange = true;
  h.tick(100);
  assert.deepEqual(events, ["enemy-windup"]);
  assert.equal(h.hp, hp);
  h.tick(250);
  assert.equal(h.hp, hp);
  h.tick(50);
  assert.ok(h.hp < hp);
  assert.equal(events.filter((e) => e === "enemy-special").length, 1);
  h.tick(16);
  assert.equal(h.enemyAttacks, 3);
});

test("breaking melee cancels the special telegraph; pause and target swaps never advance it", () => {
  const h = setup();
  h.join("other", { ...enemyProfile(), hp: 10000, attack: 0.1 }, false);
  const foe = h.opponents.get("one")!;
  foe.inRange = true;
  h.tick(16);
  assert.equal(foe.windup, true);
  h.selectTarget("other");
  h.retreat();
  const hp = h.hp;
  h.save.paused = true;
  h.tick(250);
  h.save.paused = false;
  h.tick(250);
  assert.equal(h.hp, hp);
  foe.inRange = false;
  h.tick(16);
  assert.equal(foe.windup, false);
  foe.inRange = true;
  h.tick(16);
  h.tick(250);
  assert.equal(h.hp, hp);
  h.tick(50);
  assert.ok(h.hp < hp);
});

test("defeat cancels every telegraph, including a different enemy's unfinished special", () => {
  const h = setup();
  const one = h.opponents.get("one")!;
  one.inRange = true;
  h.tick(0);
  assert.equal(one.windup, true);
  h.join("killer", { ...enemyProfile(), attack: 1000000 });
  h.opponents.get("killer")!.clock =
    h.opponents.get("killer")!.profile.interval;
  h.hp = 1;
  h.tick(0);
  assert.equal(h.phase, "derrota");
  assert.ok(
    h.livingOpponents.every((foe) => !foe.windup && foe.windupMs === 0),
  );
  assert.equal(h.save.defeats, 1);
});

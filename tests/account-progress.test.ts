import test from "node:test";
import assert from "node:assert/strict";
import { fresh, addXp, restore, reward } from "../src/model.ts";
import {
  accountNeeded,
  ensureAccountProgress,
} from "../src/progression/account-progress.ts";
import {
  characterProgress,
  needed,
  selectCharacter,
  syncCharacterProgress,
} from "../src/progression/character-progress.ts";
import { cloudSnapshot } from "../src/cloud/snapshot.ts";

test("account and character level thresholds are identical at every level, including 16 to 17", () => {
  for (const level of [
    ...Array.from({ length: 120 }, (_, i) => i + 1),
    1000,
    10000,
  ]) {
    assert.equal(accountNeeded(level), needed(level));
    const s = fresh("naruto");
    s.level = s.accountLevel = level;
    s.xp = s.accountXp = needed(level) - 1;
    addXp(s, 1);
    assert.equal(s.level, level + 1);
    assert.equal(s.accountLevel, level + 1);
    assert.equal(s.xp, 0);
    assert.equal(s.accountXp, 0);
  }
});

test("account XP follows all earned rewards across character switches without granting XP to inactive ninjas", () => {
  const s = fresh("naruto", 1000);
  addXp(s, needed(1) + 5);
  selectCharacter(s, "11000211");
  assert.equal(s.level, 1);
  assert.equal(s.accountLevel, 2);
  const result = reward(s, () => 1);
  assert.equal(s.accountXp, 5 + result.xp);
  assert.equal(s.xp, result.xp);
  assert.equal(characterProgress(s, "11000101").xp, 5);
  assert.equal(characterProgress(s, "11000301").xp, 0);
  assert.deepEqual(cloudSnapshot(s), s);
});

test("legacy account migration seeds the furthest ninja once and ignores duplicated retired Sasuke records", () => {
  const s = fresh("sasuke", 1000);
  delete s.accountLevel;
  delete s.accountXp;
  s.level = 16;
  s.xp = 35;
  syncCharacterProgress(s);
  s.collection!.push("11000201");
  s.characterProgress!["11000201"] = structuredClone(
    s.characterProgress!["11000211"],
  );
  characterProgress(s, "11000101").xp = 10;
  const migrated = cloudSnapshot(s);
  assert.equal(migrated.accountLevel, 16);
  assert.equal(migrated.accountXp, 35);
  assert.deepEqual(cloudSnapshot(migrated), migrated);
  assert.equal(s.accountLevel, undefined);
});

test("offline awards update both XP tracks once and characters and accounts keep growing beyond 100", () => {
  const s = fresh("naruto", 1000);
  s.location = "10005";
  s.autoHunt = true;
  let raw = JSON.stringify(s);
  const store = {
    read: () => raw,
    write: (value: string) => {
      raw = value;
    },
  };
  const first = restore(store, 601000)!;
  assert.ok(first.offline.xp > 0);
  assert.equal(first.save.accountLevel, first.save.level);
  assert.equal(first.save.accountXp, first.save.xp);
  const second = restore(store, 601000)!;
  assert.equal(second.offline.xp, 0);
  assert.equal(second.save.accountXp, first.save.accountXp);
  const capped = fresh("naruto");
  capped.level = capped.accountLevel = 100;
  addXp(capped, needed(100));
  assert.equal(capped.level, 101);
  assert.equal(capped.accountLevel, 101);
  assert.equal(capped.accountXp, 0);
  capped.level = capped.accountLevel = 1000;
  addXp(capped, needed(1000));
  assert.equal(capped.level, 1001);
  assert.equal(capped.accountLevel, 1001);
  assert.deepEqual(cloudSnapshot(capped), capped);
});

test("account migration and validation reject partial, corrupt or non-normalized account records", () => {
  const s = fresh("naruto", 1000);
  for (const values of [
    { accountLevel: 0 },
    { accountLevel: Infinity },
    { accountLevel: 1.5 },
    { accountXp: -1 },
    { accountXp: needed(1) },
    { accountXp: null },
    { accountXp: undefined },
  ]) {
    assert.equal(
      restore(
        { read: () => JSON.stringify({ ...s, ...values }), write() {} },
        1000,
      ),
      null,
    );
  }
  const before = structuredClone(s);
  for (const amount of [NaN, Infinity, -10, 0]) addXp(s, amount);
  assert.deepEqual(s, { ...before, characterProgress: s.characterProgress });
  ensureAccountProgress(s);
  assert.equal(s.accountLevel, 1);
});

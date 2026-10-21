import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fresh, Hunt, stats } from "../src/model.ts";
import { AREAS } from "../src/config/areas.ts";
import { selectCharacter } from "../src/progression/character-progress.ts";
import { enemyProfile } from "../src/world/enemy-profiles.ts";
import { ITEMS } from "../src/progression/rules.ts";
const heroes = [
  "11000101",
  "11000211",
  "11000301",
  "11001601",
  "11001201",
  "11000411",
  "11001801",
  "11004901",
  "11002001",
  "11000801",
  "11000901",
];
const enemies = [
  "19000301",
  "19000401",
  "19000901",
  "19001001",
  "19001801",
  "19004301",
];
const results = [];
for (const id of heroes)
  for (const level of [1, 5, 12, 25])
    for (const path of ["none", "damage", "survival", "chakra"])
      for (const foe of enemies)
        for (const elite of [false, true]) {
          const s = fresh("naruto");
          if (!s.collection.includes(id)) s.collection.push(id);
          selectCharacter(s, id);
          s.level = level;
          s.area = AREAS.reduce(
            (current, area, i) => (area.level <= level ? i : current),
            0,
          );
          const tier = level >= 12 ? 3 : level >= 5 ? 2 : 1;
          if (path !== "none")
            for (const slot of ["weapon", "armor", "charm"]) {
              const item = ITEMS.find(
                (i) => i.slot === slot && i.path === path && i.tier === tier,
              );
              if (item) {
                s.inventory[item.id] = 1;
                s.equipment[slot] = item.id;
              }
            }
          const h = new Hunt(s, () => 0.99);
          h.encounter(enemyProfile(foe, elite));
          let elapsed = 0;
          while (
            elapsed < 60000 &&
            !["derrota", "recompensas"].includes(h.phase)
          ) {
            h.tick(100);
            elapsed += 100;
          }
          assert.ok([h.hp, h.enemyHp, h.chakra].every(Number.isFinite));
          results.push({
            id,
            level,
            path,
            foe,
            elite,
            outcome:
              h.phase === "recompensas"
                ? "win"
                : h.phase === "derrota"
                  ? "loss"
                  : "timeout",
            seconds: elapsed / 1000,
            remainingHp: Math.round(h.hp),
            maxHp: stats(s).maxHp,
          });
        }
const summary = {};
for (const row of results) {
  const key = `${row.level}:${row.path}`;
  summary[key] ??= { wins: 0, losses: 0, timeouts: 0, winSeconds: 0 };
  const group = summary[key];
  if (row.outcome === "win") {
    group.wins++;
    group.winSeconds += row.seconds;
  } else if (row.outcome === "loss") group.losses++;
  else group.timeouts++;
}
await writeFile(
  "reports/balance-simulation.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      cases: results.length,
      deterministic: true,
      summary,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ cases: results.length, summary }, null, 2));

import { t } from "../i18n/core.ts";
export const AREAS = [
  {
    id: "folha",
    name: t("config.areas.164b6f7d1e"),
    level: 1,
    enemyHp: 52,
    enemyAttack: 6,
    xp: 22,
    coins: 8,
  },
  {
    id: "patrulha",
    name: t("config.areas.31e5d49a93"),
    level: 5,
    enemyHp: 110,
    enemyAttack: 13,
    xp: 48,
    coins: 19,
  },
  {
    id: "veterana",
    name: t("balance.area.veteran"),
    level: 12,
    enemyHp: 330,
    enemyAttack: 35,
    xp: 125,
    coins: 48,
  },
  {
    id: "elite",
    name: t("balance.area.elite"),
    level: 25,
    enemyHp: 850,
    enemyAttack: 80,
    xp: 320,
    coins: 120,
  },
];
// Manually audited street waypoints, in the 1000 x 1000 world coordinate system.
// Background collision data was not recovered; see navigation.ts for the street boundary.
export const ROUTE = [
  { x: 310, y: 205 },
  { x: 385, y: 260 },
  { x: 465, y: 315 },
  { x: 535, y: 350 },
  { x: 595, y: 385 },
  { x: 640, y: 410 },
];

import type { Attributes } from "./combat-stats.ts";

// Authored idle balance, independent of translated names and cosmetic variants.
// Families share a kit so a costume is never a hidden statistical upgrade.
const attributes = (
  vitality: number,
  strength: number,
  ninjutsu: number,
  speed: number,
  chakra: number,
  control: number,
  resistance: number,
): Attributes => ({
  vitality,
  strength,
  ninjutsu,
  speed,
  chakra,
  control,
  resistance,
});
export const RECRUIT_STYLES = {
  balanced: {
    base: attributes(130, 16, 17, 104, 100, 10, 10),
    growth: attributes(12, 2, 2, 0.75, 2, 0.1, 0.5),
    cost: 35,
    power: [1, 1],
    heal: 0,
    guard: 0,
    physical: false,
  },
  guardian: {
    base: attributes(158, 13, 15, 91, 100, 10, 23),
    growth: attributes(15, 1.7, 1.8, 0.55, 2, 0.1, 0.8),
    cost: 35,
    power: [1, 0.8],
    heal: 0,
    guard: 0.35,
    physical: true,
  },
  duelist: {
    base: attributes(108, 21, 7, 123, 75, 6, 6),
    growth: attributes(9, 2.6, 1, 0.95, 1.5, 0.08, 0.3),
    cost: 35,
    power: [1.6, 0.5],
    heal: 0,
    guard: 0,
    physical: true,
  },
  skirmisher: {
    base: attributes(115, 17, 15, 125, 85, 8, 7),
    growth: attributes(10, 2.1, 1.8, 1, 1.7, 0.1, 0.35),
    cost: 35,
    power: [1.2, 1],
    heal: 0,
    guard: 0,
    physical: true,
  },
  caster: {
    base: attributes(108, 10, 30, 95, 130, 13, 6),
    growth: attributes(9, 1.2, 3.1, 0.65, 3, 0.16, 0.3),
    cost: 35,
    power: [0.8, 2],
    heal: 0,
    guard: 0,
    physical: false,
  },
  medic: {
    base: attributes(130, 11, 18, 90, 125, 16, 10),
    growth: attributes(12, 1.3, 2.4, 0.5, 2.6, 0.2, 0.5),
    cost: 35,
    power: [0.7, 0.6],
    heal: 0.12,
    guard: 0,
    physical: false,
  },
  tactician: {
    base: attributes(118, 13, 23, 105, 110, 14, 10),
    growth: attributes(10, 1.6, 2.5, 0.75, 2.5, 0.18, 0.4),
    cost: 28,
    power: [1, 1],
    heal: 0,
    guard: 0,
    physical: false,
  },
  bruiser: {
    base: attributes(155, 21, 9, 88, 80, 7, 13),
    growth: attributes(14, 2.7, 1.2, 0.5, 1.5, 0.08, 0.6),
    cost: 35,
    power: [1.6, 0.7],
    heal: 0,
    guard: 0,
    physical: true,
  },
} as const;
export type RecruitStyle = keyof typeof RECRUIT_STYLES;
const families: Record<number, RecruitStyle> = {};
const groups: Record<RecruitStyle, number[]> = {
  balanced: [
    1, 2, 3, 16, 35, 36, 37, 43, 45, 47, 60, 65, 75, 79, 98, 107, 121, 126, 138,
    141, 144, 146, 150, 162,
  ],
  guardian: [
    12, 13, 25, 26, 33, 57, 66, 82, 91, 93, 103, 105, 119, 131, 136, 147,
  ],
  duelist: [
    4, 5, 17, 19, 55, 70, 74, 110, 111, 112, 113, 114, 115, 123, 124, 135, 137,
    139, 152,
  ],
  skirmisher: [6, 10, 18, 44, 52, 76, 109, 118, 127, 129],
  caster: [
    14, 21, 22, 24, 29, 32, 34, 49, 58, 61, 68, 69, 71, 81, 85, 90, 92, 94, 95,
    96, 97, 99, 101, 102, 104, 117, 145,
  ],
  medic: [20, 23, 42, 50, 51, 83, 106, 142, 143],
  tactician: [
    7, 8, 11, 15, 30, 40, 41, 48, 56, 62, 72, 77, 78, 80, 84, 87, 88, 116, 125,
  ],
  bruiser: [9, 27, 28, 53, 54],
};
for (const [style, ids] of Object.entries(groups))
  for (const family of ids) {
    if (families[family])
      throw new Error(`Duplicate recruit family: ${family}`);
    families[family] = style as RecruitStyle;
  }
const overrides: Record<string, Partial<Attributes>> = {
  "110012": {
    vitality: 142,
    strength: 14,
    ninjutsu: 16,
    speed: 103,
    resistance: 21,
  },
  "110013": {
    vitality: 165,
    strength: 11,
    ninjutsu: 25,
    speed: 82,
    chakra: 115,
  },
  "110016": {
    vitality: 118,
    strength: 17,
    ninjutsu: 23,
    speed: 110,
    chakra: 90,
  },
};
export function recruitProfile(id: string) {
  const family = id.slice(0, 6);
  const style: RecruitStyle =
    family === "100004"
      ? "duelist"
      : families[Number(id.slice(3, 6))] || "balanced";
  const kit = RECRUIT_STYLES[style];
  return {
    style,
    ...kit,
    base: overrides[family] ? { ...kit.base, ...overrides[family] } : kit.base,
    configured:
      family === "100004" ||
      (id.startsWith("110") && Number(id.slice(3, 6)) in families),
  };
}

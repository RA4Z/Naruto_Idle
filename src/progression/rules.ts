import type { Save } from "../model";
import { syncCharacterProgress } from "./character-progress.ts";
export type Slot = "weapon" | "armor" | "charm";
export const ITEMS = [
  {
    id: "kunai-treino",
    name: "Kunai de treino",
    slot: "weapon" as Slot,
    price: 45,
    attack: 3,
    hp: 0,
    chakra: 0,
    regen: 0,
    description: "Uma base para uma build de taijutsu.",
  },
  {
    id: "kunai-reforcada",
    name: "Kunai reforçada",
    slot: "weapon" as Slot,
    price: 140,
    attack: 8,
    hp: 0,
    chakra: 0,
    regen: 0,
    description: "Maior dano para caçadas longas.",
  },
  {
    id: "colete-shinobi",
    name: "Colete shinobi",
    slot: "armor" as Slot,
    price: 70,
    attack: 0,
    hp: 28,
    chakra: 0,
    regen: 0,
    description: "Resistência para enfrentar mais encontros.",
  },
  {
    id: "amuleto-chakra",
    name: "Amuleto de chakra",
    slot: "charm" as Slot,
    price: 65,
    attack: 0,
    hp: 0,
    chakra: 25,
    regen: 1.5,
    description: "Mais reserva e regeneração para seus jutsus.",
  },
];
export const STARTER_COLLECTION = ["11000101", "11000211", "11000301"];
export const RECRUIT_COST = { coins: 60, fragments: 3 };
export function equipmentBonuses(s: Save) {
  const result = { attack: 0, hp: 0, chakra: 0, regen: 0 };
  for (const [slot, id] of Object.entries(s.equipment || {})) {
    const item = ITEMS.find((i) => i.id === id && i.slot === slot);
    if (item && (s.inventory[item.id] || 0) > 0)
      for (const key of ["attack", "hp", "chakra", "regen"] as const)
        result[key] += item[key];
  }
  return result;
}
export function buyItem(s: Save, id: string) {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) throw new Error("Item desconhecido.");
  if (s.inventory[id]) throw new Error("Este equipamento já está na mochila.");
  if (s.coins < item.price) throw new Error("Moedas insuficientes.");
  s.coins -= item.price;
  s.inventory[id] = 1;
  return item;
}
export function equipItem(s: Save, id: string) {
  const item = ITEMS.find((i) => i.id === id);
  if (!item || !s.inventory[id])
    throw new Error("Você precisa possuir este equipamento.");
  s.equipment ??= {};
  s.equipment[item.slot] = id;
  syncCharacterProgress(s);
  return item;
}
export function recruit(s: Save, id: string) {
  if (id === "11000201") throw new Error("Esta versão do Sasuke será disponibilizada no futuro.");
  if (!/^\d{6,12}$/.test(id)) throw new Error("Identificador inválido.");
  s.collection ??= [...STARTER_COLLECTION];
  if (s.collection.includes(id)) throw new Error("Personagem já recrutado.");
  if (
    s.coins < RECRUIT_COST.coins ||
    (s.inventory.fragmento || 0) < RECRUIT_COST.fragments
  )
    throw new Error("Recrutamento: 60 moedas e 3 fragmentos de treino.");
  s.coins -= RECRUIT_COST.coins;
  s.inventory.fragmento -= RECRUIT_COST.fragments;
  s.collection.push(id);
  syncCharacterProgress(s);
}
export const QUESTS = [
  {
    id: "first-victory",
    name: "Primeiro passo ninja",
    description: "Vença um encontro em um mapa de exploração.",
    target: 1,
    coins: 40,
    xp: 30,
    progress: (s: Save) => s.kills,
  },
  {
    id: "forest-visit",
    name: "Além dos portões",
    description: "Visite a Floresta da Folha.",
    target: 1,
    coins: 20,
    xp: 15,
    progress: (s: Save) => Number(s.visitedMaps?.includes("10005")),
  },
  {
    id: "training-visit",
    name: "Conheça o campo",
    description: "Visite o Campo de Treinamento da Folha.",
    target: 1,
    coins: 20,
    xp: 15,
    progress: (s: Save) => Number(s.visitedMaps?.includes("10006")),
  },
  {
    id: "ten-victories",
    name: "Patrulha persistente",
    description: "Acumule dez vitórias.",
    target: 10,
    coins: 90,
    xp: 80,
    progress: (s: Save) => s.kills,
  },
  {
    id: "waves-visit",
    name: "Um novo horizonte",
    description: "Explore o País das Ondas.",
    target: 1,
    coins: 30,
    xp: 25,
    progress: (s: Save) => Number(s.visitedMaps?.includes("10008")),
  },
];
export function claimQuest(s: Save, id: string) {
  const quest = QUESTS.find((q) => q.id === id);
  if (!quest) throw new Error("Missão desconhecida.");
  if (s.questClaims?.includes(id)) throw new Error("Recompensa já recebida.");
  if (quest.progress(s) < quest.target)
    throw new Error("Conclua o objetivo primeiro.");
  s.questClaims ??= [];
  s.questClaims.push(id);
  s.coins += quest.coins;
  return { coins: quest.coins, xp: quest.xp };
}

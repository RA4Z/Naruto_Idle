export const CHARACTERS = {
  naruto: {
    name: "Naruto",
    assetFolder: "naruto-kid",
    portrait: "/assets/characters/naruto-kid/portrait.png",
    subtitle: "Determinação que nunca se apaga",
    description: "Equilíbrio entre força e resistência.",
    attributes: { vitality: 140, strength: 15, ninjutsu: 18, speed: 100, chakra: 110, control: 10, resistance: 8 },
    color: 0xffac35,
    skill: "Rasengan",
  },
  sasuke: {
    name: "Sasuke",
    assetFolder: "sasuke-kid",
    portrait: "/assets/characters/sasuke-kid/portrait.png",
    subtitle: "Um passo à frente do adversário",
    description: "Ataques rápidos e precisos.",
    attributes: { vitality: 112, strength: 18, ninjutsu: 22, speed: 125, chakra: 95, control: 11, resistance: 6 },
    color: 0x8ba4ff,
    skill: "Chidori",
  },
  sakura: {
    name: "Sakura",
    assetFolder: "sakura-kid",
    portrait: "/assets/characters/sakura-kid/portrait.png",
    subtitle: "Força para continuar",
    description: "Resistência e recuperação gradual.",
    attributes: { vitality: 165, strength: 13, ninjutsu: 17, speed: 92, chakra: 105, control: 14, resistance: 10 },
    color: 0xf2a7c2,
    skill: "Cura",
  },
} as const;
export type CharacterId = keyof typeof CHARACTERS;

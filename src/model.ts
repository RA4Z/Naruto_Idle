import {
  combatOpponent,
  type CombatOpponent,
} from "./progression/combat-opponent";
import { IMPLEMENTED_MAP_IDS } from "./config/maps";
import { recruitProfile } from "./progression/recruit-profiles.ts";
import { enemyProfile, type EnemyProfile } from "./world/enemy-profiles.ts";
import {
  combatStats,
  damageAfterResistance,
  strikeDuration,
} from "./progression/combat-stats";
import {
  validPresets,
  type EquipmentPresets,
} from "./progression/preset-schema";
import { ITEMS, QUESTS, STARTER_COLLECTION } from "./progression/rules";
import { reconcileEquipmentCopies } from "./progression/equipment-ownership";
import {
  CHARACTER_IDS,
  activeCharacterId,
  characterProgress,
  newCharacterProgress,
  syncCharacterProgress,
  addCharacterXp,
  starterCharacter,
  type CharacterProgress,
} from "./progression/character-progress";
export { needed } from "./progression/character-progress";
import {
  CHARACTERS,
  AREAS,
  LOOT,
  OFFLINE,
  COMBAT,
  type CharacterId,
} from "./data";
export type Save = {
  version: 1;
  character: CharacterId;
  activeEntityId?: string;
  characterProgress?: Record<string, CharacterProgress>;
  level: number;
  xp: number;
  coins: number;
  inventory: Record<string, number>;
  area: number;
  upgrades: number;
  kills: number;
  defeats: number;
  lastSaved: number;
  sound: boolean;
  music?: boolean;
  soundVolume?: number;
  paused: boolean;
  equipment?: import("./progression/preset-schema").Equipment;
  equipmentPresets?: EquipmentPresets;
  questClaims?: string[];
  visitedMaps?: string[];
  collection?: string[];
  companionId?: string;
  location?: string;
  autoHunt?: boolean;
  partyIds?: string[];
  worldPosition?: { mapId: string; x: number; y: number };
  enemyId?: string;
  npcIds?: string[];
};
export interface ProgressStore {
  read(): string | null;
  write(value: string): void;
}
export const fresh = (character: CharacterId, now = Date.now()): Save => ({
  version: 1,
  character,
  activeEntityId: CHARACTER_IDS[character],
  level: 1,
  xp: 0,
  coins: 0,
  inventory: {},
  area: 0,
  upgrades: 0,
  kills: 0,
  defeats: 0,
  lastSaved: now,
  sound: false,
  paused: false,
  location: "10001",
  autoHunt: false,
  partyIds: [],
  equipment: {},
  questClaims: [],
  visitedMaps: ["10001"],
  collection: [...STARTER_COLLECTION],
  characterProgress: Object.fromEntries(
    STARTER_COLLECTION.map((id) => [id, newCharacterProgress()]),
  ),
});
export function addXp(s: Save, xp: number) {
  addCharacterXp(s, xp);
}
export function stats(s: Save, id = activeCharacterId(s)) {
  const character = (Object.keys(CHARACTER_IDS) as CharacterId[]).find(
    (key) => CHARACTER_IDS[key] === id,
  );
  const profile = characterProgress(s, id);
  return combatStats(
    { ...profile, character: character || "naruto", inventory: s.inventory },
    character ? undefined : recruitProfile(id).base,
    character ? undefined : recruitProfile(id),
  );
}
export function reward(s: Save, random = Math.random, enemy = enemyProfile()) {
  const a = AREAS[s.area];
  s.kills++;
  const coins = Math.max(1, Math.round(a.coins * enemy.coins)),
    xp = Math.max(1, Math.round(a.xp * enemy.xp));
  s.coins += coins;
  addCharacterXp(s, xp);
  for (const d of LOOT)
    if (random() < d.chance)
      s.inventory[d.id] =
        (s.inventory[d.id] || 0) +
        d.min +
        Math.floor(random() * (d.max - d.min + 1));
  if (random() < 0.18)
    s.inventory["chakra-shard"] = (s.inventory["chakra-shard"] || 0) + 1;
  if (random() < 0.02)
    s.inventory["kunai-treino"] = (s.inventory["kunai-treino"] || 0) + 1;
  let equipment: string | undefined;
  if (enemy.elite && random() < 0.25) {
    const unlockedTier = s.level >= 12 ? 3 : s.level >= 5 ? 2 : 1;
    const difficultyTier =
      AREAS[s.area].level >= 12 ? 3 : AREAS[s.area].level >= 5 ? 2 : 1;
    const tier = Math.min(unlockedTier, difficultyTier);
    const candidates = ITEMS.filter(
      (item) => item.tier === tier,
    );
    const item =
      candidates[
        Math.min(
          candidates.length - 1,
          Math.floor(random() * candidates.length),
        )
      ];
    if (item) {
      s.inventory[item.id] = (s.inventory[item.id] || 0) + 1;
      equipment = item.id;
    }
  }
  return { xp, coins, equipment };
}
export function restore(
  store: ProgressStore,
  now = Date.now(),
): {
  save: Save;
  offline: { xp: number; coins: number; seconds: number };
} | null {
  let s: Save;
  try {
    s = JSON.parse(store.read() || "null");
    if (
      !s ||
      s.version !== 1 ||
      !(s.character in CHARACTERS) ||
      !Number.isFinite(s.lastSaved) ||
      !Number.isFinite(s.level) ||
      s.level < 1 ||
      s.level > 100 ||
      !Number.isFinite(s.coins) ||
      s.coins < 0 ||
      !Number.isFinite(s.xp) ||
      s.xp < 0 ||
      !s.inventory ||
      !Number.isInteger(s.area) ||
      !AREAS[s.area] ||
      AREAS[s.area].level > s.level
    )
      return null;
  } catch {
    return null;
  }
  if (
    !Object.hasOwn(CHARACTERS, s.character) ||
    !Number.isSafeInteger(s.level) ||
    !Number.isSafeInteger(s.xp) ||
    s.upgrades > 10000 ||
    ![s.upgrades, s.kills, s.defeats].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    typeof s.paused !== "boolean" ||
    typeof s.sound !== "boolean" ||
    typeof s.inventory !== "object" ||
    Array.isArray(s.inventory) ||
    !Object.values(s.inventory).every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    return null;
  if (
    [s.companionId, s.enemyId, s.activeEntityId].some(
      (id) =>
        id !== undefined && (typeof id !== "string" || !/^\d{6,12}$/.test(id)),
    ) ||
    (s.npcIds !== undefined &&
      (!Array.isArray(s.npcIds) ||
        s.npcIds.length > 3 ||
        s.npcIds.some(
          (id) => typeof id !== "string" || !/^\d{6,12}$/.test(id),
        )))
  )
    return null;
  if (
    (s.music !== undefined && typeof s.music !== "boolean") ||
    (s.soundVolume !== undefined &&
      (!Number.isFinite(s.soundVolume) ||
        s.soundVolume < 0 ||
        s.soundVolume > 1))
  )
    return null;
  const locations = IMPLEMENTED_MAP_IDS;
  if (
    (s.location !== undefined && !locations.includes(s.location)) ||
    (s.autoHunt !== undefined && typeof s.autoHunt !== "boolean") ||
    (s.partyIds !== undefined &&
      (!Array.isArray(s.partyIds) ||
        s.partyIds.length > 3 ||
        new Set(s.partyIds).size !== s.partyIds.length ||
        s.partyIds.some(
          (id) => typeof id !== "string" || !/^\d{6,12}$/.test(id),
        ))) ||
    (s.worldPosition !== undefined &&
      (!s.worldPosition ||
        !locations.includes(s.worldPosition.mapId) ||
        !Number.isFinite(s.worldPosition.x) ||
        !Number.isFinite(s.worldPosition.y) ||
        s.worldPosition.x < 0 ||
        s.worldPosition.y < 0 ||
        s.worldPosition.x > 5000 ||
        s.worldPosition.y > 5000))
  )
    return null;
  if (
    (s.equipment !== undefined &&
      (!s.equipment ||
        typeof s.equipment !== "object" ||
        Array.isArray(s.equipment) ||
        Object.entries(s.equipment).some(
          ([slot, id]) =>
            !ITEMS.some((item) => item.slot === slot && item.id === id) ||
            !s.inventory[id],
        ))) ||
    (s.questClaims !== undefined &&
      (!Array.isArray(s.questClaims) ||
        s.questClaims.length > QUESTS.length ||
        new Set(s.questClaims).size !== s.questClaims.length ||
        s.questClaims.some((id) => !QUESTS.some((q) => q.id === id)))) ||
    (s.visitedMaps !== undefined &&
      (!Array.isArray(s.visitedMaps) ||
        s.visitedMaps.length > locations.length ||
        new Set(s.visitedMaps).size !== s.visitedMaps.length ||
        s.visitedMaps.some((id) => !locations.includes(id)))) ||
    (s.collection !== undefined &&
      (!Array.isArray(s.collection) ||
        s.collection.length > 1466 ||
        new Set(s.collection).size !== s.collection.length ||
        s.collection.some(
          (id) => typeof id !== "string" || !/^\d{6,12}$/.test(id),
        )))
  )
    return null;
  s.equipment ??= {};
  s.questClaims ??= [];
  s.visitedMaps ??= [s.location || "10001"];
  s.collection ??= [...new Set([...STARTER_COLLECTION, ...(s.partyIds || [])])];
  if (s.activeEntityId && !s.collection.includes(s.activeEntityId)) return null;
  if (
    s.equipmentPresets !== undefined &&
    !validPresets(s.equipmentPresets, s.collection)
  )
    return null;
  // Each owned model has a separate record; legacy progress belongs only to the protagonist.
  if (
    s.characterProgress !== undefined &&
    (!s.characterProgress ||
      typeof s.characterProgress !== "object" ||
      Array.isArray(s.characterProgress) ||
      Object.entries(s.characterProgress).some(
        ([id, p]) =>
          !s.collection!.includes(id) ||
          !p ||
          typeof p !== "object" ||
          Array.isArray(p) ||
          !Number.isSafeInteger(p.level) ||
          p.level < 1 ||
          p.level > 100 ||
          !Number.isSafeInteger(p.xp) ||
          p.xp < 0 ||
          !Number.isSafeInteger(p.upgrades) ||
          p.upgrades < 0 ||
          p.upgrades > 10000 ||
          !p.equipment ||
          typeof p.equipment !== "object" ||
          Array.isArray(p.equipment) ||
          Object.entries(p.equipment).some(
            ([slot, item]) =>
              !ITEMS.some((i) => i.id === item && i.slot === slot) ||
              !s.inventory[item],
          ),
      ))
  )
    return null;
  // Keep the retired outfit's record for a future release, and migrate the
  // active legacy Sasuke without losing his earned progress.
  if (
    (!s.activeEntityId && s.character === "sasuke") ||
    s.activeEntityId === "11000201"
  ) {
    s.characterProgress ??= {};
    s.characterProgress["11000201"] ??= {
      level: s.level,
      xp: s.xp,
      upgrades: s.upgrades,
      equipment: { ...s.equipment },
    };
    if (!s.collection.includes("11000201")) s.collection.push("11000201");
    const p =
      s.characterProgress[CHARACTER_IDS.sasuke] ??
      s.characterProgress["11000201"];
    s.activeEntityId = CHARACTER_IDS.sasuke;
    s.level = p.level;
    s.xp = p.xp;
    s.upgrades = p.upgrades;
    s.equipment = { ...p.equipment };
  }
  // All existing saves receive the replacement starter; the old outfit is hidden.
  if (
    s.collection.includes("11000201") &&
    !s.collection.includes(CHARACTER_IDS.sasuke)
  )
    s.collection.push(CHARACTER_IDS.sasuke);
  syncCharacterProgress(s);
  reconcileEquipmentCopies(s);
  if (AREAS[s.area].level > s.level) s.area = 0;
  s.location ??= "10001";
  s.partyIds ??= [];
  s.partyIds = [];
  delete s.companionId;
  s.autoHunt ??= false;
  if (s.location === "10001") s.autoHunt = false;
  const seconds = Math.min(
    OFFLINE.capSeconds,
    Math.max(0, (now - s.lastSaved) / 1000),
  );
  const wins =
    s.paused || !s.autoHunt || s.location === "10001"
      ? 0
      : Math.floor(seconds / OFFLINE.intervalSeconds);
  const a = AREAS[s.area];
  const xp = Math.floor(wins * a.xp * OFFLINE.fraction),
    coins = Math.floor(wins * a.coins * OFFLINE.fraction);
  addCharacterXp(s, xp);
  s.coins += coins;
  s.lastSaved = now;
  // Commit before showing the summary: reloading cannot claim this interval twice.
  store.write(JSON.stringify(s));
  return { save: s, offline: { xp, coins, seconds } };
}
export type Phase =
  | "explorando"
  | "iniciando combate"
  | "combatendo"
  | "recompensas"
  | "retomando exploração"
  | "derrota";
export class Hunt {
  private lastAttackDuration = 450;
  readonly opponents = new Map<string, CombatOpponent>();
  targetId = "primary";
  private idle = combatOpponent("primary", enemyProfile(), 0, 0);
  private get target() {
    return this.opponents.get(this.targetId) || this.idle;
  }
  get enemy() {
    return this.target.profile;
  }
  set enemy(value: EnemyProfile) {
    this.target.profile = value;
  }
  get enemyHp() {
    return this.target.hp;
  }
  set enemyHp(value: number) {
    this.target.hp = value;
  }
  get enemyMax() {
    return this.target.maxHp;
  }
  set enemyMax(value: number) {
    this.target.maxHp = value;
  }
  get enemyClock() {
    return this.target.clock;
  }
  set enemyClock(value: number) {
    this.target.clock = value;
  }
  get enemyAttacks() {
    return this.target.attacks;
  }
  set enemyAttacks(value: number) {
    this.target.attacks = value;
  }
  get enemyWindup() {
    return this.target.windup;
  }
  set enemyWindup(value: boolean) {
    this.target.windup = value;
  }
  get enemyHealsLeft() {
    return this.target.healsLeft;
  }
  set enemyHealsLeft(value: number) {
    this.target.healsLeft = value;
  }
  get livingOpponents() {
    return [...this.opponents.values()].filter((e) => e.hp > 0);
  }
  selectTarget(id: string) {
    const next = this.opponents.get(id);
    if (
      this.save.paused ||
      !next ||
      next.hp <= 0 ||
      !["combatendo", "recompensas"].includes(this.phase)
    )
      return false;
    this.targetId = id;
    this.phase = "combatendo";
    this.onEvent("target", 0, id);
    return true;
  }
  join(id: string, profile: EnemyProfile, inRange = true) {
    if (this.save.paused || !["combatendo", "recompensas"].includes(this.phase))
      return false;
    if ((this.opponents.get(id)?.hp || 0) > 0) return false;
    const foe = combatOpponent(
      id,
      profile,
      Math.round(AREAS[this.save.area].enemyHp * profile.hp),
      COMBAT.firstEnemyAttackMs,
    );
    foe.inRange = inRange;
    this.opponents.set(id, foe);
    this.onEvent("join", 0, id);
    if (this.enemyHp <= 0) this.selectTarget(id);
    return true;
  }
  leave(id: string) {
    this.opponents.delete(id);
    if (id !== this.targetId) return;
    const next = this.livingOpponents[0];
    if (next) this.selectTarget(next.id);
    else if (this.phase === "combatendo") {
      this.phase = "explorando";
      this.onEvent("disengage", 0);
    }
  }
  guard = 0;
  lastReward: { xp: number; coins: number; equipment?: string } = {
    xp: 0,
    coins: 0,
  };
  phase: Phase = "explorando";
  hp: number;
  chakra: number;
  skillCooldown = 0;
  timer = 0;
  playerClock = 0;
  attacks = 0;
  onEvent: (type: string, value: number, opponentId?: string) => void =
    () => {};
  constructor(
    public save: Save,
    private random = Math.random,
  ) {
    this.hp = stats(save).maxHp;
    this.chakra = stats(save).maxChakra;
  }
  castSkill() {
    if (
      this.phase !== "combatendo" ||
      this.save.paused ||
      this.enemyHp <= 0 ||
      !this.target.inRange ||
      this.chakra < stats(this.save).skillCost ||
      this.skillCooldown > 0
    )
      return false;
    this.playerClock = 0;
    this.technique(stats(this.save));
    this.settleDeaths();
    return true;
  }
  private technique(st: ReturnType<typeof stats>) {
    this.lastAttackDuration = strikeDuration(
      !!starterCharacter(this.save),
      st.interval,
    );
    this.chakra -= st.skillCost;
    this.skillCooldown = 1200;
    this.guard = st.skillGuard;
    const damage = damageAfterResistance(
      st.skillDamage,
      st.skillPhysical ? this.enemy.defense : this.enemy.ninjutsuDefense,
    );
    this.enemyHp = Math.max(0, this.enemyHp - damage);
    if (
      starterCharacter(this.save) === "sakura" ||
      !starterCharacter(this.save)
    ) {
      const previous = this.hp;
      this.hp = Math.min(st.maxHp, this.hp + st.skillHeal);
      if (this.hp > previous) this.onEvent("heal", this.hp - previous);
    }
    this.onEvent(
      starterCharacter(this.save) ? "skill" : "technique",
      damage,
      this.targetId,
    );
  }
  encounter(profile: EnemyProfile = enemyProfile(), id = "primary") {
    if (this.phase !== "explorando" || this.save.paused) return false;
    this.opponents.clear();
    this.targetId = id;
    this.opponents.set(
      id,
      combatOpponent(
        id,
        profile,
        Math.round(AREAS[this.save.area].enemyHp * profile.hp),
        COMBAT.firstEnemyAttackMs,
      ),
    );
    this.phase = "iniciando combate";
    this.timer = 0;
    this.playerClock = Math.max(
      0,
      stats(this.save).interval - COMBAT.firstAttackMs,
    );
    this.enemyClock = profile.interval - COMBAT.firstEnemyAttackMs;
    this.attacks = 0;
    this.enemyAttacks = 0;
    this.enemyWindup = false;
    this.enemyHealsLeft = 3;
    this.guard = 0;
    this.lastReward = { xp: 0, coins: 0 };
    this.onEvent("encounter", 0, id);
    // Start the opening strike on the encounter frame, even at a low render FPS.
    // Following attacks still use the character's full speed-derived interval.
    this.tick(0);
    return true;
  }
  private settleDeaths() {
    for (const foe of this.opponents.values()) {
      if (foe.hp > 0 || foe.rewarded) continue;
      foe.rewarded = true;
      const before = this.save.inventory.fragmento || 0;
      this.lastReward = reward(this.save, this.random, foe.profile);
      const dropped = (this.save.inventory.fragmento || 0) - before;
      if (dropped > 0) this.onEvent("loot", dropped, foe.id);
      if (this.lastReward.equipment) this.onEvent("equipment-drop", 0, foe.id);
      this.onEvent("victory", this.lastReward.xp, foe.id);
    }
    if (this.enemyHp <= 0) {
      const next =
        this.livingOpponents.find((e) => e.inRange) || this.livingOpponents[0];
      if (next) this.selectTarget(next.id);
      else {
        this.phase = "recompensas";
        this.timer = 0;
      }
    }
  }
  private tickOpponent(
    foe: CombatOpponent,
    ms: number,
    st: ReturnType<typeof stats>,
  ) {
    // Out-of-range attackers keep a capped clock, never accumulate a burst.
    foe.clock = Math.min(foe.profile.interval, foe.clock + ms);
    if (!foe.inRange || this.hp <= 0) return;
    const e = foe.profile;
    const special =
      e.specialEvery > 0 && (foe.attacks + 1) % e.specialEvery === 0;
    if (special && !foe.windup && foe.clock >= e.interval - 300) {
      foe.windup = true;
      this.onEvent("enemy-windup", 0, foe.id);
    }
    if (foe.clock < e.interval) return;
    foe.clock -= e.interval;
    foe.attacks++;
    foe.windup = false;
    if (special && e.heal && foe.healsLeft > 0 && foe.hp < foe.maxHp) {
      foe.healsLeft--;
      const heal = Math.min(foe.maxHp - foe.hp, Math.round(foe.maxHp * e.heal));
      foe.hp += heal;
      this.onEvent("enemy-heal", heal, foe.id);
    } else {
      const amount =
        AREAS[this.save.area].enemyAttack *
        e.attack *
        (special ? e.specialPower : 1);
      const defense = st.defense * (1 - (special ? e.pierce : 0));
      const damage = Math.max(
        1,
        Math.round(damageAfterResistance(amount, defense) * (1 - this.guard)),
      );
      this.guard = 0;
      this.hp = Math.max(0, this.hp - damage);
      this.onEvent(special ? "enemy-special" : "hurt", damage, foe.id);
    }
  }
  tick(ms: number) {
    if (this.save.paused) return;
    ms = Math.min(Math.max(ms, 0), 250);
    const st = stats(this.save);
    this.chakra = Math.min(
      st.maxChakra,
      this.chakra + (st.chakraRegen * ms) / 1000,
    );
    this.skillCooldown = Math.max(0, this.skillCooldown - ms);
    this.timer += ms;
    if (
      this.phase === "iniciando combate" &&
      this.timer >= COMBAT.preparationMs
    ) {
      this.phase = "combatendo";
      this.timer = 0;
    }
    if (this.phase === "combatendo") {
      this.playerClock = Math.min(st.interval, this.playerClock + ms);
      if (
        this.playerClock >= st.interval &&
        this.target.inRange &&
        this.enemyHp > 0
      ) {
        this.playerClock -= st.interval;
        const special =
          ++this.attacks % COMBAT.specialEvery === 0 &&
          this.chakra >= st.skillCost &&
          this.skillCooldown <= 0;
        if (special) {
          this.technique(st);
        } else {
          this.lastAttackDuration = strikeDuration(false, st.interval);
          this.chakra = Math.min(st.maxChakra, this.chakra + 6);
          const damage = damageAfterResistance(st.attack, this.enemy.defense);
          this.enemyHp = Math.max(0, this.enemyHp - damage);
          this.onEvent("attack", damage, this.targetId);
        }
      }
      this.settleDeaths();
      if (this.phase !== "combatendo") return;
      for (const foe of this.livingOpponents) this.tickOpponent(foe, ms, st);
      if (this.hp <= 0) {
        this.save.defeats++;
        this.phase = "derrota";
        this.timer = 0;
        this.onEvent("defeat", 0);
      }
    } else if (
      this.phase === "recompensas" &&
      this.timer >= Math.max(180, this.lastAttackDuration)
    ) {
      this.phase = "explorando";
      this.timer = 0;
      this.hp = Math.min(st.maxHp, this.hp + st.maxHp * 0.2);
      this.onEvent("resume", 0);
    } else if (this.phase === "retomando exploração" && this.timer > 400) {
      this.phase = "explorando";
      this.timer = 0;
      this.onEvent("resume", 0);
    } else if (this.phase === "derrota" && this.timer > 3000) {
      this.hp = st.maxHp;
      this.phase = "retomando exploração";
      this.timer = 0;
      this.onEvent("recover", 0);
    }
  }
}

import { fresh, Hunt, stats } from "../model";
import { newCharacterProgress } from "../progression/character-progress";
import { meleeProbe } from "../world/melee";
import type { NativeNavigation, Point } from "../world/navigation";

/** This harness owns a fresh in-memory simulation. It never reads an account,
 * a stored save, or source animation bounds to decide whether damage applies. */
export function labAttack(
  entityId: string,
  kind: "basic" | "skill",
  from: Point,
  target: Point,
  navigation: NativeNavigation,
  moving = false,
  paused = false,
) {
  if (!/^\d{6,12}$/.test(entityId)) throw new Error("SOURCE_PREVIEW_ONLY");
  const contact = meleeProbe(from, target, navigation);
  const save = fresh("naruto");
  save.activeEntityId = entityId;
  save.collection = [entityId];
  save.characterProgress = { [entityId]: newCharacterProgress() };
  save.paused = paused;
  const hunt = new Hunt(save, () => 0.99);
  let damage = 0;
  hunt.onEvent = (event, value) => {
    if (["attack", "skill", "technique"].includes(event)) damage += value;
  };
  hunt.encounter(undefined, "lab-target", true);
  for (const foe of hunt.livingOpponents) foe.inRange = contact.reachable;
  hunt.updateMovement(moving);
  if (kind === "skill") hunt.castSkill();
  else {
    hunt.playerClock = stats(save).interval;
    hunt.attacks = 0;
    hunt.tick(0);
  }
  return {
    ...contact,
    damage,
    hit: damage > 0,
    reason: paused ? "paused" : moving ? "moving" : contact.reason,
    simulationOnly: true as const,
    damageTiming: "logical-resolution-before-visual-animation" as const,
  };
}

/** Use exact authored movement names; source/RPG walk clips are not renamed. */
export function labLocomotion(modes: Record<string, { animations: Record<string, unknown> } | undefined>, moving: boolean, direction: number) {
  const mode = modes.world ? "world" : "source";
  const actions = modes[mode]?.animations || {};
  const names = moving ? [`run_${direction}`, `walk_${direction}`] : [`idle_${direction}`, "idle_0", "sit_idle"];
  const action = names.find(name => Object.hasOwn(actions, name));
  return action ? { mode, action } : undefined;
}

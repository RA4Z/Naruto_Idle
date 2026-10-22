import type { Hunt } from "../model";

type PursuerState = { engaged: boolean; inRange: boolean };

/** Publish one coherent world frame before handing off a departing target.
 * Updating/removing one foe at a time can select yesterday's nearest attacker.
 */
export function syncPursuers(
  hunt: Hunt,
  resolve: (id: string) => PursuerState | undefined,
) {
  if (hunt.save.paused) return;
  const leaving: string[] = [];
  for (const foe of hunt.livingOpponents) {
    const state = resolve(foe.id);
    foe.inRange = !!state?.engaged && state.inRange;
    if (!state?.engaged) leaving.push(foe.id);
  }
  const selected = hunt.targetId;
  // Remove other departing foes first, so none becomes a temporary target.
  for (const id of leaving) if (id !== selected) hunt.leave(id);
  if (leaving.includes(selected)) hunt.leave(selected);
}

/**
 * Бак (GDD 7.3): часть корпуса с прочностью. Попадания в бою и некоторые события её снижают.
 * На нуле бак пробит: сразу выливается часть топлива, а затем течёт каждый перегон до ремонта.
 */
import type { Content } from "./content";
import { log } from "./log";
import { chance, int } from "./rng";
import type { RunState } from "./state";

export function isLeaking(state: RunState): boolean {
  return state.tank.durability <= 0;
}

export function damageTank(state: RunState, content: Content, amount: number, cause: string): void {
  if (amount <= 0 || isLeaking(state)) return;
  state.tank.durability = Math.max(0, state.tank.durability - amount);
  log(state, `tank −${amount} (${cause}), durability ${state.tank.durability}/${state.tank.max}`);
  if (state.tank.durability === 0) {
    const [lo, hi] = content.balance.tank.punctureLoss;
    const lost = Math.min(state.resources.fuel, int(state.rng, lo, hi));
    state.resources.fuel -= lost;
    state.stats.tankPunctures += 1;
    state.stats.fuelLeaked += lost;
    log(state, `tank punctured! −${lost} fuel`);
  }
}

/** Бросок на попадание в бак за одну схватку. */
export function maybeHitTank(state: RunState, content: Content, lostFight: boolean, cause: string): void {
  const t = content.balance.tank;
  const p = lostFight ? t.hitChanceOnLoss : t.hitChance;
  // Оба броска делаются всегда, чтобы последовательность RNG не зависела от того, попали или нет.
  const hit = chance(state.rng, p);
  const dmg = int(state.rng, t.hitDamage[0], t.hitDamage[1]);
  if (hit) damageTank(state, content, dmg, cause);
}

/** Утечка после перегона. */
export function leakAfterLeg(state: RunState, content: Content): void {
  if (!isLeaking(state)) return;
  const lost = Math.min(state.resources.fuel, content.balance.tank.leakPerLeg);
  state.resources.fuel -= lost;
  state.stats.fuelLeaked += lost;
  if (lost > 0) log(state, `tank leaking: −${lost} fuel`);
}

export function repairTankCost(state: RunState, content: Content, atGarage: boolean): number {
  const missing = state.tank.max - state.tank.durability;
  if (missing <= 0) return 0;
  const base = Math.max(1, Math.ceil(missing / content.balance.repairDurabilityPerPart));
  return Math.max(1, Math.ceil(base * (atGarage ? content.balance.garagePartsMult : 1)));
}

export function repairTankFull(state: RunState): void {
  state.tank.durability = state.tank.max;
  log(state, "tank repaired");
}

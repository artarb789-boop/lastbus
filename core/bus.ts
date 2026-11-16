import type { Content } from "./content";
import { fuelMult } from "./equipment";
import type { MapEdge, Pace, RunState } from "./state";

/**
 * Расход топлива на перегон, округлён вверх (GDD 7.4).
 * Зависит от дороги, модулей двигателя, темпа (рывок дороже) и состояния ходовой:
 * разбитые двигатель или колёса заметно увеличивают расход.
 */
export function fuelCost(state: RunState, content: Content, edge: MapEdge, pace: Pace = "normal"): number {
  const b = content.balance;
  const paceMult = pace === "rush" ? b.rushFuelMult : 1;
  const engineMult = state.systems.engine.hp <= 0 ? b.combat.brokenEngineFuelMult : 1;
  const wheelsMult = state.systems.wheels.hp <= 0 ? b.combat.brokenWheelsFuelMult : 1;
  return Math.ceil(b.roads[edge.road].fuel * fuelMult(state, content) * paceMult * engineMult * wheelsMult);
}

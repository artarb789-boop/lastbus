import type { MapEdge, RunState } from "./state";
import { ROAD_FUEL, WEIGHT_FREE, WEIGHT_FUEL_FACTOR } from "./stubs";

/**
 * Вес автобуса (GDD 7.4): пассажиры × 1 + оружие и броня + груз / 3.
 * Оружия и брони в M0 ещё нет. Топливо и жетоны грузом не считаются.
 */
export function busWeight(state: RunState): number {
  const r = state.resources;
  const cargo = r.food + r.parts + r.ammo + r.medkits;
  return state.passengers.length + cargo / 3;
}

/** Расход топлива на перегон, округлён вверх. */
export function fuelCost(state: RunState, edge: MapEdge): number {
  const overload = Math.max(0, busWeight(state) - WEIGHT_FREE);
  return Math.ceil(ROAD_FUEL[edge.road] * (1 + WEIGHT_FUEL_FACTOR * overload));
}

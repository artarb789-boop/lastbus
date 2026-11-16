/** Особенности водителя (GDD 13). Водитель — единственный персонаж со свойствами. */
import type { Content, DriverDef, DriverPerk } from "./content";
import type { RunState } from "./state";

export const DEFAULT_DRIVER = "drv_trucker";

export function driverDef(state: RunState, content: Content): DriverDef | undefined {
  return content.drivers[state.driver.id];
}

function perks<T extends DriverPerk["type"]>(state: RunState, content: Content, type: T): Extract<DriverPerk, { type: T }>[] {
  return (driverDef(state, content)?.perks ?? []).filter((p): p is Extract<DriverPerk, { type: T }> => p.type === type);
}

export function driverFuelMult(state: RunState, content: Content): number {
  return perks(state, content, "fuelMult").reduce((a, p) => a * p.value, 1);
}

export function driverEscapeMult(state: RunState, content: Content): number {
  return perks(state, content, "escapeMult").reduce((a, p) => a * p.value, 1);
}

/** Бонус водителя к уклонению. */
export function driverEvasionBonus(state: RunState, content: Content): number {
  return perks(state, content, "evasionBonus").reduce((a, p) => a + p.value, 0);
}

export function driverStartPerks(def: DriverDef) {
  return {
    equipment: def.perks.filter((p): p is Extract<DriverPerk, { type: "startEquipment" }> => p.type === "startEquipment"),
    resources: def.perks.filter((p): p is Extract<DriverPerk, { type: "startResources" }> => p.type === "startResources"),
  };
}

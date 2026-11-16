import { applyCommand, type Command } from "./commands";
import type { Content } from "./content";
import { boardPassengers } from "./crew";
import { DEFAULT_DRIVER, driverStartPerks } from "./driver";
import { makeItem, tankMax } from "./equipment";
import { generateRegion } from "./map/generate";
import { createNemesis } from "./nemesis";
import { createRng } from "./rng";
import type { RunState } from "./state";

export const DEFAULT_BUS = "bus_city";

export interface RunOptions {
  busId?: string;
  driverId?: string;
}

export function newRun(seed: number, content: Content, opts: RunOptions = {}): RunState {
  const busId = opts.busId ?? DEFAULT_BUS;
  const driverId = opts.driverId ?? DEFAULT_DRIVER;
  const busDef = content.buses[busId];
  if (!busDef) throw new Error(`unknown bus ${busId}`);
  const driverDef = content.drivers[driverId];
  if (!driverDef) throw new Error(`unknown driver ${driverId}`);
  const rng = createRng(seed);
  const map = generateRegion(rng, content.balance);
  const state: RunState = {
    version: 4,
    seed,
    rng,
    map,
    nodeId: map.startId,
    legs: 0,
    bus: structuredClone(busDef),
    equipment: Object.fromEntries(busDef.slots.map((s) => [s.id, null])),
    inventory: [],
    nextUid: 1,
    tank: { durability: busDef.tankDurability, max: busDef.tankDurability },
    hull: { hp: busDef.hull, max: busDef.hull },
    systems: {
      engine: { hp: busDef.systems.engine, max: busDef.systems.engine },
      wheels: { hp: busDef.systems.wheels, max: busDef.systems.wheels },
      cabin: { hp: busDef.systems.cabin, max: busDef.systems.cabin },
    },
    driver: { id: driverId, status: "healthy" },
    passengers: [],
    nextPassengerId: 1,
    resources: { ...content.balance.startResources },
    contested: [],
    nemesis: createNemesis(rng, content),
    phase: { type: "route" },
    stats: {
      delivered: 0,
      tokensFromFares: 0,
      died: 0,
      droppedEarly: 0,
      boarded: 0,
      stopsVisited: 0,
      itemsGained: 0,
      eventsSeen: 0,
      racesContested: 0,
      tankPunctures: 0,
      fuelLeaked: 0,
      fights: 0,
      fightsWon: 0,
      fightTicks: 0,
      escapes: 0,
    },
    log: [],
  };
  for (const [slotId, itemId] of Object.entries(busDef.startEquipment)) {
    state.equipment[slotId] = makeItem(state, content, itemId);
  }
  const perks = driverStartPerks(driverDef);
  for (const p of perks.equipment) state.equipment[p.slot] = makeItem(state, content, p.item);
  for (const p of perks.resources) {
    for (const [k, v] of Object.entries(p.delta)) {
      const key = k as keyof typeof state.resources;
      state.resources[key] = Math.max(0, state.resources[key] + (v ?? 0));
    }
  }
  // Стартовое топливо не больше бака (у автобуса бак может быть меньше обычного).
  state.resources.fuel = Math.min(state.resources.fuel, tankMax(state, content));
  boardPassengers(state, content, content.balance.startPassengers);
  return state;
}

/**
 * Воспроизводит забег по seed и списку команд.
 * Команды, которые были отклонены в оригинале, отклоняются и здесь, поэтому результат совпадает.
 */
export function replay(seed: number, commands: readonly Command[], content: Content, opts: RunOptions = {}): RunState {
  const state = newRun(seed, content, opts);
  for (const cmd of commands) applyCommand(state, cmd, content);
  return state;
}

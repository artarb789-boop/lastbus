import { applyCommand, type Command } from "./commands";
import type { Content } from "./content";
import { boardPassengers } from "./crew";
import { makeItem } from "./equipment";
import { generateRegion } from "./map/generate";
import { createRng } from "./rng";
import type { RunState } from "./state";

export const DEFAULT_BUS = "bus_city";

export function newRun(seed: number, content: Content, busId: string = DEFAULT_BUS): RunState {
  const busDef = content.buses[busId];
  if (!busDef) throw new Error(`unknown bus ${busId}`);
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
    driver: { status: "healthy" },
    passengers: [],
    nextPassengerId: 1,
    resources: { ...content.balance.startResources },
    contested: [],
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
  boardPassengers(state, content, content.balance.startPassengers);
  return state;
}

/**
 * Воспроизводит забег по seed и списку команд.
 * Команды, которые были отклонены в оригинале, отклоняются и здесь, поэтому результат совпадает.
 */
export function replay(seed: number, commands: readonly Command[], content: Content, busId: string = DEFAULT_BUS): RunState {
  const state = newRun(seed, content, busId);
  for (const cmd of commands) applyCommand(state, cmd, content);
  return state;
}

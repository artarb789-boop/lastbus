import { applyCommand, type Command } from "./commands";
import { boardPassengers } from "./crew";
import { generateRegion } from "./map/generate";
import { createRng } from "./rng";
import type { RunState } from "./state";
import { BUS_CITY, START_PASSENGERS, START_RESOURCES, TANK_MAX } from "./stubs";

export function newRun(seed: number): RunState {
  const rng = createRng(seed);
  const map = generateRegion(rng);
  const state: RunState = {
    version: 1,
    seed,
    rng,
    map,
    nodeId: map.startId,
    legs: 0,
    bus: structuredClone(BUS_CITY),
    tankMax: TANK_MAX,
    driver: { status: "healthy" },
    passengers: [],
    nextPassengerId: 1,
    resources: { ...START_RESOURCES },
    phase: { type: "route" },
    stats: { delivered: 0, tokensFromFares: 0, died: 0, droppedEarly: 0, boarded: 0, stopsVisited: 0 },
    log: [],
  };
  boardPassengers(state, START_PASSENGERS);
  return state;
}

/**
 * Воспроизводит забег по seed и списку команд.
 * Команды, которые были отклонены в оригинале, отклоняются и здесь, поэтому результат совпадает.
 */
export function replay(seed: number, commands: readonly Command[]): RunState {
  const state = newRun(seed);
  for (const cmd of commands) applyCommand(state, cmd);
  return state;
}

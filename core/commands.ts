/**
 * Команды — единственный способ изменить состояние забега.
 * Клиент и боты только отправляют команды, поэтому забег воспроизводится по seed и списку команд.
 */
import { fuelCost } from "./bus";
import {
  boardPassengers,
  deliver,
  dropEarly,
  feedIfDue,
  harm,
  movePassenger,
  tickTicketsAndExit,
} from "./crew";
import { log } from "./log";
import { findEdge, findNode, outgoingEdges } from "./map/generate";
import { resolveBossStub, resolveEncounterStub, resolveIncidentStub, resolveSpecialStub } from "./placeholders";
import { chance, int, weighted } from "./rng";
import type { MapEdge, ResourceKind, RunState, ShopVisit, StopKind } from "./state";
import { STOP_KINDS } from "./state";
import { BOARDING, CHECKPOINT_TOLL, SHOP_STOCK, STOP_ACTIONS, TANK_MAX } from "./stubs";

export type Command =
  | { type: "chooseRoute"; edgeId: string }
  | { type: "buy"; offerIndex: number }
  | { type: "leaveShop" }
  | { type: "scavenge"; passengerIds: string[] }
  | { type: "heal" }
  | { type: "dropPassenger"; passengerId: string }
  | { type: "seatPassenger"; passengerId: string; seatId: string }
  | { type: "leaveStop" };

export type CommandResult = { ok: true } | { ok: false; error: string };

const OK: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

export function isStopKind(kind: string): kind is StopKind {
  return (STOP_KINDS as readonly string[]).includes(kind);
}

export function applyCommand(state: RunState, cmd: Command): CommandResult {
  if (state.phase.type === "over") return fail("run_over");

  switch (cmd.type) {
    case "chooseRoute":
      return chooseRoute(state, cmd.edgeId);
    case "buy":
      return buy(state, cmd.offerIndex);
    case "leaveShop":
      return leaveShop(state);
    case "scavenge":
      return scavenge(state, cmd.passengerIds);
    case "heal":
      return heal(state);
    case "dropPassenger":
      return dropPassengerCmd(state, cmd.passengerId);
    case "seatPassenger":
      return seatPassengerCmd(state, cmd.passengerId, cmd.seatId);
    case "leaveStop":
      return leaveStop(state);
  }
}

// ---------- Маршрут и дорога ----------

function chooseRoute(state: RunState, edgeId: string): CommandResult {
  if (state.phase.type !== "route") return fail("wrong_phase");
  const edge = findEdge(state.map, edgeId);
  if (!edge || edge.from !== state.nodeId) return fail("bad_edge");
  // Без магазина на перегоне ехать можно только с запасом топлива.
  if (!edge.shop && state.resources.fuel < fuelCost(state, edge)) return fail("not_enough_fuel");

  if (edge.shop) {
    state.phase = { type: "shop", visit: openShop(state, edge) };
    log(state, `entered shop ${edge.shop} on ${edge.id}`);
    return OK;
  }
  travel(state, edge);
  return OK;
}

function travel(state: RunState, edge: MapEdge): void {
  const cost = fuelCost(state, edge);
  if (state.resources.fuel < cost) {
    state.phase = { type: "over", result: "lost", reason: "out_of_fuel" };
    log(state, `stranded on ${edge.id}: need ${cost} fuel, have ${state.resources.fuel}`);
    return;
  }
  state.resources.fuel -= cost;
  state.legs += 1;
  state.nodeId = edge.to;
  log(state, `drove ${edge.road} to ${edge.to} (−${cost} fuel)`);

  feedIfDue(state);
  if (state.phase.type === "over") return;
  arrive(state);
}

function arrive(state: RunState): void {
  const node = findNode(state.map, state.nodeId);
  const kind = node.kind;

  if (kind === "boss") {
    if (resolveBossStub(state)) {
      // Конец региона в M0 = Конечная: все оставшиеся выходят и платят за проеханное.
      for (const p of [...state.passengers]) deliver(state, p);
      state.phase = { type: "over", result: "won", reason: "boss_defeated" };
    } else {
      state.phase = { type: "over", result: "lost", reason: "boss" };
    }
    return;
  }

  if (kind === "encounter") {
    resolveEncounterStub(state);
    enterRoutePhase(state);
    return;
  }
  if (kind === "incident") {
    resolveIncidentStub(state);
    enterRoutePhase(state);
    return;
  }

  if (isStopKind(kind)) {
    state.stats.stopsVisited += 1;
    tickTicketsAndExit(state);
    const range = BOARDING[kind] ?? [0, 0];
    boardPassengers(state, int(state.rng, range[0], range[1]));

    let actions = STOP_ACTIONS;
    if (kind === "checkpoint") {
      if (state.resources.tokens >= CHECKPOINT_TOLL) {
        state.resources.tokens -= CHECKPOINT_TOLL;
        log(state, `paid checkpoint toll ${CHECKPOINT_TOLL}`);
      } else {
        actions -= 1;
        log(state, "no toll money: lost an action at checkpoint");
      }
    }
    if (kind === "special") resolveSpecialStub(state);

    state.phase = { type: "stop", actionsLeft: actions };
    return;
  }

  // "start" не бывает целью перегона.
  enterRoutePhase(state);
}

/** Переход к выбору маршрута с проверкой, что автобус вообще может ехать дальше. */
function enterRoutePhase(state: RunState): void {
  if (state.phase.type === "over") return;
  state.phase = { type: "route" };
  const options = outgoingEdges(state.map, state.nodeId);
  const canMove = options.some((e) => e.shop !== null || state.resources.fuel >= fuelCost(state, e));
  if (!canMove) {
    state.phase = { type: "over", result: "lost", reason: "out_of_fuel" };
    log(state, "stranded: no affordable road and no shop ahead");
  }
}

// ---------- Магазин ----------

function openShop(state: RunState, edge: MapEdge): ShopVisit {
  const kind = edge.shop!;
  const offers = SHOP_STOCK[kind].map((s) => ({
    resource: s.resource,
    amount: int(state.rng, s.amount[0], s.amount[1]),
    price: s.price,
    sold: false,
  }));
  return { kind, offers, edgeId: edge.id };
}

function buy(state: RunState, offerIndex: number): CommandResult {
  if (state.phase.type !== "shop") return fail("wrong_phase");
  const offer = state.phase.visit.offers[offerIndex];
  if (!offer) return fail("bad_offer");
  if (offer.sold) return fail("sold_out");
  if (state.resources.tokens < offer.price) return fail("not_enough_tokens");
  state.resources.tokens -= offer.price;
  const room = offer.resource === "fuel" ? Math.max(0, TANK_MAX - state.resources.fuel) : Infinity;
  state.resources[offer.resource] += Math.min(offer.amount, room);
  offer.sold = true;
  log(state, `bought ${offer.amount} ${offer.resource} for ${offer.price}`);
  return OK;
}

function leaveShop(state: RunState): CommandResult {
  if (state.phase.type !== "shop") return fail("wrong_phase");
  const edge = findEdge(state.map, state.phase.visit.edgeId)!;
  travel(state, edge);
  return OK;
}

// ---------- Остановка ----------

const SCAVENGE_TABLE: Record<StopKind, { item: ResourceKind; weight: number }[]> = {
  village: [
    { item: "food", weight: 4 },
    { item: "fuel", weight: 2 },
    { item: "medkits", weight: 1 },
    { item: "tokens", weight: 2 },
  ],
  garage: [
    { item: "parts", weight: 4 },
    { item: "fuel", weight: 3 },
  ],
  junkyard: [
    { item: "parts", weight: 5 },
    { item: "ammo", weight: 2 },
    { item: "fuel", weight: 1 },
  ],
  checkpoint: [
    { item: "ammo", weight: 3 },
    { item: "food", weight: 1 },
  ],
  special: [
    { item: "fuel", weight: 1 },
    { item: "food", weight: 1 },
    { item: "parts", weight: 1 },
    { item: "ammo", weight: 1 },
    { item: "medkits", weight: 1 },
  ],
};

const SCAVENGE_RISK: Record<StopKind, number> = {
  village: 0.1,
  garage: 0.1,
  junkyard: 0.25,
  checkpoint: 0.2,
  special: 0.15,
};

function spendAction(state: RunState): CommandResult | null {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  if (state.phase.actionsLeft <= 0) return fail("no_actions_left");
  state.phase.actionsLeft -= 1;
  return null;
}

function scavenge(state: RunState, passengerIds: string[]): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  const ids = [...new Set(passengerIds)];
  if (ids.length < 1 || ids.length > 3) return fail("scavenge_needs_1_to_3");
  const team = ids.map((id) => state.passengers.find((p) => p.id === id));
  if (team.some((p) => !p || p.status !== "healthy")) return fail("scavenger_not_healthy");

  const err = spendAction(state);
  if (err) return err;

  const kind = findNode(state.map, state.nodeId).kind as StopKind;
  const found: Partial<Record<ResourceKind, number>> = {};
  for (const p of team) {
    const res = weighted(state.rng, SCAVENGE_TABLE[kind]);
    const amount = res === "fuel" ? int(state.rng, 3, 6) : int(state.rng, 1, 3);
    state.resources[res] += amount;
    found[res] = (found[res] ?? 0) + amount;
    if (chance(state.rng, SCAVENGE_RISK[kind])) harm(state, p!, "scavenge");
  }
  state.resources.fuel = Math.min(state.resources.fuel, TANK_MAX);
  log(state, `scavenged with ${ids.length}: ${JSON.stringify(found)}`);
  return OK;
}

function heal(state: RunState): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  const wounded = state.passengers.filter((p) => p.status === "wounded");
  const driverWounded = state.driver.status === "wounded";
  if (!driverWounded && wounded.length === 0) return fail("nobody_wounded");
  if (state.resources.medkits < 1) return fail("no_medkits");

  const err = spendAction(state);
  if (err) return err;

  let healed = 0;
  if (driverWounded && state.resources.medkits > 0) {
    state.driver.status = "healthy";
    state.resources.medkits -= 1;
    healed++;
  }
  for (const p of wounded) {
    if (healed >= 2 || state.resources.medkits < 1) break;
    p.status = "healthy";
    state.resources.medkits -= 1;
    healed++;
  }
  log(state, `healed ${healed}`);
  return OK;
}

function dropPassengerCmd(state: RunState, passengerId: string): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  return dropEarly(state, passengerId) ? OK : fail("unknown_passenger");
}

function seatPassengerCmd(state: RunState, passengerId: string, seatId: string): CommandResult {
  if (state.phase.type !== "stop" && state.phase.type !== "route") return fail("wrong_phase");
  const err = movePassenger(state, passengerId, seatId);
  return err ? fail(err) : OK;
}

function leaveStop(state: RunState): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  enterRoutePhase(state);
  return OK;
}

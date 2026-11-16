/**
 * Команды — единственный способ изменить состояние забега.
 * Клиент и боты только отправляют команды, поэтому забег воспроизводится по seed и списку команд.
 * Отклонённая команда не меняет состояние.
 */
import { fuelCost } from "./bus";
import type { Content } from "./content";
import {
  boardPassengers,
  deliver,
  dropEarly,
  feedIfDue,
  harm,
  movePassenger,
  navigatorManned,
  tickTicketsAndExit,
} from "./crew";
import {
  fits,
  healCapacity,
  installCost,
  itemDef,
  itemsOfKinds,
  locateItem,
  makeItem,
  mechanicAfterLeg,
  repairCost,
  slotDef,
  tankMax,
  wearAfterLeg,
} from "./equipment";
import { availableChoices, eventDef, pickEvent, resolveChoice as resolveEventChoice } from "./events";
import { log } from "./log";
import { findEdge, findNode, outgoingEdges } from "./map/generate";
import { canEscape, combatTick, startCombat } from "./combat/engine";
import type { EnemyKind } from "./content";
import { freeSeats } from "./crew";
import { afterNemesisFight, nemesisDef, nemesisDue } from "./nemesis";
import { leakAfterLeg, repairTankCost, repairTankFull } from "./tank";
import { chance, int, pick, weighted } from "./rng";
import type { BusSystem, CombatResult, CombatSource, CombatState, EventContinuation, LootOffer, Maneuver, MapEdge, MechanicFocus, Pace, ResourceKind, Resources, RunState, ShopOffer, ShopVisit, StopKind, TargetRef } from "./state";
import { RESOURCE_KINDS, STOP_KINDS } from "./state";

export type RepairableSystem = BusSystem | "hull" | "tank";

export type Command =
  | { type: "chooseRoute"; edgeId: string; pace?: Pace }
  | { type: "buy"; offerIndex: number }
  | { type: "sell"; uid: string }
  | { type: "leaveShop" }
  | { type: "resolveChoice"; choiceIndex: number }
  | { type: "scavenge"; passengerIds: string[] }
  | { type: "heal" }
  | { type: "repair"; uid: string }
  | { type: "repairSystem"; system: RepairableSystem }
  /** enemy — индекс врага в банде (по умолчанию тот же, что сейчас). */
  | { type: "setTarget"; slotId: string; target: TargetRef; enemy?: number }
  | { type: "setManeuver"; maneuver: Maneuver }
  /** Залатать оружие в бою за запчасти: +1 прочности. */
  | { type: "fieldRepair"; slotId: string }
  | { type: "setMechanicFocus"; focus: MechanicFocus }
  | { type: "advance"; ticks: number }
  | { type: "escape" }
  | { type: "finishLoot"; itemIndex: number | null; takeSurvivors: boolean }
  | { type: "install"; uid: string; slotId: string }
  | { type: "uninstall"; slotId: string }
  | { type: "dropPassenger"; passengerId: string }
  | { type: "seatPassenger"; passengerId: string; seatId: string }
  | { type: "leaveStop" };

export type CommandResult = { ok: true } | { ok: false; error: string };

const OK: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

export function isStopKind(kind: string): kind is StopKind {
  return (STOP_KINDS as readonly string[]).includes(kind);
}

export function applyCommand(state: RunState, cmd: Command, content: Content): CommandResult {
  if (state.phase.type === "over") return fail("run_over");

  switch (cmd.type) {
    case "chooseRoute":
      return chooseRoute(state, content, cmd.edgeId, cmd.pace ?? "normal");
    case "buy":
      return buy(state, content, cmd.offerIndex);
    case "sell":
      return sell(state, content, cmd.uid);
    case "leaveShop":
      return leaveShop(state, content);
    case "resolveChoice":
      return resolveChoiceCmd(state, content, cmd.choiceIndex);
    case "scavenge":
      return scavenge(state, content, cmd.passengerIds);
    case "heal":
      return heal(state, content);
    case "repair":
      return repair(state, content, cmd.uid);
    case "repairSystem":
      return repairSystemCmd(state, content, cmd.system);
    case "setTarget":
      return setTargetCmd(state, cmd.slotId, cmd.target, cmd.enemy);
    case "setManeuver":
      return setManeuverCmd(state, cmd.maneuver);
    case "fieldRepair":
      return fieldRepairCmd(state, content, cmd.slotId);
    case "setMechanicFocus":
      return setMechanicFocusCmd(state, cmd.focus);
    case "advance":
      return advanceCmd(state, content, cmd.ticks);
    case "escape":
      return escapeCmd(state, content);
    case "finishLoot":
      return finishLootCmd(state, content, cmd.itemIndex, cmd.takeSurvivors);
    case "install":
      return install(state, content, cmd.uid, cmd.slotId);
    case "uninstall":
      return uninstall(state, cmd.slotId);
    case "dropPassenger":
      return dropPassengerCmd(state, cmd.passengerId);
    case "seatPassenger":
      return seatPassengerCmd(state, cmd.passengerId, cmd.seatId);
    case "leaveStop":
      return leaveStop(state, content);
  }
}

// ---------- Карта ----------

/** До какого столбца карты видны типы узлов. Штурман видит дальше. */
export function visibleUntilColumn(state: RunState, content: Content): number {
  const v = content.balance.visibility;
  return findNode(state.map, state.nodeId).column + v.base + (navigatorManned(state) ? v.navigatorBonus : 0);
}

// ---------- Маршрут и дорога ----------

function chooseRoute(state: RunState, content: Content, edgeId: string, pace: Pace): CommandResult {
  if (state.phase.type !== "route") return fail("wrong_phase");
  const edge = findEdge(state.map, edgeId);
  if (!edge || edge.from !== state.nodeId) return fail("bad_edge");
  if (pace !== "normal" && !state.contested.includes(edge.to)) return fail("not_contested");
  // Без магазина на перегоне ехать можно только с запасом топлива.
  if (!edge.shop && state.resources.fuel < fuelCost(state, content, edge, pace)) return fail("not_enough_fuel");

  if (edge.shop) {
    state.phase = { type: "shop", visit: openShop(state, content, edge, pace) };
    log(state, `entered shop ${edge.shop} on ${edge.id}`);
    return OK;
  }
  travel(state, content, edge, pace);
  return OK;
}

function travel(state: RunState, content: Content, edge: MapEdge, pace: Pace): void {
  const cost = fuelCost(state, content, edge, pace);
  if (state.resources.fuel < cost) {
    state.phase = { type: "over", result: "lost", reason: "out_of_fuel" };
    log(state, `stranded on ${edge.id}: need ${cost} fuel, have ${state.resources.fuel}`);
    return;
  }
  state.resources.fuel -= cost;
  state.legs += 1;
  state.nodeId = edge.to;
  log(state, `drove ${edge.road} to ${edge.to} (−${cost} fuel${pace !== "normal" ? `, ${pace}` : ""})`);

  leakAfterLeg(state, content);
  wearAfterLeg(state, content, edge.road);
  mechanicAfterLeg(state, content);
  feedIfDue(state, content);
  if (state.phase.type === "over") return;

  // В пути: заклятый соперник, дорожное событие или засада. Перед боссом — ничего из этого.
  const target = findNode(state.map, edge.to);
  if (target.kind !== "boss" && nemesisDue(state, content, target.column)) {
    const combat = startCombat(state, content, nemesisDef(state, content), "nemesis", state.nemesis.nameKey);
    state.phase = { type: "combat", combat, then: { type: "arrive", pace } };
    return;
  }
  if (target.kind !== "boss") {
    if (chance(state.rng, content.balance.roadEventChance)) {
      const ev = pickEvent(state, content, "road", { road: edge.road });
      if (ev) {
        openEvent(state, ev.id, { type: "arrive", pace });
        return;
      }
    }
    if (chance(state.rng, content.balance.combat.ambushChance)) {
      beginCombat(state, content, ["raider"], "ambush", { type: "arrive", pace });
      return;
    }
  }
  reachNode(state, content, pace);
}

/** Подъезд к узлу. Перехват спорной остановки — бой с соперником до прибытия. */
function reachNode(state: RunState, content: Content, pace: Pace): void {
  if (pace === "intercept" && state.contested.includes(state.nodeId)) {
    beginCombat(state, content, ["rival"], "intercept", { type: "interceptArrive" });
    return;
  }
  arrive(state, content, pace);
}

function openEvent(state: RunState, eventId: string, then: EventContinuation): void {
  state.stats.eventsSeen += 1;
  state.phase = { type: "event", eventId, then };
  log(state, `event ${eventId}`);
}

function arrive(state: RunState, content: Content, pace: Pace): void {
  const node = findNode(state.map, state.nodeId);
  const kind = node.kind;
  const wasContested = state.contested.includes(node.id);
  state.contested = [];

  if (kind === "boss") {
    beginCombat(state, content, ["boss"], "boss", { type: "regionEnd" });
    return;
  }

  if (kind === "encounter") {
    beginEncounter(state, content);
    return;
  }

  if (kind === "incident") {
    const ev = pickEvent(state, content, "road", { nodeKind: "incident" });
    if (ev) openEvent(state, ev.id, { type: "route" });
    else enterRoutePhase(state, content);
    return;
  }

  if (isStopKind(kind)) {
    const b = content.balance;
    state.stats.stopsVisited += 1;
    tickTicketsAndExit(state, content);
    const [lo, hi] = b.boarding[kind];
    boardPassengers(state, content, int(state.rng, lo, hi));

    let actions = b.stopActions;
    if (wasContested) {
      state.stats.racesContested += 1;
      // Перехват уже разыгран боем до прибытия: победа даёт pace "rush", иначе "normal".
      if (pace === "rush") {
        log(state, "beat the rival to the stop");
      } else {
        actions = Math.min(actions, b.contestedActions);
        log(state, "rival got here first");
      }
    }

    if (kind === "checkpoint") {
      if (state.resources.tokens >= b.checkpointToll) {
        state.resources.tokens -= b.checkpointToll;
        log(state, `paid checkpoint toll ${b.checkpointToll}`);
      } else {
        actions = Math.max(0, actions - 1);
        log(state, "no toll money: lost an action at checkpoint");
      }
    }

    // Особая остановка — событие всегда; обычная — случайное событие с шансом stopEventChance.
    const eventKind = kind === "special" ? "special" : chance(state.rng, b.stopEventChance) ? "stop" : null;
    if (eventKind) {
      const ev = pickEvent(state, content, eventKind, { nodeKind: kind });
      if (ev) {
        openEvent(state, ev.id, { type: "stop", actionsLeft: actions });
        return;
      }
    }
    state.phase = { type: "stop", actionsLeft: actions };
    return;
  }

  // "start" не бывает целью перегона.
  enterRoutePhase(state, content);
}

/** Переход к выбору маршрута: соперники выбирают цели, проверяем, что ехать вообще можно. */
function enterRoutePhase(state: RunState, content: Content): void {
  if (state.phase.type === "over") return;
  state.phase = { type: "route" };
  const options = outgoingEdges(state.map, state.nodeId);

  // Соперники едут к некоторым остановкам впереди (GDD 9.3). Бросок на каждую цель, в порядке перегонов.
  const targets = [...new Set(options.map((e) => e.to))];
  state.contested = targets.filter(
    (id) => chance(state.rng, content.balance.rivalChance) && isStopKind(findNode(state.map, id).kind),
  );

  const canMove = options.some((e) => e.shop !== null || state.resources.fuel >= fuelCost(state, content, e));
  if (!canMove) {
    state.phase = { type: "over", result: "lost", reason: "out_of_fuel" };
    log(state, "stranded: no affordable road and no shop ahead");
  }
}

// ---------- События ----------

function resolveChoiceCmd(state: RunState, content: Content, choiceIndex: number): CommandResult {
  if (state.phase.type !== "event") return fail("wrong_phase");
  const ev = eventDef(content, state.phase.eventId);
  const choice = ev.choices[choiceIndex];
  if (!choice) return fail("bad_choice");
  if (!availableChoices(state, content, ev).includes(choiceIndex)) return fail("choice_unavailable");

  const then = resolveEventChoice(state, content, choice, state.phase.then);
  if (state.phase.type !== "event") return OK; // эффект мог закончить забег
  continueAfter(state, content, then, null);
  return OK;
}

/** Что дальше после события или боя. */
function continueAfter(state: RunState, content: Content, then: EventContinuation, result: CombatResult | null): void {
  switch (then.type) {
    case "arrive":
      reachNode(state, content, then.pace);
      return;
    case "route":
      enterRoutePhase(state, content);
      return;
    case "stop":
      state.phase = { type: "stop", actionsLeft: then.actionsLeft };
      return;
    case "interceptArrive":
      arrive(state, content, result === "won" || result === "surrendered" ? "rush" : "normal");
      return;
    case "regionEnd":
      // Конец региона = Конечная: все оставшиеся выходят и платят за проеханное.
      for (const p of [...state.passengers]) deliver(state, content, p);
      state.phase = { type: "over", result: "won", reason: "boss_defeated" };
      return;
  }
}

// ---------- Бой ----------

function pickEnemy(state: RunState, content: Content, kinds: EnemyKind[]): string {
  const pool = Object.values(content.enemies)
    .filter((e) => kinds.includes(e.kind) && e.tier <= 1)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length === 0) throw new Error(`no enemies of kinds ${kinds.join(",")}`);
  return weighted(state.rng, pool.map((e) => ({ item: e.id, weight: e.weight })));
}

function beginCombat(state: RunState, content: Content, kinds: EnemyKind[], source: CombatSource, then: EventContinuation): void {
  const combat = startCombat(state, content, pickEnemy(state, content, kinds), source);
  state.phase = { type: "combat", combat, then };
}

/** Встреча на дороге: дальше по карте вместо одного автобуса может выйти банда из двух. */
function beginEncounter(state: RunState, content: Content): void {
  const g = content.balance.gangs;
  const column = findNode(state.map, state.nodeId).column;
  if (g.pairs.length > 0 && column >= g.minColumn && chance(state.rng, g.chance)) {
    const pair = pick(state.rng, g.pairs);
    const combat = startCombat(state, content, pair, "encounter");
    // Банда слабее поодиночке: каждый автобус легче обычного.
    for (const e of combat.enemies) {
      e.hull.max = Math.max(1, Math.round(e.hull.max * g.hullMult));
      e.hull.hp = e.hull.max;
    }
    state.phase = { type: "combat", combat, then: { type: "route" } };
    return;
  }
  beginCombat(state, content, ["raider", "rival"], "encounter", { type: "route" });
}

const SYSTEM_TARGETS = new Set(["hull", "engine", "wheels", "cabin", "tank"]);

function setTargetCmd(state: RunState, slotId: string, target: TargetRef, enemy?: number): CommandResult {
  if (state.phase.type !== "combat") return fail("wrong_phase");
  const combat = state.phase.combat;
  const w = combat.weapons.find((x) => x.slotId === slotId);
  if (!w) return fail("unknown_weapon");
  const enemyIndex = enemy ?? w.enemy;
  const foe = combat.enemies[enemyIndex];
  if (!foe || foe.out !== null) return fail("bad_target");
  if (!SYSTEM_TARGETS.has(target)) {
    const idx = target.startsWith("weapon:") ? Number(target.slice(7)) : NaN;
    if (!Number.isInteger(idx) || !foe.weapons[idx]) return fail("bad_target");
  }
  w.enemy = enemyIndex;
  w.target = target;
  return OK;
}

function setManeuverCmd(state: RunState, maneuver: Maneuver): CommandResult {
  if (state.phase.type !== "combat") return fail("wrong_phase");
  if (maneuver !== "approach" && maneuver !== "hold" && maneuver !== "retreat") return fail("bad_maneuver");
  state.phase.combat.maneuver = maneuver;
  return OK;
}

function fieldRepairCmd(state: RunState, content: Content, slotId: string): CommandResult {
  if (state.phase.type !== "combat") return fail("wrong_phase");
  const inst = state.equipment[slotId];
  const def = inst ? content.items[inst.itemId] : undefined;
  if (!inst || def?.kind !== "weapon") return fail("unknown_weapon");
  if (inst.durability >= def.durability) return fail("not_damaged");
  const cost = content.balance.combat.fieldRepairParts;
  if (state.resources.parts < cost) return fail("not_enough_parts");
  state.resources.parts -= cost;
  inst.durability++;
  log(state, `field repair ${inst.itemId} +1 (-${cost} parts)`);
  return OK;
}

function setMechanicFocusCmd(state: RunState, focus: MechanicFocus): CommandResult {
  if (state.phase.type !== "combat") return fail("wrong_phase");
  if (focus !== "systems" && focus !== "weapons") return fail("bad_focus");
  state.phase.combat.mechanicFocus = focus;
  return OK;
}

function advanceCmd(state: RunState, content: Content, ticks: number): CommandResult {
  if (state.phase.type !== "combat") return fail("wrong_phase");
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 200) return fail("bad_ticks");
  const { combat, then } = state.phase;
  for (let k = 0; k < ticks; k++) {
    const result = combatTick(state, content, combat);
    if (result) {
      endCombat(state, content, combat, then, result);
      break;
    }
  }
  return OK;
}

function escapeCmd(state: RunState, content: Content): CommandResult {
  if (state.phase.type !== "combat") return fail("wrong_phase");
  const { combat, then } = state.phase;
  if (!canEscape(combat, content)) return fail("cannot_escape");
  endCombat(state, content, combat, then, "escaped");
  return OK;
}

/** Трофеи со всех разбитых (целиком) и сдавшихся (половина) врагов. */
function rollLoot(state: RunState, content: Content, combat: CombatState): Partial<Resources> {
  const got: Partial<Resources> = {};
  const fuelBefore = state.resources.fuel;
  for (const e of combat.enemies) {
    const share = e.out === "destroyed" ? 1 : e.out === "surrendered" ? 0.5 : 0;
    if (share === 0) continue;
    for (const k of RESOURCE_KINDS) {
      const r = e.def.loot.resources[k];
      if (!r) continue;
      const amount = Math.floor(int(state.rng, r[0], r[1]) * share);
      if (amount <= 0) continue;
      state.resources[k] += amount;
      got[k] = (got[k] ?? 0) + amount;
    }
  }
  // Топливо сверх бака не заливается.
  state.resources.fuel = Math.min(state.resources.fuel, Math.max(tankMax(state, content), fuelBefore));
  return got;
}

function endCombat(state: RunState, content: Content, combat: CombatState, then: EventContinuation, result: CombatResult): void {
  state.stats.fightTicks += combat.tick;
  log(state, `combat ended: ${result} after ${combat.tick} ticks`);
  if (result === "lost") {
    if (state.phase.type !== "over") state.phase = { type: "over", result: "lost", reason: "destroyed" };
    return;
  }
  if (result === "escaped") state.stats.escapes += 1;
  const extraItems = combat.source === "nemesis" ? afterNemesisFight(state, content, result) : [];
  if (result === "won" || result === "surrendered") {
    state.stats.fightsWon += 1;
    const destroyed = combat.enemies.filter((e) => e.out === "destroyed");
    const loot: LootOffer = {
      resources: rollLoot(state, content, combat),
      // С разбитых автобусов можно снять уцелевшее оружие (GDD 8.5).
      items: [...new Set([...extraItems, ...destroyed.flatMap((e) => e.weapons.filter((w) => w.hp > 0).map((w) => w.itemId))])],
      survivors: destroyed.reduce((sum, e) => sum + int(state.rng, e.def.loot.survivors[0], e.def.loot.survivors[1]), 0),
    };
    state.phase = { type: "loot", loot, result, then };
    return;
  }
  continueAfter(state, content, then, result);
}

function finishLootCmd(state: RunState, content: Content, itemIndex: number | null, takeSurvivors: boolean): CommandResult {
  if (state.phase.type !== "loot") return fail("wrong_phase");
  const { loot, result, then } = state.phase;
  if (itemIndex !== null) {
    const itemId = loot.items[itemIndex];
    if (!itemId) return fail("bad_item");
    state.inventory.push(makeItem(state, content, itemId));
    state.stats.itemsGained += 1;
    log(state, `trophy: ${itemId}`);
  }
  if (takeSurvivors && loot.survivors > 0) {
    boardPassengers(state, content, Math.min(loot.survivors, freeSeats(state).length));
  }
  continueAfter(state, content, then, result);
  return OK;
}

// ---------- Магазин ----------

function openShop(state: RunState, content: Content, edge: MapEdge, pace: Pace): ShopVisit {
  const kind = edge.shop!;
  const offers: ShopOffer[] = [];
  for (const st of content.shops[kind].stock) {
    if (st.type === "resource") {
      offers.push({ type: "resource", resource: st.resource, amount: int(state.rng, st.amount[0], st.amount[1]), price: st.price, sold: false });
    } else {
      const pool = itemsOfKinds(content, st.itemKinds);
      const count = int(state.rng, st.count[0], st.count[1]);
      for (let k = 0; k < count; k++) {
        const def = pick(state.rng, pool);
        offers.push({ type: "item", itemId: def.id, price: Math.ceil(def.price * st.priceMult), sold: false });
      }
    }
  }
  return { kind, offers, edgeId: edge.id, pace };
}

function buy(state: RunState, content: Content, offerIndex: number): CommandResult {
  if (state.phase.type !== "shop") return fail("wrong_phase");
  const offer = state.phase.visit.offers[offerIndex];
  if (!offer) return fail("bad_offer");
  if (offer.sold) return fail("sold_out");
  if (state.resources.tokens < offer.price) return fail("not_enough_tokens");
  state.resources.tokens -= offer.price;
  offer.sold = true;
  if (offer.type === "resource") {
    const room = offer.resource === "fuel" ? Math.max(0, tankMax(state, content) - state.resources.fuel) : Infinity;
    state.resources[offer.resource] += Math.min(offer.amount, room);
    log(state, `bought ${offer.amount} ${offer.resource} for ${offer.price}`);
  } else {
    state.inventory.push(makeItem(state, content, offer.itemId));
    state.stats.itemsGained += 1;
    log(state, `bought ${offer.itemId} for ${offer.price}`);
  }
  return OK;
}

function sell(state: RunState, content: Content, uid: string): CommandResult {
  if (state.phase.type !== "shop") return fail("wrong_phase");
  const loc = locateItem(state, uid);
  if (!loc) return fail("unknown_item");
  const price = Math.floor(itemDef(content, loc.inst).price * content.balance.sellMult);
  if (loc.where === "slot") state.equipment[loc.slotId] = null;
  else state.inventory.splice(loc.index, 1);
  state.resources.tokens += price;
  log(state, `sold ${loc.inst.itemId} for ${price}`);
  return OK;
}

function leaveShop(state: RunState, content: Content): CommandResult {
  if (state.phase.type !== "shop") return fail("wrong_phase");
  const { edgeId, pace } = state.phase.visit;
  travel(state, content, findEdge(state.map, edgeId)!, pace);
  return OK;
}

// ---------- Снаряжение ----------

function atGarage(state: RunState): boolean {
  return state.phase.type === "stop" && findNode(state.map, state.nodeId).kind === "garage";
}

function install(state: RunState, content: Content, uid: string, slotId: string): CommandResult {
  const inShop = state.phase.type === "shop";
  if (state.phase.type !== "stop" && !inShop) return fail("wrong_phase");
  const loc = locateItem(state, uid);
  if (!loc) return fail("unknown_item");
  if (loc.where !== "inventory") return fail("item_already_installed");
  const slot = slotDef(state, slotId);
  if (!slot) return fail("unknown_slot");
  const def = itemDef(content, loc.inst);
  if (!fits(def, slot)) return fail("does_not_fit");
  const cost = installCost(content, def, atGarage(state));
  if (state.resources.parts < cost) return fail("not_enough_parts");
  if (state.phase.type === "stop") {
    if (state.phase.actionsLeft <= 0) return fail("no_actions_left");
    state.phase.actionsLeft -= 1;
  }
  state.resources.parts -= cost;
  state.inventory.splice(loc.index, 1);
  const old = state.equipment[slotId];
  if (old) state.inventory.push(old);
  state.equipment[slotId] = loc.inst;
  log(state, `installed ${def.id} in ${slotId} (−${cost} parts)${old ? `, ${old.itemId} to cargo` : ""}`);
  return OK;
}

function uninstall(state: RunState, slotId: string): CommandResult {
  if (state.phase.type !== "stop" && state.phase.type !== "shop" && state.phase.type !== "route") return fail("wrong_phase");
  if (!slotDef(state, slotId)) return fail("unknown_slot");
  const inst = state.equipment[slotId];
  if (!inst) return fail("slot_empty");
  state.equipment[slotId] = null;
  state.inventory.push(inst);
  log(state, `uninstalled ${inst.itemId} from ${slotId}`);
  return OK;
}

function repair(state: RunState, content: Content, uid: string): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  const loc = locateItem(state, uid);
  if (!loc) return fail("unknown_item");
  const def = itemDef(content, loc.inst);
  if (loc.inst.durability >= def.durability) return fail("not_damaged");
  const cost = repairCost(content, loc.inst, atGarage(state));
  if (state.resources.parts < cost) return fail("not_enough_parts");
  const err = spendAction(state);
  if (err) return err;
  state.resources.parts -= cost;
  loc.inst.durability = def.durability;
  log(state, `repaired ${def.id} (−${cost} parts)`);
  return OK;
}

/** Стоимость ремонта системы автобуса в запчастях. 0 — чинить нечего. */
export function systemRepairCost(state: RunState, content: Content, system: RepairableSystem, garage: boolean): number {
  if (system === "tank") return repairTankCost(state, content, garage);
  const sys = system === "hull" ? state.hull : state.systems[system];
  const missing = sys.max - sys.hp;
  if (missing <= 0) return 0;
  const base = Math.max(1, Math.ceil(missing / content.balance.repairDurabilityPerPart));
  return Math.max(1, Math.ceil(base * (garage ? content.balance.garagePartsMult : 1)));
}

function repairSystemCmd(state: RunState, content: Content, system: RepairableSystem): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  if (!["hull", "engine", "wheels", "cabin", "tank"].includes(system)) return fail("unknown_system");
  const cost = systemRepairCost(state, content, system, atGarage(state));
  if (cost === 0) return fail("not_damaged");
  if (state.resources.parts < cost) return fail("not_enough_parts");
  const err = spendAction(state);
  if (err) return err;
  state.resources.parts -= cost;
  if (system === "tank") repairTankFull(state);
  else {
    const sys = system === "hull" ? state.hull : state.systems[system];
    sys.hp = sys.max;
  }
  log(state, `repaired ${system} (−${cost} parts)`);
  return OK;
}

// ---------- Остановка ----------

function spendAction(state: RunState): CommandResult | null {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  if (state.phase.actionsLeft <= 0) return fail("no_actions_left");
  state.phase.actionsLeft -= 1;
  return null;
}

function scavenge(state: RunState, content: Content, passengerIds: string[]): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  if (state.phase.actionsLeft <= 0) return fail("no_actions_left");
  const ids = [...new Set(passengerIds)];
  if (ids.length < 1 || ids.length > 3) return fail("scavenge_needs_1_to_3");
  const team = ids.map((id) => state.passengers.find((p) => p.id === id));
  if (team.some((p) => !p || p.status !== "healthy")) return fail("scavenger_not_healthy");

  spendAction(state);
  const kind = findNode(state.map, state.nodeId).kind as StopKind;
  const table = (Object.entries(content.balance.scavengeTables[kind]) as [ResourceKind, number][])
    .filter(([, w]) => w > 0)
    .map(([item, weight]) => ({ item, weight }));
  const found: Partial<Record<ResourceKind, number>> = {};
  for (const p of team) {
    const res = weighted(state.rng, table);
    const amount = res === "fuel" ? int(state.rng, 3, 6) : int(state.rng, 1, 3);
    state.resources[res] += amount;
    found[res] = (found[res] ?? 0) + amount;
    if (chance(state.rng, content.balance.scavengeRisk[kind])) harm(state, p!, "scavenge");
  }
  state.resources.fuel = Math.min(state.resources.fuel, tankMax(state, content));
  log(state, `scavenged with ${ids.length}: ${JSON.stringify(found)}`);
  return OK;
}

function heal(state: RunState, content: Content): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  const wounded = state.passengers.filter((p) => p.status === "wounded");
  const driverWounded = state.driver.status === "wounded";
  if (!driverWounded && wounded.length === 0) return fail("nobody_wounded");
  if (state.resources.medkits < 1) return fail("no_medkits");

  const err = spendAction(state);
  if (err) return err;

  const cap = healCapacity(state, content);
  let healed = 0;
  if (driverWounded) {
    state.driver.status = "healthy";
    state.resources.medkits -= 1;
    healed++;
  }
  for (const p of wounded) {
    if (healed >= cap || state.resources.medkits < 1) break;
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
  if (state.phase.type !== "stop" && state.phase.type !== "route" && state.phase.type !== "combat") return fail("wrong_phase");
  const err = movePassenger(state, passengerId, seatId);
  return err ? fail(err) : OK;
}

function leaveStop(state: RunState, content: Content): CommandResult {
  if (state.phase.type !== "stop") return fail("wrong_phase");
  enterRoutePhase(state, content);
  return OK;
}

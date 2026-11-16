/**
 * Движок событий. События описаны данными (data/events), здесь только их исполнение.
 * Новый тип условия или эффекта добавляется сюда, в content.ts и в event.schema.json.
 */
import type { ChoiceRequirement, Content, EventChoice, EventCondition, EventDef, EventEffect, EventKind } from "./content";
import { boardPassengers, harmRandom, healFull, healthyPassengers } from "./crew";
import { damageRandomItems, hasWorkingTag, itemsOfKinds, makeItem, tankMax } from "./equipment";
import { log } from "./log";
import { chance, pick, weighted } from "./rng";
import type { EventContinuation, NodeKind, ResourceKind, RoadType, RunState } from "./state";
import { RESOURCE_KINDS } from "./state";
import { damageTank, repairTankFull } from "./tank";

export interface EventContext {
  road?: RoadType;
  nodeKind?: NodeKind;
}

export function eventDef(content: Content, id: string): EventDef {
  const ev = content.events.find((e) => e.id === id);
  if (!ev) throw new Error(`unknown event ${id}`);
  return ev;
}

function conditionMet(state: RunState, content: Content, cond: EventCondition, ctx: EventContext): boolean {
  switch (cond.type) {
    case "roadType":
      return ctx.road !== undefined && cond.in.includes(ctx.road);
    case "nodeKind":
      return ctx.nodeKind !== undefined && cond.in.includes(ctx.nodeKind);
    case "minPassengers":
      return state.passengers.length >= cond.value;
    case "resourceAtLeast":
      return state.resources[cond.resource] >= cond.value;
    case "hasItemTag":
      return hasWorkingTag(state, content, cond.tag);
  }
}

/** Случайное событие данного вида среди подходящих по условиям. null — подходящих нет. */
export function pickEvent(state: RunState, content: Content, kind: EventKind, ctx: EventContext): EventDef | null {
  const candidates = content.events.filter(
    (e) => e.kind === kind && e.conditions.every((c) => conditionMet(state, content, c, ctx)),
  );
  if (candidates.length === 0) return null;
  return weighted(state.rng, candidates.map((e) => ({ item: e, weight: e.weight })));
}

export function requirementMet(state: RunState, content: Content, req: ChoiceRequirement | undefined): boolean {
  if (!req) return true;
  if (req.healthyPassengers !== undefined && healthyPassengers(state).length < req.healthyPassengers) return false;
  if (req.itemTag !== undefined && !hasWorkingTag(state, content, req.itemTag)) return false;
  for (const [k, v] of Object.entries(req.resources ?? {})) {
    if (state.resources[k as ResourceKind] < (v ?? 0)) return false;
  }
  return true;
}

export function availableChoices(state: RunState, content: Content, ev: EventDef): number[] {
  return ev.choices.map((ch, i) => (requirementMet(state, content, ch.requires) ? i : -1)).filter((i) => i >= 0);
}

/** Применяет вариант события и возвращает (возможно изменённое) продолжение. */
export function resolveChoice(
  state: RunState,
  content: Content,
  choice: EventChoice,
  then: EventContinuation,
): EventContinuation {
  let effects: EventEffect[];
  if (choice.check) {
    const ok = chance(state.rng, choice.check.chance);
    log(state, `check ${ok ? "succeeded" : "failed"} (p=${choice.check.chance})`);
    effects = (ok ? choice.success : choice.fail) ?? [];
  } else {
    effects = choice.effects ?? [];
  }
  let next = then;
  for (const eff of effects) next = applyEffect(state, content, eff, next);
  return next;
}

function applyEffect(state: RunState, content: Content, eff: EventEffect, then: EventContinuation): EventContinuation {
  switch (eff.type) {
    case "resource": {
      const fuelBefore = state.resources.fuel;
      for (const k of RESOURCE_KINDS) {
        const d = eff.delta[k];
        if (d === undefined) continue;
        state.resources[k] = Math.max(0, state.resources[k] + d);
      }
      // Топливо сверх бака не заливается (но и не теряется, если его уже было больше).
      if ((eff.delta.fuel ?? 0) > 0) {
        state.resources.fuel = Math.min(state.resources.fuel, Math.max(tankMax(state, content), fuelBefore));
      }
      log(state, `resources ${JSON.stringify(eff.delta)}`);
      return then;
    }
    case "woundPassengers":
      harmRandom(state, content, state.rng, eff.count, "event");
      return then;
    case "healWounded": {
      let left = eff.count;
      if (state.driver.status === "wounded" && left > 0) {
        state.driver.status = "healthy";
        left--;
      }
      for (const p of state.passengers) {
        if (left <= 0) break;
        if (p.hp < p.maxHp) {
          healFull(p);
          left--;
        }
      }
      log(state, `event healed ${eff.count - left}`);
      return then;
    }
    case "addPassengers":
      boardPassengers(state, content, eff.count);
      return then;
    case "damageItems":
      damageRandomItems(state, content, state.rng, eff.count, eff.amount, "event");
      return then;
    case "gainItem": {
      const itemId = eff.itemId ?? pick(state.rng, itemsOfKinds(content, eff.itemKinds ?? [])).id;
      state.inventory.push(makeItem(state, content, itemId));
      state.stats.itemsGained += 1;
      log(state, `gained item ${itemId}`);
      return then;
    }
    case "damageTank":
      damageTank(state, content, eff.amount, "event");
      return then;
    case "repairTank":
      repairTankFull(state);
      return then;
    case "loseActions":
      if (then.type !== "stop") return then;
      log(state, `lost ${eff.count} action(s)`);
      return { type: "stop", actionsLeft: Math.max(0, then.actionsLeft - eff.count) };
  }
}

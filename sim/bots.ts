/**
 * Простые боты для симуляции баланса. Используют свой RNG, чтобы не влиять на RNG забега:
 * забег воспроизводится по seed и списку команд, независимо от того, кто их отдал.
 */
import {
  activeWeapons,
  canEscape,
  freeSeats,
  systemRepairCost,
  weaponManned,
  type RangeBand,
  type RepairableSystem,
  type TargetRef,
  availableChoices,
  eventDef,
  findNode,
  fits,
  fuelCost,
  installCost,
  itemDef,
  occupant,
  outgoingEdges,
  repairCost,
  seatById,
  type Command,
  type Content,
  type MapEdge,
  type Pace,
  type RunState,
} from "../core";
import { createRng, int, pick, type RngState } from "../core/rng";

export interface Bot {
  name: string;
  decide(state: RunState, content: Content): Command;
}

export type BotFactory = (seed: number) => Bot;

// ---------- Общие помощники ----------

function isExposed(state: RunState, seatId: string): boolean {
  const seat = seatById(state, seatId);
  return seat !== undefined && state.bus.exposedCols.includes(seat.col);
}

function canTake(state: RunState, content: Content, edge: MapEdge, pace: Pace): boolean {
  if (state.resources.fuel >= fuelCost(state, content, edge, pace)) return true;
  // Можно рискнуть, если на перегоне магазин с топливом и есть жетоны.
  const sellsFuel = edge.shop === "kiosk" || edge.shop === "mechanic" || edge.shop === "fleamarket";
  return pace !== "rush" && sellsFuel && state.resources.tokens >= 4;
}

/** Пост у оружия имеет смысл занимать, только если в слоте целое оружие (а не, например, бронелист). */
function postHasWeapon(state: RunState, seatId: string, content: Content): boolean {
  const seat = seatById(state, seatId);
  if (!seat?.slot) return false;
  const inst = state.equipment[seat.slot];
  if (!inst || inst.durability <= 0) return false;
  return content.items[inst.itemId]?.kind === "weapon";
}

/**
 * Перестановки салона:
 * раненых — с постов и мест у бортов на защищённые места;
 * здоровых — на посты у оружия, затем к механику и штурману.
 */
function crewFix(state: RunState, content: Content): Command | null {
  const safeFree = () =>
    state.bus.seats.find((s) => s.role === "plain" && !isExposed(state, s.id) && !occupant(state, s.id));

  for (const p of state.passengers) {
    if (p.status !== "wounded") continue;
    const seat = seatById(state, p.seat);
    if (seat && (seat.role !== "plain" || isExposed(state, seat.id))) {
      const safe = safeFree();
      if (safe) return { type: "seatPassenger", passengerId: p.id, seatId: safe.id };
    }
  }

  const wanted = state.bus.seats.filter(
    (s) =>
      !occupant(state, s.id) &&
      ((s.role === "weapon" && postHasWeapon(state, s.id, content)) || s.role === "mechanic" || s.role === "navigator"),
  );
  // Сначала оружие.
  wanted.sort((a, b) => (a.role === "weapon" ? 0 : 1) - (b.role === "weapon" ? 0 : 1));
  for (const post of wanted) {
    const idle = state.passengers.find(
      (p) =>
        p.status === "healthy" &&
        (seatById(state, p.seat)?.role === "plain" || (seatById(state, p.seat)?.role === "weapon" && !postHasWeapon(state, p.seat, content))),
    );
    if (idle) return { type: "seatPassenger", passengerId: idle.id, seatId: post.id };
  }
  return null;
}

function needsOf(state: RunState) {
  const r = state.resources;
  const mouths = state.passengers.length + 1;
  const wounded = state.passengers.some((p) => p.status === "wounded") || state.driver.status === "wounded";
  return {
    fuel: r.fuel < 45,
    food: r.food < mouths * 2,
    medkits: wounded && r.medkits === 0,
    ammo: r.ammo < 6,
    parts: r.parts < 3,
    tokens: false,
  };
}

/** Предмет из багажа, который можно поставить в пустой подходящий слот. */
function installTarget(state: RunState, content: Content): { uid: string; slotId: string; cost: number } | null {
  for (const inst of state.inventory) {
    const def = itemDef(content, inst);
    if (inst.durability <= 0) continue;
    for (const slot of state.bus.slots) {
      if (state.equipment[slot.id]) continue;
      if (!fits(def, slot)) continue;
      return { uid: inst.uid, slotId: slot.id, cost: installCost(content, def, false) };
    }
  }
  return null;
}

/** Есть ли пустой слот, куда встал бы предмет. */
function hasFreeSlotFor(state: RunState, content: Content, itemId: string): boolean {
  const def = content.items[itemId]!;
  return state.bus.slots.some((s) => !state.equipment[s.id] && fits(def, s));
}

// ---------- Бой ----------

const BAND_CENTER: Record<RangeBand, number> = { contact: 0, near: 1, mid: 2, far: 3 };
const BANDS: RangeBand[] = ["far", "mid", "near", "contact"];

/** Дистанция, на которой стреляет больше всего наших работающих стволов (при равенстве — дальняя). */
function bestBand(state: RunState, content: Content): RangeBand {
  if (state.phase.type !== "combat") return "mid";
  let best: RangeBand = "mid";
  let bestCount = -1;
  for (const band of BANDS) {
    let count = 0;
    for (const w of state.phase.combat.weapons) {
      const inst = state.equipment[w.slotId];
      if (!inst || inst.durability <= 0 || !weaponManned(state, w.slotId)) continue;
      if (itemDef(content, inst).weapon!.ranges.includes(band)) count++;
    }
    if (count > bestCount) {
      best = band;
      bestCount = count;
    }
  }
  return best;
}

function combatCommand(state: RunState, content: Content, style: "careful" | "greedy"): Command {
  if (state.phase.type !== "combat") throw new Error("not in combat");
  const c = state.phase.combat;
  const fix = crewFix(state, content);
  if (fix) return fix;

  if (style === "careful") {
    // Разбитое оружие латаем за запчасть, но пару запчастей держим на ремонт на остановке.
    const broken = c.weapons.find((w) => {
      const inst = state.equipment[w.slotId];
      return inst && inst.durability <= 0;
    });
    const cost = content.balance.combat.fieldRepairParts;
    if (broken && state.resources.parts >= cost + 1) return { type: "fieldRepair", slotId: broken.slotId };
    // Механик — на оружие, пока системы целы; иначе — на системы.
    const systemsOk = state.systems.engine.hp > 0 && state.systems.wheels.hp > 0 && state.systems.cabin.hp > 0;
    const focus = systemsOk ? "weapons" : "systems";
    if (c.mechanicFocus !== focus) return { type: "setMechanicFocus", focus };
  }

  const danger = c.source !== "boss" && state.hull.hp <= state.hull.max * 0.35;
  if (style === "careful" && danger) {
    if (canEscape(c, content)) return { type: "escape" };
    if (c.maneuver !== "retreat") return { type: "setManeuver", maneuver: "retreat" };
  } else {
    const want = BAND_CENTER[bestBand(state, content)];
    const maneuver = c.distance > want + 0.3 ? "approach" : c.distance < want - 0.3 ? "retreat" : "hold";
    if (c.maneuver !== maneuver) return { type: "setManeuver", maneuver };
  }

  // Осторожный выбивает оружие врагов (самое опасное первым), жадный бьёт в корпус ведущего.
  let desired: TargetRef = "hull";
  let foe = c.enemies.findIndex((e) => e.out === null);
  if (style === "careful") {
    let bestDmg = -1;
    c.enemies.forEach((e, ei) => {
      if (e.out !== null) return;
      e.weapons.forEach((w, i) => {
        if (w.hp <= 0 || w.disabled) return;
        const dmg = content.items[w.itemId]!.weapon!.damage * content.items[w.itemId]!.weapon!.shots;
        if (dmg > bestDmg) {
          bestDmg = dmg;
          desired = `weapon:${i}`;
          foe = ei;
        }
      });
    });
  }
  for (const w of c.weapons) {
    if (w.target !== desired || w.enemy !== foe) return { type: "setTarget", slotId: w.slotId, target: desired, enemy: foe };
  }
  return { type: "advance", ticks: 5 };
}

function lootCommand(state: RunState, content: Content, style: "careful" | "greedy"): Command {
  if (state.phase.type !== "loot") throw new Error("not looting");
  const loot = state.phase.loot;
  let itemIndex: number | null = loot.items.length > 0 ? 0 : null;
  if (style === "careful") {
    const fitting = loot.items.findIndex((id) => hasFreeSlotFor(state, content, id));
    itemIndex = fitting >= 0 ? fitting : null;
  }
  const canFeed = state.resources.food >= state.passengers.length + 1 + loot.survivors;
  const takeSurvivors = style === "greedy" || (freeSeats(state).length > 0 && canFeed);
  return { type: "finishLoot", itemIndex, takeSurvivors };
}

/** Что починить на остановке: пробитый бак, разбитые системы, сильно повреждённый корпус. */
function systemToRepair(state: RunState, content: Content, atGarage: boolean): RepairableSystem | null {
  const wanted: RepairableSystem[] = [];
  if (state.tank.durability * 2 <= state.tank.max) wanted.push("tank");
  for (const sys of ["engine", "wheels", "cabin"] as const) if (state.systems[sys].hp <= 0) wanted.push(sys);
  if (state.hull.hp <= state.hull.max * 0.6) wanted.push("hull");
  for (const sys of wanted) {
    if (state.resources.parts >= systemRepairCost(state, content, sys, atGarage)) return sys;
  }
  return null;
}

// ---------- Осторожный бот ----------

const NODE_SCORE: Record<string, number> = {
  village: 3,
  garage: 2,
  junkyard: 2,
  special: 2,
  checkpoint: 1,
  incident: 0,
  encounter: -1,
  boss: 0,
};

export function makeCarefulBot(opts: { scavengers: number; heal: boolean; buyGear: boolean; name: string }): BotFactory {
  return () => ({
    name: opts.name,
    decide(state, content) {
      const phase = state.phase;
      const style = opts.buyGear ? "careful" : "greedy";

      if (phase.type === "combat") return combatCommand(state, content, style);
      if (phase.type === "loot") return lootCommand(state, content, style);

      if (phase.type === "event") {
        const ev = eventDef(content, phase.eventId);
        const options = availableChoices(state, content, ev);
        return { type: "resolveChoice", choiceIndex: options[0]! };
      }

      if (phase.type === "shop") {
        const need = needsOf(state);
        const resIdx = phase.visit.offers.findIndex(
          (o) => !o.sold && o.type === "resource" && o.price <= state.resources.tokens && need[o.resource],
        );
        if (resIdx >= 0) return { type: "buy", offerIndex: resIdx };
        if (opts.buyGear) {
          const target = installTarget(state, content);
          if (target && state.resources.parts >= target.cost) {
            return { type: "install", uid: target.uid, slotId: target.slotId };
          }
          const gearIdx = phase.visit.offers.findIndex(
            (o) =>
              !o.sold &&
              o.type === "item" &&
              o.price + 4 <= state.resources.tokens &&
              hasFreeSlotFor(state, content, o.itemId) &&
              !state.inventory.some((i) => i.itemId === o.itemId),
          );
          if (gearIdx >= 0) return { type: "buy", offerIndex: gearIdx };
        }
        return { type: "leaveShop" };
      }

      if (phase.type === "stop") {
        const fix = crewFix(state, content);
        if (fix) return fix;
        // Лечение, ремонт и установка действий не тратят — только аптечки и запчасти.
        const wounded = state.passengers.some((p) => p.status === "wounded") || state.driver.status === "wounded";
        if (opts.heal && wounded && state.resources.medkits > 0) return { type: "heal" };
        const atGarage = findNode(state.map, state.nodeId).kind === "garage";
        const sys = systemToRepair(state, content, atGarage);
        if (sys) return { type: "repairSystem", system: sys };
        for (const inst of Object.values(state.equipment)) {
          if (!inst || inst.durability > 0) continue;
          if (state.resources.parts >= repairCost(content, inst, atGarage)) return { type: "repair", uid: inst.uid };
        }
        if (opts.buyGear) {
          const target = installTarget(state, content);
          if (target && state.resources.parts >= target.cost) {
            return { type: "install", uid: target.uid, slotId: target.slotId };
          }
          // Лишнее из багажа, которое некуда поставить, — продать скупщику.
          const junk = state.inventory.find((i) => !hasFreeSlotFor(state, content, i.itemId));
          if (junk) return { type: "sell", uid: junk.uid };
        }
        if (phase.actionsLeft > 0) {
          const team = state.passengers.filter((p) => p.status === "healthy").slice(0, opts.scavengers);
          if (team.length > 0) return { type: "scavenge", passengerIds: team.map((p) => p.id) };
        }
        return { type: "leaveStop" };
      }

      // route
      const fix = crewFix(state, content);
      if (fix) return fix;
      const need = needsOf(state);
      const guns = activeWeapons(state, content).length;
      const options = outgoingEdges(state.map, state.nodeId);
      const scored = options
        .map((e) => {
          let pace: Pace = "normal";
          if (state.contested.includes(e.to)) {
            if (state.resources.fuel >= fuelCost(state, content, e, "rush") + 15) pace = "rush";
            else if (guns >= 2) pace = "intercept";
          }
          return { e, pace };
        })
        .filter(({ e, pace }) => canTake(state, content, e, pace))
        .map(({ e, pace }) => {
          const kind = findNode(state.map, e.to).kind;
          let score = NODE_SCORE[kind] ?? 0;
          if (kind === "encounter" && guns >= 2) score += 2;
          if (e.shop && state.resources.tokens >= 3 && (need.fuel || need.food)) score += 3;
          if (e.shop && opts.buyGear && state.resources.tokens >= 10) score += 1;
          if (state.contested.includes(e.to) && pace === "normal") score -= 1;
          score -= fuelCost(state, content, e, pace) / 5;
          return { e, pace, score };
        })
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best) return { type: "chooseRoute", edgeId: best.e.id, pace: best.pace };
      const fallback =
        options.find((e) => e.shop !== null || state.resources.fuel >= fuelCost(state, content, e)) ?? options[0];
      if (!fallback) throw new Error("no outgoing edges in route phase");
      return { type: "chooseRoute", edgeId: fallback.id };
    },
  });
}

// ---------- Случайный бот ----------

export const randomBot: BotFactory = (seed) => {
  const rng: RngState = createRng(seed ^ 0x5eed);
  return {
    name: "random",
    decide(state, content) {
      const phase = state.phase;
      if (phase.type === "event") {
        const options = availableChoices(state, content, eventDef(content, phase.eventId));
        return { type: "resolveChoice", choiceIndex: pick(rng, options) };
      }
      if (phase.type === "combat") {
        const c = phase.combat;
        const roll = int(rng, 0, 19);
        if (roll === 0 && canEscape(c, content)) return { type: "escape" };
        if (roll === 1) return { type: "setManeuver", maneuver: pick(rng, ["approach", "hold", "retreat"] as const) };
        if (roll === 2 && c.weapons.length > 0) {
          const foes = c.enemies.map((e, i) => ({ e, i })).filter((x) => x.e.out === null);
          if (foes.length > 0) {
            const { e, i: enemy } = pick(rng, foes);
            const targets: TargetRef[] = ["hull", "engine", "wheels", "cabin", "tank", ...e.weapons.map((_, i) => `weapon:${i}` as TargetRef)];
            return { type: "setTarget", slotId: pick(rng, c.weapons).slotId, target: pick(rng, targets), enemy };
          }
        }
        return { type: "advance", ticks: int(rng, 1, 10) };
      }
      if (phase.type === "loot") {
        const items = phase.loot.items;
        return {
          type: "finishLoot",
          itemIndex: items.length > 0 && int(rng, 0, 1) === 0 ? int(rng, 0, items.length - 1) : null,
          takeSurvivors: int(rng, 0, 1) === 0,
        };
      }
      if (phase.type === "shop") {
        const open = phase.visit.offers.map((o, i) => ({ o, i })).filter((x) => !x.o.sold);
        if (open.length > 0 && int(rng, 0, 1) === 0) return { type: "buy", offerIndex: pick(rng, open).i };
        return { type: "leaveShop" };
      }
      if (phase.type === "stop") {
        if (phase.actionsLeft > 0 && int(rng, 0, 2) > 0) {
          const healthy = state.passengers.filter((p) => p.status === "healthy");
          if (healthy.length > 0) return { type: "scavenge", passengerIds: [pick(rng, healthy).id] };
        }
        return { type: "leaveStop" };
      }
      const options = outgoingEdges(state.map, state.nodeId);
      const edge = pick(rng, options);
      const pace: Pace = state.contested.includes(edge.to) ? pick(rng, ["normal", "rush", "intercept"] as const) : "normal";
      return { type: "chooseRoute", edgeId: edge.id, pace };
    },
  };
};

export const BOTS: Record<string, BotFactory> = {
  careful: makeCarefulBot({ scavengers: 2, heal: true, buyGear: true, name: "careful" }),
  greedy: makeCarefulBot({ scavengers: 3, heal: false, buyGear: false, name: "greedy" }),
  random: randomBot,
};

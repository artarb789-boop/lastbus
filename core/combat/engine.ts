/**
 * Бой автобус на автобус (GDD 8), по образцу FTL: реальное время с паузой.
 * Ядро считает бой дискретными тиками; клиент вызывает advance по таймеру и останавливает его на паузе.
 * Всё детерминировано: случайность только из state.rng.
 */
import type { Content, EnemyDef, EnemyPhaseEffect, RangeBand, WeaponEffect } from "../content";
import { harm, healOne, hurtDriver, occupant } from "../crew";
import { coveredSeats, itemDef, working } from "../equipment";
import { log } from "../log";
import { chance, pick } from "../rng";
import type {
  CombatResult,
  CombatSource,
  CombatState,
  EnemyState,
  ItemInstance,
  Maneuver,
  MechanicFocus,
  PlayerWeaponState,
  RunState,
  StatusTimers,
  SystemHp,
  TargetRef,
} from "../state";
import { driverEscapeMult, driverEvasionBonus } from "../driver";
import { damageTank } from "../tank";
import { BAND_CENTER, enemyIsFleeing, enemyManeuver, retargetEnemy } from "./ai";

export function bandOf(distance: number): RangeBand {
  if (distance < 0.5) return "contact";
  if (distance < 1.5) return "near";
  if (distance < 2.5) return "mid";
  return "far";
}

function emptyStatus(): StatusTimers {
  return { tethered: 0, slowed: 0, burning: [] };
}

function hp(max: number): SystemHp {
  return { hp: max, max };
}

// ---------- Начало боя ----------

function makeEnemy(content: Content, enemy: string | EnemyDef, name?: string): EnemyState {
  const def = typeof enemy === "string" ? content.enemies[enemy] : enemy;
  if (!def) throw new Error(`unknown enemy ${String(enemy)}`);
  return {
    enemyId: def.id,
    def: structuredClone(def),
    name: name ?? def.nameKey,
    hull: hp(def.hull),
    systems: { engine: hp(def.systems.engine), wheels: hp(def.systems.wheels), cabin: hp(def.systems.cabin), tank: hp(def.systems.tank) },
    weapons: def.weapons.map((itemId) => {
      const item = content.items[itemId]!;
      return { itemId, hp: item.durability, max: item.durability, charge: 0, target: "hull" as TargetRef, disabled: false };
    }),
    ai: def.ai,
    preferredRange: def.preferredRange,
    maneuver: "hold",
    escape: 0,
    phasesDone: 0,
    status: emptyStatus(),
    out: null,
  };
}

/**
 * Начать бой. Враг — id из data/enemies или готовое описание (например, усиленный заклятый соперник),
 * а для банды — список из нескольких.
 */
export function startCombat(
  state: RunState,
  content: Content,
  enemy: string | EnemyDef | (string | EnemyDef)[],
  source: CombatSource,
  name?: string,
): CombatState {
  const list = Array.isArray(enemy) ? enemy : [enemy];
  if (list.length === 0) throw new Error("no enemies");
  const enemies = list.map((e, i) => makeEnemy(content, e, i === 0 ? name : undefined));
  const b = content.balance.combat;
  const weapons: PlayerWeaponState[] = Object.entries(state.equipment)
    .filter(([, inst]) => inst && content.items[inst.itemId]?.kind === "weapon")
    .map(([slotId]) => ({ slotId, charge: 0, target: "hull" as TargetRef, repairTimer: 0, enemy: 0 }));

  const combat: CombatState = {
    source,
    tick: 0,
    // Засада начинается вблизи и с заряженными наполовину стволами врага.
    distance: source === "ambush" ? 1 : b.startDistance,
    maneuver: "hold",
    escape: 0,
    weapons,
    status: emptyStatus(),
    mechanicTimer: 0,
    mechanicFocus: "systems",
    medicTimer: 0,
    enemies,
  };
  for (const e of enemies) {
    if (source === "ambush") {
      for (const w of e.weapons) w.charge = Math.floor(content.items[w.itemId]!.weapon!.charge / 2);
    }
    retargetEnemy(state, content, e, true);
  }
  state.stats.fights += 1;
  log(state, `combat (${source}) vs ${enemies.map((e) => e.enemyId).join(" + ")}`);
  return combat;
}

/** Враги, которые ещё в бою. */
export function activeEnemies(combat: CombatState): EnemyState[] {
  return combat.enemies.filter((e) => e.out === null);
}

/** Ведущий автобус: первый, кто ещё в бою (или первый вообще, если бой окончен). */
export function leadEnemy(combat: CombatState): EnemyState {
  return activeEnemies(combat)[0] ?? combat.enemies[0]!;
}

// ---------- Параметры сторон ----------

function seatHealthy(state: RunState, seatId: string | undefined): boolean {
  if (!seatId) return false;
  const p = occupant(state, seatId);
  return p !== undefined; // раненые тоже работают
}

function seatHungry(state: RunState, seatId: string | undefined): boolean {
  if (!seatId) return false;
  return occupant(state, seatId)?.hungry === true;
}

/** Голоден ли тот, кто работает с оружием в слоте (на носу — водитель). */
export function gunnerHungry(state: RunState, slotId: string): boolean {
  const slot = state.bus.slots.find((s) => s.id === slotId);
  if (slot?.kind === "front") return state.driver.hungry === true;
  const post = state.bus.seats.find((s) => s.role === "weapon" && s.slot === slotId);
  return seatHungry(state, post?.id);
}

function roleSeat(state: RunState, role: string): string | undefined {
  return state.bus.seats.find((s) => s.role === role)?.id;
}

export function playerEvasion(state: RunState, content: Content): number {
  const e = content.balance.combat.evasion;
  let ev = e.base;
  if (state.systems.engine.hp > 0) ev += e.engine;
  if (state.systems.wheels.hp > 0) ev += e.wheels;
  if (seatHealthy(state, roleSeat(state, "navigator"))) ev += e.navigator;
  // Голодный водитель рулит хуже: без бонуса водителя.
  if (!state.driver.hungry && state.systems.cabin.hp > 0) ev += e.driver;
  return ev + (state.bus.evasionBonus ?? 0) + driverEvasionBonus(state, content);
}

export function enemyEvasion(_content: Content, enemy: EnemyState): number {
  return enemy.systems.engine.hp > 0 ? enemy.def.evasion : 0;
}

function playerSpeed(state: RunState, combat: CombatState): number {
  if (state.systems.engine.hp <= 0) return 0;
  let v = state.systems.wheels.hp > 0 ? 1 : 0.5;
  if (combat.status.slowed > 0) v *= 0.5;
  return v;
}

function enemySpeed(_content: Content, e: EnemyState): number {
  if (e.systems.engine.hp <= 0) return 0;
  let v = e.def.speed * (e.systems.wheels.hp > 0 ? 1 : 0.5);
  if (e.status.slowed > 0) v *= 0.5;
  return v;
}

const DIR: Record<Maneuver, number> = { approach: -1, hold: 0, retreat: 1 };

/** Работает ли пост при оружии игрока: носовое — от водителя, остальное — от пассажира на посту. */
export function weaponManned(state: RunState, slotId: string): boolean {
  const slot = state.bus.slots.find((s) => s.id === slotId);
  if (slot?.kind === "front") return true; // водитель за рулём, пока жив
  const post = state.bus.seats.find((s) => s.role === "weapon" && s.slot === slotId);
  return seatHealthy(state, post?.id);
}

export function canEscape(combat: CombatState, content: Content): boolean {
  return combat.source !== "boss" && combat.escape >= content.balance.combat.escapeTicks;
}

// ---------- Урон ----------

function hitEnemy(_content: Content, e: EnemyState, target: TargetRef, dmg: number, armored: boolean): void {
  // Броня снижает урон, но попадание всегда наносит хотя бы 1.
  const d = armored && dmg > 0 ? Math.max(1, dmg - e.def.armor) : dmg;
  if (d <= 0) return;
  e.hull.hp = Math.max(0, e.hull.hp - d);
  if (target === "engine" || target === "wheels" || target === "cabin" || target === "tank") {
    e.systems[target].hp = Math.max(0, e.systems[target].hp - d);
  } else if (target.startsWith("weapon:")) {
    const w = e.weapons[Number(target.slice(7))];
    if (w) w.hp = Math.max(0, w.hp - d);
  }
}

/** Попадание по автобусу игрока: броня борта, затем корпус и цель, затем люди у борта. */
function hitPlayer(state: RunState, content: Content, target: TargetRef, dmg: number, armored: boolean, crewChance?: number): void {
  const b = content.balance.combat;
  let d = dmg;
  const side: "left" | "right" = pick(state.rng, ["left", "right"] as const);
  const sideCol = side === "left" ? Math.min(...state.bus.exposedCols) : Math.max(...state.bus.exposedCols);

  if (armored) {
    // Лучший целый бронелист на этом борту принимает удар.
    const plates = working(state, content).filter(
      (x) =>
        x.def.armor &&
        (x.slot.covers ?? []).some((seatId) => state.bus.seats.find((s) => s.id === seatId)?.col === sideCol),
    );
    plates.sort((a, b2) => b2.def.armor!.rating - a.def.armor!.rating);
    const plate = plates[0];
    if (plate && d > 0) {
      const reduced = Math.max(1, d - plate.def.armor!.rating);
      // Лист изнашивается, только если действительно погасил часть урона: мелкие пули его не тратят.
      if (reduced < d) plate.inst.durability = Math.max(0, plate.inst.durability - 1);
      d = reduced;
    }
  }
  if (d <= 0) return;

  state.hull.hp = Math.max(0, state.hull.hp - d);
  if (target === "engine" || target === "wheels" || target === "cabin") {
    state.systems[target].hp = Math.max(0, state.systems[target].hp - d);
    if (target === "cabin" && chance(state.rng, b.driverWoundChance)) hurtDriver(state, "cabin hit");
  } else if (target === "tank") {
    damageTank(state, content, d, "combat");
  } else if (target.startsWith("weapon:")) {
    const inst = state.equipment[target.slice(7)];
    if (inst) inst.durability = Math.max(0, inst.durability - d);
  }

  // Люди у этого борта, не закрытые бронёй.
  if (chance(state.rng, crewChance ?? b.crewWoundChance)) {
    const covered = coveredSeats(state, content);
    const exposed = state.passengers.filter((p) => {
      const seat = state.bus.seats.find((s) => s.id === p.seat);
      return seat?.col === sideCol && !covered.has(p.seat);
    });
    if (exposed.length > 0) harm(state, pick(state.rng, exposed), "combat");
  }
}

function applyEffects(status: StatusTimers, target: TargetRef, effects: WeaponEffect[] | undefined): void {
  for (const eff of effects ?? []) {
    if (eff.type === "tether") status.tethered = Math.max(status.tethered, eff.ticks);
    if (eff.type === "slow") status.slowed = Math.max(status.slowed, eff.ticks);
    if (eff.type === "burn") status.burning.push({ target, ticks: eff.ticks });
  }
}

// ---------- Фазы босса ----------

function applyPhase(state: RunState, content: Content, e: EnemyState, effects: EnemyPhaseEffect[]): void {
  for (const eff of effects) {
    if (eff.type === "disableWeapons") {
      let left = eff.count;
      for (const w of e.weapons) {
        if (left <= 0) break;
        if (!w.disabled && w.hp > 0) {
          w.disabled = true;
          left--;
        }
      }
    }
    if (eff.type === "setAi") e.ai = eff.ai;
    if (eff.type === "setPreferredRange") e.preferredRange = eff.range;
  }
  retargetEnemy(state, content, e, true);
  log(state, `enemy phase ${e.phasesDone}`);
}

// ---------- Тик ----------

/** Один тик боя. Возвращает исход, если бой закончился. */
export function combatTick(state: RunState, content: Content, combat: CombatState): CombatResult | null {
  const b = content.balance.combat;
  combat.tick += 1;
  const active = activeEnemies(combat);
  const lead = leadEnemy(combat);

  // 1. Статусы и горение.
  const tickStatus = (status: StatusTimers, burnHit: (target: TargetRef) => void) => {
    if (status.tethered > 0) status.tethered--;
    if (status.slowed > 0) status.slowed--;
    for (const burn of status.burning) {
      burn.ticks--;
      if (combat.tick % b.burnEvery === 0) burnHit(burn.target);
    }
    status.burning = status.burning.filter((x) => x.ticks > 0);
  };
  tickStatus(combat.status, (target) => hitPlayer(state, content, target, 1, false));
  for (const e of active) tickStatus(e.status, (target) => hitEnemy(content, e, target, 1, false));

  // 2. Фазы босса.
  for (const e of active) {
    const phases = e.def.phases ?? [];
    while (e.phasesDone < phases.length && e.hull.hp <= phases[e.phasesDone]!.atHull * e.hull.max) {
      e.phasesDone++;
      applyPhase(state, content, e, phases[e.phasesDone - 1]!.effects);
    }
  }

  // 3. Движение: дистанцию задаёт ведущий, остальные держатся рядом с ним.
  for (const e of active) e.maneuver = enemyManeuver(content, e, combat.distance);
  const tethered = combat.status.tethered > 0 || active.some((e) => e.status.tethered > 0);
  let delta = b.distanceStep * (DIR[combat.maneuver] * playerSpeed(state, combat) + DIR[lead.maneuver] * enemySpeed(content, lead));
  if (tethered && delta > 0) delta = 0;
  combat.distance = Math.max(0, Math.min(3, combat.distance + delta));
  const band = bandOf(combat.distance);

  // 4. Отрыв: копится на средней и дальней дистанции, пока работает двигатель и нет сцепки.
  const escapeRate = band === "far" ? 1 : band === "mid" ? b.escapeMidRate : 0;
  if (escapeRate > 0 && !tethered) {
    if (state.systems.engine.hp > 0) {
      combat.escape = Math.min(b.escapeTicks, combat.escape + escapeRate * driverEscapeMult(state, content));
    }
    for (const e of active) {
      if (enemyIsFleeing(content, e) && e.systems.engine.hp > 0 && e.status.tethered <= 0) {
        e.escape += escapeRate;
        if (e.escape >= b.escapeTicks) {
          e.out = "fled";
          log(state, `${e.enemyId} fled`);
        }
      }
    }
  }

  // 5. Механик и медик на постах.
  if (seatHealthy(state, roleSeat(state, "mechanic"))) {
    // Голодный работает вполсилы.
    if (!seatHungry(state, roleSeat(state, "mechanic")) || combat.tick % 2 === 0) combat.mechanicTimer++;
    if (combat.mechanicTimer >= b.mechanicRepairTicks) {
      combat.mechanicTimer = 0;
      mechanicCombatRepair(state, content, combat.mechanicFocus);
    }
  }
  if (seatHealthy(state, roleSeat(state, "medic"))) {
    if (!seatHungry(state, roleSeat(state, "medic")) || combat.tick % 2 === 0) combat.medicTimer++;
    if (combat.medicTimer >= b.medicHealTicks) {
      combat.medicTimer = 0;
      // Самого тяжёлого — на 1.
      const wounded = state.passengers.filter((p) => p.hp < p.maxHp).sort((a, b) => a.hp - b.hp)[0];
      if (wounded) {
        healOne(wounded);
        log(state, `medic healed ${wounded.id} +1`);
      }
    }
  }

  // 6. Оружие игрока.
  for (const w of combat.weapons) {
    const inst = state.equipment[w.slotId];
    if (!inst) {
      w.charge = 0;
      continue;
    }
    if (inst.durability <= 0) {
      w.charge = 0;
      // Стрелок на посту латает свой ствол, как экипаж в отсеке в FTL.
      if (weaponManned(state, w.slotId)) {
        w.repairTimer++;
        if (w.repairTimer >= b.gunnerRepairTicks) {
          w.repairTimer = 0;
          inst.durability = 1;
          log(state, `gunner patched ${inst.itemId}`);
        }
      }
      continue;
    }
    if (!weaponManned(state, w.slotId)) continue;
    // Цель выбыла — переводим ствол на следующего врага, по корпусу.
    let foe = combat.enemies[w.enemy];
    if (!foe || foe.out !== null) {
      const next = activeEnemies(combat)[0];
      if (!next) continue;
      w.enemy = combat.enemies.indexOf(next);
      w.target = "hull";
      foe = next;
    }
    const stats = itemDef(content, inst).weapon!;
    // Голодный стрелок заряжает вдвое медленнее.
    if (gunnerHungry(state, w.slotId) && combat.tick % 2 === 1) continue;
    w.charge = Math.min(stats.charge, w.charge + 1);
    if (w.charge < stats.charge || !stats.ranges.includes(band) || state.resources.ammo < stats.ammoPerVolley) continue;

    state.resources.ammo -= stats.ammoPerVolley;
    w.charge = 0;
    const p = clampHit(stats.accuracy - enemyEvasion(content, foe));
    let hits = 0;
    for (let k = 0; k < stats.shots; k++) {
      if (chance(state.rng, p)) {
        hits++;
        hitEnemy(content, foe, w.target, stats.damage, true);
      }
    }
    if (hits > 0) applyEffects(foe.status, w.target, stats.effects);
    if (stats.selfDamage) state.hull.hp = Math.max(0, state.hull.hp - stats.selfDamage);
  }

  // 7. Оружие врагов.
  for (const e of activeEnemies(combat)) {
    retargetEnemy(state, content, e);
    for (const w of e.weapons) {
      if (w.disabled || w.hp <= 0) {
        w.charge = 0;
        continue;
      }
      // Разбитая кабина — экипаж врага работает вдвое медленнее.
      if (e.systems.cabin.hp <= 0 && combat.tick % 2 === 1) continue;
      const stats = content.items[w.itemId]!.weapon!;
      w.charge = Math.min(stats.charge, w.charge + 1);
      if (w.charge < stats.charge || !stats.ranges.includes(band)) continue;
      w.charge = 0;
      const p = clampHit(stats.accuracy * b.enemyAccuracyMult - playerEvasion(state, content));
      let hits = 0;
      for (let k = 0; k < stats.shots; k++) {
        if (chance(state.rng, p)) {
          hits++;
          hitPlayer(state, content, w.target, stats.damage, true, stats.crewChance);
        }
      }
      if (hits > 0) applyEffects(combat.status, w.target, stats.effects);
      if (stats.selfDamage) e.hull.hp = Math.max(0, e.hull.hp - stats.selfDamage);
    }
  }

  // 8. Исход.
  if (state.phase.type === "over") return "lost"; // водитель погиб
  if (state.hull.hp <= 0) return "lost";
  for (const e of activeEnemies(combat)) {
    if (e.hull.hp <= 0) {
      e.out = "destroyed";
      log(state, `${e.enemyId} destroyed`);
    } else if (e.def.surrenderAtHull !== undefined && e.hull.hp <= e.def.surrenderAtHull * e.hull.max) {
      e.out = "surrendered";
      log(state, `${e.enemyId} surrendered`);
    }
  }
  // Затянувшийся бой: обычные враги уходят, босс дорогу не уступает.
  if (combat.tick >= b.maxTicks) {
    if (combat.source === "boss") return "lost";
    for (const e of activeEnemies(combat)) e.out = "fled";
  }
  if (activeEnemies(combat).length > 0) return null;
  return combatOutcome(combat);
}

/** Исход боя, когда все враги выбыли: хоть один разбит — победа, иначе сдача, иначе все ушли. */
export function combatOutcome(combat: CombatState): CombatResult {
  if (combat.enemies.some((e) => e.out === "destroyed")) return "won";
  if (combat.enemies.some((e) => e.out === "surrendered")) return "surrendered";
  return "enemy_fled";
}

function clampHit(p: number): number {
  return Math.max(0.05, Math.min(0.95, p));
}

/**
 * Механик в бою: по умолчанию двигатель, колёса, кабина, бак, затем оружие.
 * С приоритетом «оружие» — сначала разбитое оружие, потом повреждённое, потом системы.
 * Корпус чинится только на остановке.
 */
function mechanicCombatRepair(state: RunState, content: Content, focus: MechanicFocus = "systems"): void {
  if (focus === "weapons" && repairWeapon(state, content)) return;
  for (const sys of ["engine", "wheels", "cabin"] as const) {
    if (state.systems[sys].hp < state.systems[sys].max) {
      state.systems[sys].hp++;
      log(state, `mechanic repaired ${sys} +1`);
      return;
    }
  }
  if (state.tank.durability < state.tank.max) {
    state.tank.durability++;
    log(state, "mechanic patched tank +1");
    return;
  }
  repairWeapon(state, content);
}

/** +1 прочности оружию: сначала разбитому, потом самому повреждённому. */
function repairWeapon(state: RunState, content: Content): boolean {
  let best: ItemInstance | null = null;
  for (const inst of Object.values(state.equipment)) {
    if (!inst) continue;
    const def = content.items[inst.itemId]!;
    if (def.kind !== "weapon" || inst.durability >= def.durability) continue;
    if (!best || inst.durability < best.durability) best = inst;
  }
  if (!best) return false;
  best.durability++;
  log(state, `mechanic repaired ${best.itemId} +1`);
  return true;
}

export { BAND_CENTER };

import { describe, expect, it } from "vitest";
import { applyCommand, canEscape, fuelCost, type Content, type RunState } from "../core";
import { bandOf, combatTick, startCombat } from "../core/combat/engine";
import { makeItem } from "../core/equipment";
import { content, contentWith, drive, fightOut, quietContent, runOn } from "./helpers";

const c = quietContent;

/** Забег на прямой дороге с боем против заданного врага; экипаж рассажен по постам при оружии. */
function arena(enemyId: string, cc: Content = c, seed = 1): RunState {
  const s = runOn(seed, ["start", "village", "village", "boss"], cc);
  const posts = s.bus.seats.filter((x) => x.role === "weapon" && s.equipment[x.slot!]);
  s.passengers.forEach((p, i) => {
    if (posts[i]) p.seat = posts[i]!.id;
  });
  const combat = startCombat(s, cc, enemyId, "encounter");
  s.phase = { type: "combat", combat, then: { type: "route" } };
  return s;
}

function combatOf(s: RunState) {
  if (s.phase.type !== "combat") throw new Error(`expected combat, got ${s.phase.type}`);
  return s.phase.combat;
}

describe("дистанция", () => {
  it("полосы дистанции", () => {
    expect([0, 0.6, 1.6, 2.6].map(bandOf)).toEqual(["contact", "near", "mid", "far"]);
  });

  it("манёвры сближают и разводят автобусы, дистанция в пределах 0..3", () => {
    const s = arena("enemy_raider_minibus");
    const cb = combatOf(s);
    cb.enemy.preferredRange = "mid";
    cb.distance = 2;
    applyCommand(s, { type: "setManeuver", maneuver: "approach" }, c);
    applyCommand(s, { type: "advance", ticks: 10 }, c);
    expect(cb.distance).toBeLessThan(2);
    applyCommand(s, { type: "setManeuver", maneuver: "retreat" }, c);
    applyCommand(s, { type: "advance", ticks: 100 }, c);
    if (s.phase.type === "combat") {
      expect(cb.distance).toBeGreaterThanOrEqual(0);
      expect(cb.distance).toBeLessThanOrEqual(3);
    }
  });
});

describe("оружие игрока", () => {
  it("заряжается только с занятым постом и стреляет, когда заряд полный", () => {
    const s = arena("enemy_rival_carrier");
    const cb = combatOf(s);
    cb.enemy.weapons.forEach((w) => (w.disabled = true)); // враг не мешает
    const mg = cb.weapons.find((w) => w.slotId === "roof")!;
    const charge = content.items.wpn_mg!.weapon!.charge;

    // Пост пуст — заряд не растёт.
    const gunner = s.passengers.find((p) => p.seat === s.bus.seats.find((x) => x.slot === "roof")!.id)!;
    gunner.seat = "r3c1";
    combatTick(s, c, cb);
    expect(mg.charge).toBe(0);

    gunner.seat = s.bus.seats.find((x) => x.slot === "roof")!.id;
    for (let k = 0; k < charge - 1; k++) combatTick(s, c, cb);
    expect(mg.charge).toBe(charge - 1);
    combatTick(s, c, cb);
    expect(mg.charge).toBe(0); // выстрелил
  });

  it("вне своей дистанции оружие держит заряд и не стреляет", () => {
    const s = arena("enemy_rival_carrier");
    const cb = combatOf(s);
    cb.enemy.weapons.forEach((w) => (w.disabled = true));
    cb.enemy.preferredRange = "near";
    cb.distance = 1; // пулемёт бьёт только mid/far
    applyCommand(s, { type: "setManeuver", maneuver: "hold" }, c);
    const hull = cb.enemy.hull.hp;
    const mg = cb.weapons.find((w) => w.slotId === "roof")!;
    // Держим врага вблизи: обнуляем движение, двигая дистанцию вручную.
    for (let k = 0; k < 40; k++) {
      cb.distance = 1;
      combatTick(s, c, cb);
    }
    expect(mg.charge).toBe(content.items.wpn_mg!.weapon!.charge);
    // Дробовик вблизи стреляет, а вот пулемёт нет: урон только от дробовика.
    expect(cb.enemy.hull.hp).toBeLessThanOrEqual(hull);
  });

  it("тяжёлое оружие тратит боеприпасы, без них не стреляет", () => {
    const s = arena("enemy_rival_carrier");
    s.equipment.roof = makeItem(s, c, "wpn_rockets");
    const cb = startCombat(s, c, "enemy_rival_carrier", "encounter");
    s.phase = { type: "combat", combat: cb, then: { type: "route" } };
    cb.enemy.weapons.forEach((w) => (w.disabled = true));
    const rockets = cb.weapons.find((w) => w.slotId === "roof")!;
    const charge = content.items.wpn_rockets!.weapon!.charge;

    s.resources.ammo = 0;
    for (let k = 0; k < charge + 5; k++) {
      cb.distance = 2;
      combatTick(s, c, cb);
    }
    expect(rockets.charge).toBe(charge); // заряжен, но не стреляет

    s.resources.ammo = 3;
    cb.distance = 2;
    combatTick(s, c, cb);
    expect(s.resources.ammo).toBe(3 - content.items.wpn_rockets!.weapon!.ammoPerVolley);
  });

  it("пулемёт и дробовик не тратят боеприпасы", () => {
    const s = arena("enemy_rival_carrier");
    const cb = combatOf(s);
    // Бой не должен закончиться: трофеи тоже дают боеприпасы.
    cb.enemy.hull = { hp: 999, max: 999 };
    cb.enemy.weapons.forEach((w) => (w.disabled = true));
    s.resources.ammo = 5;
    applyCommand(s, { type: "advance", ticks: 100 }, c);
    expect(s.phase.type).toBe("combat");
    expect(s.resources.ammo).toBe(5);
  });

  it("броня врага снижает урон, но каждое попадание наносит хотя бы 1", () => {
    const s = arena("enemy_rival_carrier"); // броня 1
    const cb = combatOf(s);
    cb.enemy.weapons.forEach((w) => (w.disabled = true));
    const deltas = new Set<number>();
    for (let k = 0; k < 300 && cb.enemy.hull.hp > 3; k++) {
      cb.distance = 2; // только пулемёт: 3 выстрела по 1
      const before = cb.enemy.hull.hp;
      combatTick(s, c, cb);
      deltas.add(before - cb.enemy.hull.hp);
    }
    expect([...deltas].every((d) => d >= 0 && d <= 3)).toBe(true);
    expect(cb.enemy.hull.hp).toBeLessThan(cb.enemy.hull.max);
  });
});

describe("урон по игроку", () => {
  it("бронелист на борту снижает урон и изнашивается", () => {
    const s = arena("enemy_raider_sawnoff"); // два дробовика по 3
    const cb = combatOf(s);
    for (const side of ["sideL1", "sideL2", "sideR1", "sideR2"]) {
      s.equipment[side] = makeItem(s, c, "arm_plate_heavy"); // броня 2
    }
    cb.weapons = []; // игрок не стреляет
    const deltas = new Set<number>();
    for (let k = 0; k < 200; k++) {
      cb.distance = 1;
      const before = s.hull.hp;
      combatTick(s, c, cb);
      if (s.hull.hp < before) deltas.add(before - s.hull.hp);
      if (s.hull.hp <= 3) break;
    }
    // 3 урона − 2 брони = 1 за попадание (за тик может прийти несколько попаданий).
    expect(Math.min(...deltas)).toBe(1);
    const worn = ["sideL1", "sideL2", "sideR1", "sideR2"].some(
      (side) => s.equipment[side]!.durability < content.items.arm_plate_heavy!.durability,
    );
    expect(worn).toBe(true);
  });

  it("ИИ показывает намерение: стрелок целится в оружие игрока, таранщик — в колёса", () => {
    const gunner = arena("enemy_raider_minibus");
    expect(combatOf(gunner).enemy.weapons[0]!.target).toMatch(/^weapon:/);
    const rammer = arena("enemy_rammer");
    expect(combatOf(rammer).enemy.weapons.every((w) => w.target === "wheels")).toBe(true);
  });
});

describe("исходы боя", () => {
  it("победа даёт трофеи: ресурсы и уцелевшее оружие врага", () => {
    const s = arena("enemy_raider_minibus");
    const cb = combatOf(s);
    cb.enemy.hull.hp = 1;
    cb.enemy.weapons.forEach((w) => (w.disabled = true));
    applyCommand(s, { type: "advance", ticks: 100 }, c);
    expect(s.phase.type).toBe("loot");
    if (s.phase.type !== "loot") return;
    expect(s.phase.loot.items).toContain("wpn_mg");
    const inv = s.inventory.length;
    expect(applyCommand(s, { type: "finishLoot", itemIndex: 0, takeSurvivors: false }, c).ok).toBe(true);
    expect(s.inventory.length).toBe(inv + 1);
    expect(s.phase.type).toBe("route");
    expect(s.stats.fightsWon).toBe(1);
  });

  it("уничтоженный корпус — конец забега", () => {
    const s = arena("enemy_raider_sawnoff");
    s.hull.hp = 1;
    combatOf(s).distance = 1;
    combatOf(s).weapons = [];
    applyCommand(s, { type: "advance", ticks: 200 }, c);
    expect(s.phase).toEqual({ type: "over", result: "lost", reason: "destroyed" });
  });

  it("оторваться можно, только накопив отрыв; от босса — нельзя", () => {
    const s = arena("enemy_raider_minibus");
    const cb = combatOf(s);
    expect(applyCommand(s, { type: "escape" }, c)).toEqual({ ok: false, error: "cannot_escape" });
    cb.escape = content.balance.combat.escapeTicks;
    expect(canEscape(cb, c)).toBe(true);
    expect(applyCommand(s, { type: "escape" }, c).ok).toBe(true);
    expect(s.phase.type).toBe("route");
    expect(s.stats.escapes).toBe(1);

    const boss = arena("enemy_boss_prison_bus");
    const bc = combatOf(boss);
    bc.source = "boss";
    bc.escape = content.balance.combat.escapeTicks;
    expect(canEscape(bc, c)).toBe(false);
  });

  it("гарпун сцепляет: дистанция не растёт и отрыв не копится", () => {
    const s = arena("enemy_raider_minibus");
    const cb = combatOf(s);
    cb.distance = 3;
    cb.status.tethered = 50;
    applyCommand(s, { type: "setManeuver", maneuver: "retreat" }, c);
    const d0 = cb.distance;
    for (let k = 0; k < 20; k++) combatTick(s, c, cb);
    expect(cb.distance).toBeLessThanOrEqual(d0);
    expect(cb.escape).toBe(0);
  });

  it("босс во второй фазе отключает часть оружия и идёт на таран", () => {
    const s = arena("enemy_boss_prison_bus");
    const cb = combatOf(s);
    cb.enemy.hull.hp = Math.floor(cb.enemy.hull.max / 2);
    combatTick(s, c, cb);
    expect(cb.enemy.phasesDone).toBe(1);
    expect(cb.enemy.weapons.filter((w) => w.disabled)).toHaveLength(2);
    expect(cb.enemy.ai).toBe("berserk");
    expect(cb.enemy.preferredRange).toBe("contact");
  });
});

describe("бой в забеге", () => {
  it("узел-встреча начинает бой, после победы — выбор маршрута", () => {
    const s = runOn(2, ["start", "encounter", "village", "boss"]);
    s.hull = { hp: 999, max: 999 };
    drive(s);
    expect(s.phase.type).toBe("combat");
    fightOut(s);
    expect(["route", "over"]).toContain(s.phase.type);
  });

  it("перехват спорной остановки — бой с соперником до прибытия", () => {
    const cc = contentWith((x) => {
      x.balance.roadEventChance = 0;
      x.balance.stopEventChance = 0;
      x.balance.rivalChance = 1;
      x.balance.combat.ambushChance = 0;
    });
    const s = runOn(3, ["start", "village", "village", "boss"], cc);
    s.hull = { hp: 999, max: 999 };
    drive(s, cc);
    applyCommand(s, { type: "leaveStop" }, cc);
    expect(applyCommand(s, { type: "chooseRoute", edgeId: "e1", pace: "intercept" }, cc).ok).toBe(true);
    const cb = combatOf(s);
    expect(cb.source).toBe("intercept");
    expect(content.enemies[cb.enemy.enemyId]!.kind).toBe("rival");
    fightOut(s, cc);
    expect(s.phase.type).toBe("stop");
  });

  it("босс в конце региона: победа — конец забега с победой", () => {
    const s = runOn(4, ["start", "boss"]);
    s.hull = { hp: 999, max: 999 };
    // Без стрелков на постах оружие молчит и бой с боссом не выиграть.
    const posts = s.bus.seats.filter((x) => x.role === "weapon" && s.equipment[x.slot!]);
    s.passengers.forEach((p, i) => {
      if (posts[i]) p.seat = posts[i]!.id;
    });
    drive(s);
    expect(combatOf(s).source).toBe("boss");
    fightOut(s);
    expect(s.phase).toEqual({ type: "over", result: "won", reason: "boss_defeated" });
  });

  it("корпус и системы чинятся на остановке", () => {
    const s = runOn(5, ["start", "village", "boss"]);
    drive(s);
    s.hull.hp = 10;
    s.systems.engine.hp = 0;
    s.resources.parts = 20;
    expect(applyCommand(s, { type: "repairSystem", system: "hull" }, c).ok).toBe(true);
    expect(s.hull.hp).toBe(s.hull.max);
    expect(applyCommand(s, { type: "repairSystem", system: "engine" }, c).ok).toBe(true);
    expect(s.systems.engine.hp).toBe(s.systems.engine.max);
  });

  it("разбитый двигатель увеличивает расход топлива", () => {
    const s = runOn(6, ["start", "village", "boss"]);
    const edge = s.map.edges[0]!;
    const normal = fuelCost(s, c, edge);
    s.systems.engine.hp = 0;
    expect(fuelCost(s, c, edge)).toBe(Math.ceil(normal * content.balance.combat.brokenEngineFuelMult));
  });
});

describe("ремонт оружия в бою", () => {
  it("«Залатать» тратит запчасти и даёт +1 прочности", () => {
    const s = arena("enemy_raider_minibus");
    s.equipment.roof!.durability = 0;
    s.resources.parts = 3;
    const cost = c.balance.combat.fieldRepairParts;
    expect(applyCommand(s, { type: "fieldRepair", slotId: "roof" }, c)).toEqual({ ok: true });
    expect(s.equipment.roof!.durability).toBe(1);
    expect(s.resources.parts).toBe(3 - cost);
  });

  it("«Залатать» без запчастей или целое — отказ", () => {
    const s = arena("enemy_raider_minibus");
    s.resources.parts = 0;
    s.equipment.roof!.durability = 0;
    expect(applyCommand(s, { type: "fieldRepair", slotId: "roof" }, c)).toEqual({ ok: false, error: "not_enough_parts" });
    s.resources.parts = 5;
    s.equipment.roof!.durability = 3;
    expect(applyCommand(s, { type: "fieldRepair", slotId: "roof" }, c)).toEqual({ ok: false, error: "not_damaged" });
    expect(applyCommand(s, { type: "fieldRepair", slotId: "front" }, c).ok).toBe(false);
  });

  it("механик с приоритетом «оружие» чинит оружие раньше систем", () => {
    const s = arena("enemy_raider_minibus");
    const mech = s.bus.seats.find((x) => x.role === "mechanic")!;
    const p = s.passengers.find((x) => s.bus.seats.find((y) => y.id === x.seat)?.role !== "weapon")!;
    p.seat = mech.id;
    p.status = "healthy";
    s.systems.engine.hp = 1;
    s.equipment.roof!.durability = 0;
    expect(applyCommand(s, { type: "setMechanicFocus", focus: "weapons" }, c).ok).toBe(true);
    // Враг не стреляет: проверяем только ремонт.
    for (const w of combatOf(s).enemy.weapons) w.disabled = true;
    for (let k = 0; k < c.balance.combat.mechanicRepairTicks; k++) combatTick(s, c, combatOf(s));
    expect(s.equipment.roof!.durability).toBeGreaterThan(0);
    expect(s.systems.engine.hp).toBe(1);
  });
});

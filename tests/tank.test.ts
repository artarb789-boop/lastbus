import { describe, expect, it } from "vitest";
import { applyCommand, isLeaking, repairTankCost } from "../core";
import { combatTick, startCombat } from "../core/combat/engine";
import { damageTank } from "../core/tank";
import { content, contentWith, drive, quietContent, runOn } from "./helpers";

const c = quietContent;

describe("бак", () => {
  it("стартовая прочность бака берётся из автобуса", () => {
    const s = runOn(1, ["start", "village", "boss"]);
    expect(s.tank).toEqual({ durability: content.buses.bus_city!.tankDurability, max: content.buses.bus_city!.tankDurability });
    expect(isLeaking(s)).toBe(false);
  });

  it("пробитие сразу выливает топливо в пределах punctureLoss", () => {
    const s = runOn(2, ["start", "village", "boss"]);
    s.resources.fuel = 50;
    damageTank(s, c, 100, "test");
    const [lo, hi] = content.balance.tank.punctureLoss;
    expect(isLeaking(s)).toBe(true);
    expect(50 - s.resources.fuel).toBeGreaterThanOrEqual(lo);
    expect(50 - s.resources.fuel).toBeLessThanOrEqual(hi);
    expect(s.stats.tankPunctures).toBe(1);
  });

  it("пробитый бак течёт каждый перегон", () => {
    const s = runOn(3, ["start", "village", "village", "boss"]);
    s.tank.durability = 0;
    s.resources.fuel = 60;
    const cost = content.balance.roads.highway.fuel;
    drive(s);
    expect(s.resources.fuel).toBe(60 - cost - content.balance.tank.leakPerLeg);
  });

  it("ремонт бака на остановке тратит действие и запчасти и останавливает утечку", () => {
    const s = runOn(4, ["start", "village", "village", "boss"]);
    drive(s);
    s.tank.durability = 0;
    s.resources.parts = 10;
    const cost = repairTankCost(s, c, false);
    expect(applyCommand(s, { type: "repairSystem", system: "tank" }, c).ok).toBe(true);
    expect(s.tank.durability).toBe(s.tank.max);
    expect(s.resources.parts).toBe(10 - cost);
    expect(s.phase.type === "stop" && s.phase.actionsLeft).toBe(content.balance.stopActions - 1);
    expect(applyCommand(s, { type: "repairSystem", system: "tank" }, c)).toEqual({ ok: false, error: "not_damaged" });
  });

  it("механик на посту в первую очередь латает бак", () => {
    const s = runOn(5, ["start", "village", "village", "boss"]);
    const mech = s.bus.seats.find((x) => x.role === "mechanic")!;
    s.passengers[0]!.seat = mech.id;
    s.passengers[0]!.ticket.stopsLeft = 99;
    s.tank.durability = 1;
    s.equipment.roof!.durability = 1;
    drive(s);
    expect(s.tank.durability).toBe(2);
    expect(s.equipment.roof!.durability).toBe(1);
  });

  it("сливщики целятся в бак и пробивают его в бою", () => {
    const s = runOn(6, ["start", "village", "boss"]);
    s.resources.fuel = 50;
    s.hull = { hp: 999, max: 999 };
    const combat = startCombat(s, c, "enemy_siphoners", "encounter");
    expect(combat.enemy.weapons.every((w) => w.target === "tank")).toBe(true);
    s.phase = { type: "combat", combat, then: { type: "route" } };
    combat.distance = 1; // вблизи бьёт огнемёт сливщиков
    for (let k = 0; k < 600 && !isLeaking(s); k++) combatTick(s, c, combat);
    expect(isLeaking(s)).toBe(true);
  });

  it("событие может повредить и заварить бак", () => {
    const stray = content.events.find((e) => e.id === "ev_road_stray_bullet")!;
    const welder = content.events.find((e) => e.id === "ev_stop_welder")!;
    const cc = contentWith((x) => {
      x.balance.roadEventChance = 1;
      x.balance.stopEventChance = 1;
      x.balance.rivalChance = 0;
      for (const r of Object.values(x.balance.roads)) r.wearChance = 0;
      x.events = [stray, welder];
    });
    const s = runOn(7, ["start", "village", "boss"], cc);
    s.resources.tokens = 10;
    drive(s, cc);
    expect(s.phase).toMatchObject({ type: "event", eventId: stray.id });
    const ignore = stray.choices.findIndex((ch) => !ch.requires);
    applyCommand(s, { type: "resolveChoice", choiceIndex: ignore }, cc);
    expect(s.tank.durability).toBe(s.tank.max - 2);
    // Прибытие на обычную остановку → событие остановки (сварщик).
    expect(s.phase).toMatchObject({ type: "event", eventId: welder.id });
    applyCommand(s, { type: "resolveChoice", choiceIndex: 0 }, cc);
    expect(s.tank.durability).toBe(s.tank.max);
    expect(s.phase.type).toBe("stop");
  });
});

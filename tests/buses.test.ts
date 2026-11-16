import { describe, expect, it } from "vitest";
import { capacity, fuelCost, newRun, playerEvasion, tankMax } from "../core";
import { BOTS } from "../sim/bots";
import { runGame } from "../sim/runner";
import { content, NEUTRAL_DRIVER, quietContent } from "./helpers";

describe("выбор автобуса", () => {
  it("с каждым автобусом начинается забег по его данным", () => {
    for (const bus of Object.values(content.buses)) {
      const s = newRun(1, content, { busId: bus.id });
      expect(s.bus.id).toBe(bus.id);
      expect(s.hull.max).toBe(bus.hull);
      expect(capacity(s)).toBe(bus.seats.length - 1);
      for (const [slot, item] of Object.entries(bus.startEquipment)) expect(s.equipment[slot]?.itemId).toBe(item);
      expect(s.resources.fuel).toBeLessThanOrEqual(tankMax(s, content));
    }
  });

  it("неизвестный автобус — ошибка", () => {
    expect(() => newRun(1, content, { busId: "bus_nope" })).toThrow();
  });

  it("расход, уклонение и бак зависят от автобуса", () => {
    const c = quietContent;
    const city = newRun(1, c, { busId: "bus_city", driverId: NEUTRAL_DRIVER });
    const shuttle = newRun(1, c, { busId: "bus_shuttle", driverId: NEUTRAL_DRIVER });
    const armored = newRun(1, c, { busId: "bus_armored", driverId: NEUTRAL_DRIVER });
    const edge = city.map.edges[0]!;
    expect(fuelCost(shuttle, c, edge)).toBeLessThan(fuelCost(city, c, edge));
    expect(fuelCost(armored, c, edge)).toBeGreaterThan(fuelCost(city, c, edge));
    expect(playerEvasion(shuttle, c)).toBeCloseTo(playerEvasion(city, c) + c.buses.bus_shuttle!.evasionBonus!, 5);
    expect(tankMax(armored, c)).toBe(tankMax(city, c) + 20);
  });

  it("бот проходит забеги на любом автобусе", () => {
    for (const busId of Object.keys(content.buses)) {
      for (let seed = 1; seed <= 5; seed++) {
        const { state } = runGame(seed, BOTS.careful!, content, { busId });
        expect(state.phase.type).toBe("over");
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { applyCommand, fuelCost, newRun, playerEvasion, replay, type Phase, type RunState } from "../core";
import { combatTick, startCombat } from "../core/combat/engine";
import { nemesisDef, nemesisDue } from "../core/nemesis";
import { BOTS } from "../sim/bots";
import { runGame } from "../sim/runner";
import { content, contentWith, drive, quietContent, runOn } from "./helpers";

const c = quietContent;

describe("водители", () => {
  it("в данных три водителя, по умолчанию — дальнобойщик", () => {
    expect(Object.keys(content.drivers).sort()).toEqual(["drv_guard", "drv_racer", "drv_trucker"]);
    expect(newRun(1, content).driver.id).toBe("drv_trucker");
  });

  it("дальнобойщик тратит меньше топлива и берёт лишнюю еду", () => {
    const trucker = newRun(1, content, { driverId: "drv_trucker" });
    const racer = newRun(1, content, { driverId: "drv_racer" });
    const edge = trucker.map.edges[0]!;
    edge.road = "detour";
    expect(fuelCost(trucker, content, edge)).toBeLessThan(fuelCost(racer, content, edge));
    expect(trucker.resources.food).toBe(racer.resources.food + 2);
  });

  it("гонщик уклоняется лучше, пока здоров, и быстрее копит отрыв", () => {
    const racer = newRun(2, content, { driverId: "drv_racer" });
    const trucker = newRun(2, content, { driverId: "drv_trucker" });
    expect(playerEvasion(racer, content)).toBeCloseTo(playerEvasion(trucker, content) + 0.05);

    const speedOfEscape = (s: RunState) => {
      s.hull = { hp: 999, max: 999 };
      const cb = startCombat(s, c, "enemy_raider_minibus", "encounter");
      cb.enemies[0]!.weapons.forEach((w) => (w.disabled = true));
      cb.enemies[0]!.preferredRange = "far";
      cb.distance = 3;
      for (let k = 0; k < 10; k++) combatTick(s, c, cb);
      return cb.escape;
    };
    expect(speedOfEscape(newRun(3, c, { driverId: "drv_racer" }))).toBeCloseTo(speedOfEscape(newRun(3, c, { driverId: "drv_trucker" })) * 1.5);
  });

  it("инкассатор начинает с тяжёлым бронелистом и патронами", () => {
    const guard = newRun(4, content, { driverId: "drv_guard" });
    const base = newRun(4, content, { driverId: "drv_racer" });
    expect(guard.equipment.sideR1?.itemId).toBe("arm_plate_heavy");
    expect(guard.resources.ammo).toBe(base.resources.ammo + 4);
  });

  it("водитель сохраняется при воспроизведении", () => {
    const { state, commands } = runGame(5, BOTS.careful!, content);
    void state;
    const again = replay(5, commands, content, { driverId: "drv_trucker" });
    expect(again.driver.id).toBe("drv_trucker");
  });
});

describe("заклятый соперник", () => {
  it("у забега есть именной соперник из списка", () => {
    const s = newRun(1, content);
    expect(content.balance.nemesis.names).toContain(s.nemesis.nameKey);
    expect(s.nemesis).toMatchObject({ meetings: 0, level: 0, defeated: false });
  });

  it("встречи происходят на заданных столбцах", () => {
    const s = newRun(1, content);
    const [first, second] = content.balance.nemesis.meetColumns;
    expect(nemesisDue(s, content, first! - 1)).toBe(false);
    expect(nemesisDue(s, content, first!)).toBe(true);
    s.nemesis.meetings = 1;
    expect(nemesisDue(s, content, first!)).toBe(false);
    expect(nemesisDue(s, content, second!)).toBe(true);
    s.nemesis.meetings = 2;
    expect(nemesisDue(s, content, 99)).toBe(false);
  });

  it("на пути к нужному столбцу соперник перехватывает автобус", () => {
    const withNemesis = contentWith((x) => {
      x.balance.roadEventChance = 0;
      x.balance.stopEventChance = 0;
      x.balance.rivalChance = 0;
      x.balance.combat.ambushChance = 0;
    });
    const col = content.balance.nemesis.meetColumns[0]!;
    const kinds = ["start", ...Array<"village">(col).fill("village"), "boss"] as const;
    const s = runOn(6, [...kinds], withNemesis);
    s.hull = { hp: 999, max: 999 };
    for (let k = 0; k < col - 1; k++) {
      drive(s, withNemesis);
      for (const p of s.passengers) p.ticket.stopsLeft = 99;
    }
    drive(s, withNemesis);
    expect(s.phase.type).toBe("combat");
    if (s.phase.type === "combat") {
      expect(s.phase.combat.source).toBe("nemesis");
      expect(s.phase.combat.enemies[0]!.name).toBe(s.nemesis.nameKey);
    }
  });

  it("до решающей встречи соперник отступает и возвращается сильнее", () => {
    const s = newRun(7, content);
    const first = nemesisDef(s, content);
    expect(first.surrenderAtHull).toBe(content.balance.nemesis.surrenderAtHull);

    s.hull = { hp: 999, max: 999 };
    const cb = startCombat(s, c, first, "nemesis", s.nemesis.nameKey);
    s.phase = { type: "combat", combat: cb, then: { type: "route" } };
    cb.enemies[0]!.hull.hp = 1; // сдастся на следующем тике
    applyCommand(s, { type: "advance", ticks: 1 }, c);
    expect(s.phase.type).toBe("loot");
    expect(s.nemesis).toMatchObject({ meetings: 1, level: 1, defeated: false });

    const second = nemesisDef(s, content);
    expect(second.hull).toBe(first.hull + content.balance.nemesis.hullPerLevel);
    expect(second.weapons.length).toBeGreaterThan(first.weapons.length);
    expect(second.surrenderAtHull).toBeUndefined(); // решающая встреча
  });

  it("окончательная победа даёт особый трофей", () => {
    const s = newRun(8, content);
    s.nemesis.meetings = content.balance.nemesis.meetColumns.length - 1;
    const cb = startCombat(s, c, nemesisDef(s, content), "nemesis", s.nemesis.nameKey);
    s.phase = { type: "combat", combat: cb, then: { type: "route" } };
    cb.enemies[0]!.hull.hp = 0;
    applyCommand(s, { type: "advance", ticks: 1 }, c);
    const phase = s.phase as Phase;
    expect(phase.type).toBe("loot");
    if (phase.type === "loot") expect(phase.loot.items).toContain(content.balance.nemesis.finalTrophy);
    expect(s.nemesis.defeated).toBe(true);
  });

  it("уйти от соперника — значит отдать ему жетоны", () => {
    const s = newRun(9, content);
    s.resources.tokens = 20;
    const cb = startCombat(s, c, nemesisDef(s, content), "nemesis", s.nemesis.nameKey);
    s.phase = { type: "combat", combat: cb, then: { type: "route" } };
    cb.escape = content.balance.combat.escapeTicks;
    applyCommand(s, { type: "escape" }, c);
    const [lo, hi] = content.balance.nemesis.stealTokens;
    expect(20 - s.resources.tokens).toBeGreaterThanOrEqual(lo);
    expect(20 - s.resources.tokens).toBeLessThanOrEqual(hi);
    expect(s.nemesis.level).toBe(1);
  });

  it("за обычный забег боты встречают соперника", () => {
    let met = 0;
    for (let seed = 1; seed <= 100; seed++) met += runGame(seed, BOTS.careful!, content).state.nemesis.meetings;
    expect(met).toBeGreaterThan(50);
  });
});

describe("события", () => {
  it("в данных 30 событий", () => {
    expect(content.events).toHaveLength(30);
  });

  it("событие, отнимающее действия, работает и на обычной остановке", () => {
    const siphon = content.events.find((e) => e.id === "ev_stop_night_siphon")!;
    const cc = contentWith((x) => {
      x.balance.roadEventChance = 0;
      x.balance.stopEventChance = 1;
      x.balance.rivalChance = 0;
      x.balance.combat.ambushChance = 0;
      x.events = [siphon];
    });
    const s = runOn(10, ["start", "village", "boss"], cc);
    s.resources.fuel = 60;
    drive(s, cc);
    expect(s.phase).toMatchObject({ type: "event", eventId: siphon.id });
    applyCommand(s, { type: "resolveChoice", choiceIndex: 0 }, cc);
    expect(s.phase).toEqual({ type: "stop", actionsLeft: content.balance.stopActions - 1 });
  });
});


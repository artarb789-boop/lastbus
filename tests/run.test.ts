import { describe, expect, it } from "vitest";
import { applyCommand, capacity, fareFor, findNode, isStopKind, newRun, replay, tankMax } from "../core";
import { BOTS } from "../sim/bots";
import { runGame } from "../sim/runner";
import { content, drive, fightOut, quietContent, runOn } from "./helpers";

const c = quietContent;

describe("билеты, выход и посадка", () => {
  it("билеты тратятся только на остановках, не на дорожных узлах", () => {
    const s = runOn(1, ["start", "encounter", "incident", "village", "boss"]);
    s.hull = { hp: 999, max: 999 };
    const before = new Map(s.passengers.map((p) => [p.id, p.ticket.stopsLeft]));
    drive(s); // встреча → бой
    expect(s.phase.type).toBe("combat");
    fightOut(s);
    drive(s); // происшествие → событие
    if (s.phase.type === "event") applyCommand(s, { type: "resolveChoice", choiceIndex: lastFreeChoice(s) }, c);
    for (const p of s.passengers) {
      if (before.has(p.id)) expect(p.ticket.stopsLeft).toBe(before.get(p.id));
    }
  });

  it("пассажир выходит, когда билет кончился, и платит за проеханные остановки", () => {
    const s = runOn(2, ["start", "garage", "garage", "garage", "boss"]);
    s.passengers = s.passengers.slice(0, 1);
    const p = s.passengers[0]!;
    p.ticket = { stopsTotal: 2, stopsLeft: 2 };

    drive(s);
    expect(s.passengers.some((x) => x.id === p.id)).toBe(true);
    // Попутчики, севшие на первой остановке, не должны выйти и сбить подсчёт.
    for (const x of s.passengers) if (x.id !== p.id) x.ticket.stopsLeft = 99;
    drive(s);
    expect(s.passengers.some((x) => x.id === p.id)).toBe(false);
    expect(s.stats.delivered).toBe(1);
    expect(s.stats.tokensFromFares).toBe(2);
  });

  it("раненый платит половину", () => {
    const s = newRun(3, content);
    const p = s.passengers[0]!;
    p.ticket = { stopsTotal: 5, stopsLeft: 0 };
    expect(fareFor(content, p)).toBe(5);
    p.status = "wounded";
    expect(fareFor(content, p)).toBe(2);
  });

  it("высадка раньше — без оплаты", () => {
    const s = runOn(4, ["start", "village", "boss"]);
    drive(s);
    const p = s.passengers[0]!;
    const tokens = s.resources.tokens;
    expect(applyCommand(s, { type: "dropPassenger", passengerId: p.id }, c).ok).toBe(true);
    expect(s.resources.tokens).toBe(tokens);
    expect(s.stats.droppedEarly).toBe(1);
  });

  it("посадка не превышает число мест", () => {
    const s = runOn(5, ["start", ...Array<"village">(12).fill("village"), "boss"]);
    for (let i = 0; i < 12; i++) {
      for (const p of s.passengers) p.ticket.stopsLeft = 99;
      s.resources.fuel = 10_000;
      s.resources.food = 10_000;
      drive(s);
      expect(s.passengers.length).toBeLessThanOrEqual(capacity(s));
      const seats = s.passengers.map((p) => p.seat);
      expect(new Set(seats).size).toBe(seats.length);
    }
  });
});

describe("магазины", () => {
  it("магазин на перегоне не считается остановкой", () => {
    const s = runOn(6, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "kiosk";
    const before = s.passengers.map((p) => p.ticket.stopsLeft);
    expect(applyCommand(s, { type: "chooseRoute", edgeId: "e0" }, c).ok).toBe(true);
    expect(s.phase.type).toBe("shop");
    expect(s.passengers.map((p) => p.ticket.stopsLeft)).toEqual(before);
    expect(s.stats.stopsVisited).toBe(0);
  });

  it("покупка списывает жетоны и лот нельзя купить дважды", () => {
    const s = runOn(7, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "kiosk";
    s.resources.tokens = 20;
    s.resources.fuel = 10;
    applyCommand(s, { type: "chooseRoute", edgeId: "e0" }, c);
    expect(applyCommand(s, { type: "buy", offerIndex: 0 }, c).ok).toBe(true);
    expect(s.resources.tokens).toBe(16);
    expect(s.resources.fuel).toBeGreaterThan(10);
    expect(applyCommand(s, { type: "buy", offerIndex: 0 }, c)).toEqual({ ok: false, error: "sold_out" });
    expect(applyCommand(s, { type: "leaveShop" }, c).ok).toBe(true);
    expect(s.nodeId).toBe("n1");
  });

  it("топливо из магазина не превышает бак", () => {
    const s = runOn(8, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "kiosk";
    s.resources.tokens = 20;
    s.resources.fuel = tankMax(s, c) - 1;
    applyCommand(s, { type: "chooseRoute", edgeId: "e0" }, c);
    applyCommand(s, { type: "buy", offerIndex: 0 }, c);
    expect(s.resources.fuel).toBe(tankMax(s, c));
  });

  it("оружейник продаёт оружие, купленное попадает в багаж", () => {
    const s = runOn(9, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "gunsmith";
    s.resources.tokens = 100;
    applyCommand(s, { type: "chooseRoute", edgeId: "e0" }, c);
    if (s.phase.type !== "shop") throw new Error("expected shop");
    const idx = s.phase.visit.offers.findIndex((o) => o.type === "item");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(applyCommand(s, { type: "buy", offerIndex: idx }, c).ok).toBe(true);
    expect(s.inventory).toHaveLength(1);
    expect(content.items[s.inventory[0]!.itemId]!.kind).toBe("weapon");
  });

  it("продажа даёт половину цены", () => {
    const s = runOn(10, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "kiosk";
    applyCommand(s, { type: "chooseRoute", edgeId: "e0" }, c);
    const mg = s.equipment.roof!;
    const tokens = s.resources.tokens;
    expect(applyCommand(s, { type: "sell", uid: mg.uid }, c).ok).toBe(true);
    expect(s.equipment.roof).toBeNull();
    expect(s.resources.tokens).toBe(tokens + Math.floor(content.items.wpn_mg!.price * content.balance.sellMult));
  });
});

describe("топливо и фазы", () => {
  it("нельзя выехать на перегон без магазина, если не хватает топлива", () => {
    const s = runOn(11, ["start", "village", "boss"]);
    s.resources.fuel = 1;
    expect(applyCommand(s, { type: "chooseRoute", edgeId: "e0" }, c)).toEqual({ ok: false, error: "not_enough_fuel" });
  });

  it("на остановке ровно stopActions действий", () => {
    const s = runOn(12, ["start", "village", "boss"]);
    drive(s);
    for (let k = 0; k < content.balance.stopActions; k++) {
      const healthy = s.passengers.find((p) => p.status === "healthy")!;
      expect(applyCommand(s, { type: "scavenge", passengerIds: [healthy.id] }, c).ok).toBe(true);
    }
    const again = s.passengers.find((p) => p.status === "healthy");
    if (again) {
      expect(applyCommand(s, { type: "scavenge", passengerIds: [again.id] }, c)).toEqual({ ok: false, error: "no_actions_left" });
    }
  });

  it("после конца забега команды отклоняются", () => {
    const s = newRun(13, content);
    s.phase = { type: "over", result: "lost", reason: "out_of_fuel" };
    expect(applyCommand(s, { type: "leaveStop" }, c)).toEqual({ ok: false, error: "run_over" });
  });

  it("стартовое снаряжение стоит в слотах", () => {
    const s = newRun(14, content);
    for (const [slotId, itemId] of Object.entries(content.buses.bus_city!.startEquipment)) {
      expect(s.equipment[slotId]?.itemId).toBe(itemId);
    }
  });
});

describe("детерминизм и боты", () => {
  for (const [name, bot] of Object.entries(BOTS)) {
    it(`бот ${name} доигрывает 300 забегов до конца без зависаний`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const { state } = runGame(seed, bot, content);
        expect(state.phase.type).toBe("over");
      }
    });
  }

  it("забег воспроизводится по seed и списку команд", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state, commands } = runGame(seed, BOTS.careful!, content);
      expect(replay(seed, commands, content)).toEqual(state);
    }
  });

  it("инварианты состояния держатся в каждом забеге", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = runGame(seed, BOTS.careful!, content);
      for (const v of Object.values(state.resources)) expect(v).toBeGreaterThanOrEqual(0);
      expect(state.hull.hp).toBeGreaterThanOrEqual(0);
      expect(state.hull.hp).toBeLessThanOrEqual(state.hull.max);
      for (const sys of Object.values(state.systems)) expect(sys.hp).toBeGreaterThanOrEqual(0);
      expect(state.resources.fuel).toBeLessThanOrEqual(tankMax(state, content));
      const seats = state.passengers.map((p) => p.seat);
      expect(new Set(seats).size).toBe(seats.length);
      for (const p of state.passengers) {
        expect(state.bus.seats.find((s) => s.id === p.seat)?.role).not.toBe("driver");
      }
      for (const [slotId, inst] of Object.entries(state.equipment)) {
        if (!inst) continue;
        const def = content.items[inst.itemId]!;
        expect(inst.durability).toBeGreaterThanOrEqual(0);
        expect(inst.durability).toBeLessThanOrEqual(def.durability);
        expect(def.slotKinds).toContain(state.bus.slots.find((s) => s.id === slotId)!.kind);
      }
      const node = findNode(state.map, state.nodeId);
      if (state.phase.type === "stop") expect(isStopKind(node.kind)).toBe(true);
    }
  });
});

/** Индекс варианта без требований в текущем событии. */
function lastFreeChoice(s: ReturnType<typeof runOn>): number {
  if (s.phase.type !== "event") return 0;
  const id = s.phase.eventId;
  const ev = content.events.find((e) => e.id === id)!;
  return ev.choices.findIndex((ch) => !ch.requires);
}

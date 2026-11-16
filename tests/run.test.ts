import { describe, expect, it } from "vitest";
import { applyCommand, capacity, fareFor, findNode, isStopKind, newRun, outgoingEdges, replay, type RunState } from "../core";
import type { MapEdge, RegionMap } from "../core/state";
import { BOTS } from "../sim/bots";
import { runGame } from "../sim/runner";

/** Подменяет карту на прямую дорогу из заданных узлов, без магазинов. */
function linearMap(kinds: RegionMap["nodes"][number]["kind"][]): RegionMap {
  const nodes = kinds.map((kind, i) => ({ id: `n${i}`, column: i, row: 0, kind }));
  const edges: MapEdge[] = nodes.slice(1).map((n, i) => ({
    id: `e${i}`,
    from: `n${i}`,
    to: n.id,
    road: "highway",
    shop: null,
  }));
  return { columns: nodes.length, nodes, edges, startId: "n0", bossId: `n${nodes.length - 1}` };
}

function withMap(seed: number, kinds: RegionMap["nodes"][number]["kind"][]): RunState {
  const s = newRun(seed);
  s.map = linearMap(kinds);
  s.nodeId = s.map.startId;
  s.resources.fuel = 80;
  s.resources.food = 50;
  return s;
}

function drive(s: RunState): void {
  if (s.phase.type === "stop") expect(applyCommand(s, { type: "leaveStop" }).ok).toBe(true);
  const edge = outgoingEdges(s.map, s.nodeId)[0]!;
  expect(applyCommand(s, { type: "chooseRoute", edgeId: edge.id })).toEqual({ ok: true });
}

describe("билеты, выход и посадка", () => {
  it("билеты тратятся только на остановках, не на дорожных узлах", () => {
    const s = withMap(1, ["start", "encounter", "incident", "village", "boss"]);
    s.resources.ammo = 100;
    const before = new Map(s.passengers.map((p) => [p.id, p.ticket.stopsLeft]));
    drive(s); // encounter
    drive(s); // incident
    for (const p of s.passengers) expect(p.ticket.stopsLeft).toBe(before.get(p.id));
  });

  it("пассажир выходит, когда билет кончился, и платит за проеханные остановки", () => {
    const s = withMap(2, ["start", "garage", "garage", "garage", "garage", "garage", "boss"]);
    s.passengers = s.passengers.slice(0, 1);
    const p = s.passengers[0]!;
    p.ticket = { stopsTotal: 2, stopsLeft: 2 };
    const tokens0 = s.resources.tokens;

    drive(s);
    expect(s.passengers.some((x) => x.id === p.id)).toBe(true);
    // Попутчики, севшие на первой остановке, не должны выйти и сбить подсчёт.
    for (const x of s.passengers) if (x.id !== p.id) x.ticket.stopsLeft = 99;
    drive(s);
    expect(s.passengers.some((x) => x.id === p.id)).toBe(false);
    expect(s.stats.delivered).toBe(1);
    expect(s.stats.tokensFromFares).toBe(2);
    expect(s.resources.tokens).toBeGreaterThanOrEqual(tokens0 + 2);
  });

  it("раненый платит половину", () => {
    const s = newRun(3);
    const p = s.passengers[0]!;
    p.ticket = { stopsTotal: 5, stopsLeft: 0 };
    expect(fareFor(p)).toBe(5);
    p.status = "wounded";
    expect(fareFor(p)).toBe(2);
  });

  it("высадка раньше — без оплаты", () => {
    const s = withMap(4, ["start", "village", "boss"]);
    drive(s);
    const p = s.passengers[0]!;
    const tokens = s.resources.tokens;
    expect(applyCommand(s, { type: "dropPassenger", passengerId: p.id }).ok).toBe(true);
    expect(s.resources.tokens).toBe(tokens);
    expect(s.stats.droppedEarly).toBe(1);
  });

  it("посадка не превышает число мест", () => {
    const s = withMap(5, ["start", ...Array(12).fill("village"), "boss"]);
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
    const s = withMap(6, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "kiosk";
    const before = s.passengers.map((p) => p.ticket.stopsLeft);
    expect(applyCommand(s, { type: "chooseRoute", edgeId: "e0" }).ok).toBe(true);
    expect(s.phase.type).toBe("shop");
    expect(s.passengers.map((p) => p.ticket.stopsLeft)).toEqual(before);
    expect(s.stats.stopsVisited).toBe(0);
  });

  it("покупка списывает жетоны и лот нельзя купить дважды", () => {
    const s = withMap(7, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "kiosk";
    s.resources.tokens = 20;
    s.resources.fuel = 10;
    applyCommand(s, { type: "chooseRoute", edgeId: "e0" });
    expect(applyCommand(s, { type: "buy", offerIndex: 0 }).ok).toBe(true);
    expect(s.resources.tokens).toBe(16);
    expect(s.resources.fuel).toBeGreaterThan(10);
    expect(applyCommand(s, { type: "buy", offerIndex: 0 })).toEqual({ ok: false, error: "sold_out" });
    expect(applyCommand(s, { type: "leaveShop" }).ok).toBe(true);
    expect(s.nodeId).toBe("n1");
  });
});

describe("топливо и фазы", () => {
  it("нельзя выехать на перегон без магазина, если не хватает топлива", () => {
    const s = withMap(8, ["start", "village", "boss"]);
    s.resources.fuel = 1;
    expect(applyCommand(s, { type: "chooseRoute", edgeId: "e0" })).toEqual({ ok: false, error: "not_enough_fuel" });
  });

  it("на остановке ровно 2 действия", () => {
    const s = withMap(9, ["start", "village", "boss"]);
    drive(s);
    const team = [s.passengers[0]!.id];
    expect(applyCommand(s, { type: "scavenge", passengerIds: team }).ok).toBe(true);
    const healthy = s.passengers.find((p) => p.status === "healthy")!;
    expect(applyCommand(s, { type: "scavenge", passengerIds: [healthy.id] }).ok).toBe(true);
    const again = s.passengers.find((p) => p.status === "healthy");
    if (again) {
      expect(applyCommand(s, { type: "scavenge", passengerIds: [again.id] })).toEqual({ ok: false, error: "no_actions_left" });
    }
  });

  it("после конца забега команды отклоняются", () => {
    const s = newRun(10);
    s.phase = { type: "over", result: "lost", reason: "out_of_fuel" };
    expect(applyCommand(s, { type: "leaveStop" })).toEqual({ ok: false, error: "run_over" });
  });
});

describe("детерминизм и боты", () => {
  for (const [name, bot] of Object.entries(BOTS)) {
    it(`бот ${name} доигрывает 300 забегов до конца без зависаний`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const { state } = runGame(seed, bot);
        expect(state.phase.type).toBe("over");
      }
    });
  }

  it("забег воспроизводится по seed и списку команд", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state, commands } = runGame(seed, BOTS.careful!);
      expect(replay(seed, commands)).toEqual(state);
    }
  });

  it("инварианты состояния держатся в каждом забеге", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = runGame(seed, BOTS.careful!);
      for (const v of Object.values(state.resources)) expect(v).toBeGreaterThanOrEqual(0);
      expect(state.resources.fuel).toBeLessThanOrEqual(state.tankMax);
      const seats = state.passengers.map((p) => p.seat);
      expect(new Set(seats).size).toBe(seats.length);
      for (const p of state.passengers) {
        expect(state.bus.seats.find((s) => s.id === p.seat)?.role).not.toBe("driver");
      }
      const node = findNode(state.map, state.nodeId);
      if (state.phase.type === "stop") expect(isStopKind(node.kind)).toBe(true);
    }
  });
});

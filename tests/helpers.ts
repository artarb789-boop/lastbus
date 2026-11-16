import { expect } from "vitest";
import { applyCommand, newRun, outgoingEdges, type Content, type MapEdge, type NodeKind, type RegionMap, type RunState } from "../core";
import { loadContent } from "../tools/load-content";

export const content: Content = loadContent();

/** Водитель без особенностей: тесты считают расход и уклонение без поправок. */
export const NEUTRAL_DRIVER = "drv_test_neutral";

/** Копия контента, которую тест может менять. В ней есть нейтральный водитель. */
export function contentWith(patch: (c: Content) => void): Content {
  const c = structuredClone(content);
  c.drivers[NEUTRAL_DRIVER] = { id: NEUTRAL_DRIVER, nameKey: "test", descKey: "test", perks: [] };
  patch(c);
  return c;
}

/** Прямая дорога из заданных узлов, без магазинов. */
export function linearMap(kinds: NodeKind[]): RegionMap {
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

/**
 * Новый забег на прямой дороге. По умолчанию без дорожных событий и соперников,
 * чтобы тест проверял одну вещь; c — контент для этого забега.
 */
export function runOn(seed: number, kinds: NodeKind[], c: Content = quietContent): RunState {
  const s = newRun(seed, c, { driverId: NEUTRAL_DRIVER });
  s.map = linearMap(kinds);
  s.nodeId = s.map.startId;
  s.contested = [];
  s.resources.fuel = 80;
  s.resources.food = 50;
  return s;
}

/** Контент без случайных событий, соперников, износа и попаданий в бак. */
export const quietContent: Content = contentWith((c) => {
  c.balance.roadEventChance = 0;
  c.balance.stopEventChance = 0;
  c.balance.rivalChance = 0;
  c.balance.tank.hitChance = 0;
  c.balance.tank.hitChanceOnLoss = 0;
  c.balance.combat.ambushChance = 0;
  c.balance.nemesis.meetColumns = [];
  for (const r of Object.values(c.balance.roads)) r.wearChance = 0;
});

/** Довести текущий бой до конца: просто ждать, трофеи не брать. */
export function fightOut(s: RunState, c: Content = quietContent): void {
  for (let k = 0; k < 100 && s.phase.type === "combat"; k++) {
    expect(applyCommand(s, { type: "advance", ticks: 50 }, c).ok).toBe(true);
  }
  if (s.phase.type === "loot") {
    expect(applyCommand(s, { type: "finishLoot", itemIndex: null, takeSurvivors: false }, c).ok).toBe(true);
  }
}

/** Уехать с текущего узла по первому перегону. */
export function drive(s: RunState, c: Content = quietContent): void {
  if (s.phase.type === "stop") expect(applyCommand(s, { type: "leaveStop" }, c).ok).toBe(true);
  const edge = outgoingEdges(s.map, s.nodeId)[0]!;
  expect(applyCommand(s, { type: "chooseRoute", edgeId: edge.id }, c)).toEqual({ ok: true });
}

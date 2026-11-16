import { describe, expect, it } from "vitest";
import { generateRegion, outgoingEdges } from "../core/map/generate";
import { createRng } from "../core/rng";
import type { RegionMap } from "../core/state";

function reachable(map: RegionMap): Set<string> {
  const seen = new Set<string>([map.startId]);
  const queue = [map.startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of outgoingEdges(map, id)) {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return seen;
}

describe("генерация региона", () => {
  const maps = Array.from({ length: 300 }, (_, seed) => generateRegion(createRng(seed)));

  it("одинаковый seed — одинаковая карта", () => {
    expect(generateRegion(createRng(5))).toEqual(generateRegion(createRng(5)));
  });

  it("все узлы достижимы со старта", () => {
    for (const map of maps) expect(reachable(map).size).toBe(map.nodes.length);
  });

  it("из каждого узла, кроме босса, есть дорога вперёд в соседний столбец", () => {
    for (const map of maps) {
      for (const node of map.nodes) {
        const out = outgoingEdges(map, node.id);
        if (node.id === map.bossId) {
          expect(out).toHaveLength(0);
          continue;
        }
        expect(out.length).toBeGreaterThan(0);
        for (const e of out) {
          const to = map.nodes.find((n) => n.id === e.to)!;
          expect(to.column).toBe(node.column + 1);
        }
      }
    }
  });

  it("перегоны между столбцами не пересекаются", () => {
    for (const map of maps) {
      const rowOf = new Map(map.nodes.map((n) => [n.id, n] as const));
      for (const a of map.edges) {
        for (const b of map.edges) {
          const af = rowOf.get(a.from)!;
          const bf = rowOf.get(b.from)!;
          if (af.column !== bf.column) continue;
          const at = rowOf.get(a.to)!;
          const bt = rowOf.get(b.to)!;
          expect(af.row < bf.row && at.row > bt.row).toBe(false);
        }
      }
    }
  });

  it("магазины стоят примерно на трети перегонов", () => {
    const edges = maps.flatMap((m) => m.edges);
    const share = edges.filter((e) => e.shop !== null).length / edges.length;
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.42);
  });

  it("старт в столбце 0, босс — единственный узел последнего столбца", () => {
    for (const map of maps) {
      const lastCol = map.nodes.filter((n) => n.column === map.columns - 1);
      expect(lastCol).toHaveLength(1);
      expect(lastCol[0]!.kind).toBe("boss");
      expect(map.nodes.find((n) => n.id === map.startId)!.kind).toBe("start");
    }
  });
});

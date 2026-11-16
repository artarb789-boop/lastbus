import { chance, int, next, weighted, type RngState } from "../rng";
import type { MapEdge, MapNode, RegionMap } from "../state";
import { MIDDLE_NODE_WEIGHTS, ROAD_WEIGHTS, SHOP_CHANCE, SHOP_WEIGHTS } from "../stubs";

export interface RegionOptions {
  /** Всего столбцов, включая старт и босса. */
  columns: number;
  minPerColumn: number;
  maxPerColumn: number;
  /** Шанс развилки на каждом шаге «лесенки» между столбцами. */
  branchChance: number;
}

export const DEFAULT_REGION: RegionOptions = {
  columns: 9,
  minPerColumn: 2,
  maxPerColumn: 4,
  branchChance: 0.5,
};

/**
 * Карта-граф региона: перегоны идут только вперёд, в соседний столбец.
 * Столбец 0 — старт, последний — босс.
 *
 * Перегоны между столбцами строятся «лесенкой»: два указателя (строка здесь, строка там)
 * идут сверху вниз, и на каждом шаге сдвигается один или оба. Каждая пара — перегон.
 * Пары монотонны по обеим координатам, поэтому перегоны не пересекаются,
 * а у каждого узла есть хотя бы один входящий и один исходящий перегон.
 */
export function generateRegion(rng: RngState, opts: RegionOptions = DEFAULT_REGION): RegionMap {
  const columns: MapNode[][] = [];
  const last = opts.columns - 1;

  for (let c = 0; c <= last; c++) {
    if (c === 0) {
      columns.push([{ id: "n0_0", column: 0, row: 0, kind: "start" }]);
    } else if (c === last) {
      columns.push([{ id: `n${c}_0`, column: c, row: 0, kind: "boss" }]);
    } else {
      const count = int(rng, opts.minPerColumn, opts.maxPerColumn);
      const col: MapNode[] = [];
      for (let r = 0; r < count; r++) {
        col.push({ id: `n${c}_${r}`, column: c, row: r, kind: weighted(rng, MIDDLE_NODE_WEIGHTS) });
      }
      columns.push(col);
    }
  }

  const edges: MapEdge[] = [];
  for (let c = 0; c < last; c++) {
    const here = columns[c] as MapNode[];
    const there = columns[c + 1] as MapNode[];
    for (const [i, j] of staircase(rng, here.length, there.length, opts.branchChance)) {
      const from = here[i] as MapNode;
      const to = there[j] as MapNode;
      edges.push({
        id: `e_${from.id}_${to.id}`,
        from: from.id,
        to: to.id,
        road: weighted(rng, ROAD_WEIGHTS),
        shop: chance(rng, SHOP_CHANCE) ? weighted(rng, SHOP_WEIGHTS) : null,
      });
    }
  }

  return {
    columns: opts.columns,
    nodes: columns.flat(),
    edges,
    startId: "n0_0",
    bossId: `n${last}_0`,
  };
}

/** Пары (i, j), монотонно идущие от (0, 0) до (n−1, m−1). */
function staircase(rng: RngState, n: number, m: number, branchChance: number): [number, number][] {
  let i = 0;
  let j = 0;
  const pairs: [number, number][] = [[0, 0]];
  while (i < n - 1 || j < m - 1) {
    if (i === n - 1) j++;
    else if (j === m - 1) i++;
    else {
      const roll = next(rng);
      if (roll < branchChance / 2) i++;
      else if (roll < branchChance) j++;
      else {
        i++;
        j++;
      }
    }
    pairs.push([i, j]);
  }
  return pairs;
}

export function outgoingEdges(map: RegionMap, nodeId: string): MapEdge[] {
  return map.edges.filter((e) => e.from === nodeId);
}

export function findNode(map: RegionMap, nodeId: string): MapNode {
  const node = map.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`unknown node ${nodeId}`);
  return node;
}

export function findEdge(map: RegionMap, edgeId: string): MapEdge | undefined {
  return map.edges.find((e) => e.id === edgeId);
}

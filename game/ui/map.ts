/** Карта региона: SVG со столбцами узлов, перегонами, магазинами и соперниками. */
import { findNode, fuelCost, outgoingEdges, visibleUntilColumn, type MapNode } from "../../core";
import { art } from "../art/images";
import type { Store } from "../store";
import { esc, NODE, ROAD, SHOP, uiAttr } from "./text";

const W = 900;
const H = 360;

/** Наш автобус над текущим узлом: картинка ×1, если есть, иначе эмодзи. */
function busMarker(busId: string): string {
  const bus = art(`buses/${busId}.png`);
  if (!bus) return '<text class="bus" y="-26">🚌</text>';
  return `<image class="px" href="${bus.url}" x="${-bus.w / 2}" y="${-22 - bus.h}" width="${bus.w}" height="${bus.h}"/>`;
}

export function renderMap(store: Store): string {
  const { state, content } = store;
  const map = state.map;
  const current = findNode(map, state.nodeId);
  const visibleTo = visibleUntilColumn(state, content);
  const canChoose = state.phase.type === "route";
  const outgoing = new Set(outgoingEdges(map, state.nodeId).map((e) => e.id));

  const perColumn = new Map<number, MapNode[]>();
  for (const n of map.nodes) perColumn.set(n.column, [...(perColumn.get(n.column) ?? []), n]);
  const pos = (n: MapNode) => {
    const count = perColumn.get(n.column)!.length;
    return {
      x: 50 + (n.column * (W - 100)) / (map.columns - 1),
      y: H / 2 + (n.row - (count - 1) / 2) * 85,
    };
  };

  const edges = map.edges
    .map((e) => {
      const a = pos(findNode(map, e.from));
      const b = pos(findNode(map, e.to));
      const isOut = outgoing.has(e.id);
      const passed = findNode(map, e.from).column < current.column;
      const cls = ["edge", `road-${e.road}`, isOut ? "out" : "", passed ? "passed" : ""].join(" ");
      // Магазин — ближе к началу перегона, подпись расхода — ближе к цели, чтобы не налезали друг на друга и на узлы.
      const along = (k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      const sp = along(isOut ? 0.38 : 0.5);
      const cp = along(0.62);
      const shop = e.shop
        ? `<g class="shop" transform="translate(${sp.x},${sp.y})"><title>${esc(SHOP[e.shop])}</title><circle r="11"/><text dy="4">🛒</text></g>`
        : "";
      const cost = isOut
        ? `<text class="cost" x="${cp.x}" y="${cp.y - 10}">${ROAD[e.road]} · ⛽${fuelCost(state, content, e)}</text>`
        : "";
      return `<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>${shop}${cost}`;
    })
    .join("");

  const nodes = map.nodes
    .map((n) => {
      const p = pos(n);
      const visible = n.column <= visibleTo;
      const edgeHere = map.edges.find((e) => e.from === state.nodeId && e.to === n.id);
      const reachable = canChoose && edgeHere !== undefined;
      const contested = state.contested.includes(n.id);
      const cls = ["node", reachable ? "reachable" : "", n.id === state.nodeId ? "current" : "", contested ? "contested" : ""].join(" ");
      const label = visible ? NODE[n.kind].icon : "?";
      const icon = visible ? art(`map/${n.kind}.png`) : null;
      const title = visible ? NODE[n.kind].label : "Не разведано";
      const attrs = reachable ? uiAttr("pickEdge", edgeHere!.id) : "";
      return `
        <g class="${cls}" transform="translate(${p.x},${p.y})" ${attrs}>
          <title>${esc(title)}${contested ? " — сюда едет соперник" : ""}</title>
          <circle r="20"/>
          ${icon ? `<image class="px" href="${icon.url}" x="${-icon.w}" y="${-icon.h}" width="${icon.w * 2}" height="${icon.h * 2}"/>` : `<text dy="6">${label}</text>`}
          ${contested ? '<text class="flag" x="16" y="-14">⚑</text>' : ""}
          ${n.id === state.nodeId ? busMarker(state.bus.id) : ""}
        </g>`;
    })
    .join("");

  return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Карта региона">${edges}${nodes}</svg>`;
}

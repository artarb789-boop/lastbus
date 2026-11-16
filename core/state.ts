import type { RngState } from "./rng";

// ---------- Ресурсы ----------

export const RESOURCE_KINDS = ["fuel", "food", "parts", "ammo", "medkits", "tokens"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type Resources = Record<ResourceKind, number>;

// ---------- Карта ----------

/** Остановки: там выходят и садятся пассажиры, они считаются в билетах. */
export const STOP_KINDS = ["village", "garage", "junkyard", "checkpoint", "special"] as const;
export type StopKind = (typeof STOP_KINDS)[number];

/** Дорожные узлы: не считаются в билетах. */
export type RoadNodeKind = "encounter" | "incident";

export type NodeKind = StopKind | RoadNodeKind | "start" | "boss";

export type RoadType = "highway" | "dirt" | "bridge" | "detour";

export type ShopKind = "kiosk" | "gunsmith" | "mechanic" | "pharmacy" | "fleamarket";

export interface MapNode {
  id: string;
  column: number;
  row: number;
  kind: NodeKind;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  road: RoadType;
  /** Придорожный магазин на перегоне. Не остановка. */
  shop: ShopKind | null;
}

export interface RegionMap {
  columns: number;
  nodes: MapNode[];
  edges: MapEdge[];
  startId: string;
  bossId: string;
}

// ---------- Автобус и салон ----------

export type SeatRole = "driver" | "navigator" | "weapon" | "mechanic" | "medic" | "plain";

export interface Seat {
  id: string;
  row: number;
  col: number;
  role: SeatRole;
  /** Слот оружия, к которому привязан пост (для role = "weapon"). */
  slot: string | null;
  /** Место у борта: под огнём может получить ранение. */
  exposed: boolean;
}

export interface BusLayout {
  id: string;
  rows: number;
  cols: number;
  seats: Seat[];
}

// ---------- Люди ----------

export type HealthStatus = "healthy" | "wounded";

export interface Ticket {
  /** Сколько остановок пассажир проедет всего (1–5). */
  stopsTotal: number;
  /** Сколько остановок осталось. Уменьшается только на остановках. */
  stopsLeft: number;
}

/** Пассажир без свойств: только внешность, состояние, место и билет. */
export interface Passenger {
  id: string;
  /** Индекс набора деталей внешности. Только для отображения. */
  look: number;
  status: HealthStatus;
  seat: string;
  ticket: Ticket;
}

export interface Driver {
  status: HealthStatus;
}

// ---------- Фазы забега ----------

export interface ShopOffer {
  resource: ResourceKind;
  amount: number;
  price: number;
  sold: boolean;
}

export interface ShopVisit {
  kind: ShopKind;
  offers: ShopOffer[];
  /** Перегон, по которому автобус поедет после магазина. */
  edgeId: string;
}

export type RunResult = "won" | "lost";

export type LossReason = "out_of_fuel" | "driver_died" | "boss";

export type Phase =
  | { type: "route" }
  | { type: "shop"; visit: ShopVisit }
  | { type: "stop"; actionsLeft: number }
  | { type: "over"; result: RunResult; reason: LossReason | "boss_defeated" };

// ---------- Забег ----------

export interface RunStats {
  delivered: number;
  tokensFromFares: number;
  died: number;
  droppedEarly: number;
  boarded: number;
  stopsVisited: number;
}

export interface LogEntry {
  leg: number;
  text: string;
}

export interface RunState {
  version: 1;
  seed: number;
  rng: RngState;
  map: RegionMap;
  nodeId: string;
  /** Сколько перегонов проехано. */
  legs: number;
  bus: BusLayout;
  tankMax: number;
  driver: Driver;
  passengers: Passenger[];
  nextPassengerId: number;
  resources: Resources;
  phase: Phase;
  stats: RunStats;
  log: LogEntry[];
}

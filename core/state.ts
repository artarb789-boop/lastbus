import type { AiProfile, BusDef, RangeBand } from "./content";
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

// ---------- Салон ----------

export type SeatRole = "driver" | "navigator" | "weapon" | "mechanic" | "medic" | "plain";

// ---------- Люди ----------

export type HealthStatus = "healthy" | "wounded";

export interface Ticket {
  /** Сколько остановок пассажир проедет всего. */
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

// ---------- Снаряжение ----------

/** Конкретный экземпляр оружия или модуля. */
export interface ItemInstance {
  uid: string;
  itemId: string;
  durability: number;
}

// ---------- Фазы забега ----------

/**
 * Темп на перегоне к узлу, за который гонится соперник (GDD 9.3):
 * normal — соперник успевает первым, rush — дороже по топливу, intercept — бой на дороге.
 */
export type Pace = "normal" | "rush" | "intercept";

export type ShopOffer =
  | { type: "resource"; resource: ResourceKind; amount: number; price: number; sold: boolean }
  | { type: "item"; itemId: string; price: number; sold: boolean };

export interface ShopVisit {
  kind: ShopKind;
  offers: ShopOffer[];
  /** Перегон, по которому автобус поедет после магазина. */
  edgeId: string;
  pace: Pace;
}

/** Что происходит после события или боя. */
export type EventContinuation =
  | { type: "arrive"; pace: Pace }
  | { type: "route" }
  | { type: "stop"; actionsLeft: number }
  /** После перехвата соперника: прибытие на спорную остановку, исход боя решает число действий. */
  | { type: "interceptArrive" }
  /** После боя с боссом: конец региона. */
  | { type: "regionEnd" };

// ---------- Бой (GDD 8) ----------

/** Прочность системы: корпус, двигатель, колёса, кабина, бак. */
export interface SystemHp {
  hp: number;
  max: number;
}

export type BusSystem = "engine" | "wheels" | "cabin";

/** Цель выстрела. weapon:<n> — оружие врага по индексу, weapon:<slot> — оружие игрока в слоте. */
export type TargetRef = "hull" | "engine" | "wheels" | "cabin" | "tank" | `weapon:${string}`;

export type Maneuver = "approach" | "hold" | "retreat";

export type CombatSource = "encounter" | "ambush" | "intercept" | "boss";

export interface StatusTimers {
  /** Сколько тиков ещё сцеплены гарпуном (нельзя оторваться и отдалиться). */
  tethered: number;
  /** Сколько тиков скорость снижена вдвое. */
  slowed: number;
  /** Горящие системы: цель и оставшиеся тики. */
  burning: { target: TargetRef; ticks: number }[];
}

export interface EnemyWeaponState {
  itemId: string;
  hp: number;
  max: number;
  charge: number;
  target: TargetRef;
  disabled: boolean;
}

export interface PlayerWeaponState {
  slotId: string;
  charge: number;
  target: TargetRef;
  /** Стрелок на посту чинит разбитый ствол: тики до следующей единицы прочности. */
  repairTimer: number;
}

export interface EnemyState {
  enemyId: string;
  hull: SystemHp;
  systems: { engine: SystemHp; wheels: SystemHp; cabin: SystemHp; tank: SystemHp };
  weapons: EnemyWeaponState[];
  ai: AiProfile;
  preferredRange: RangeBand;
  maneuver: Maneuver;
  escape: number;
  /** Сколько фаз босса уже сработало. */
  phasesDone: number;
  status: StatusTimers;
}

export type CombatResult = "won" | "surrendered" | "enemy_fled" | "escaped" | "lost";

export interface CombatState {
  source: CombatSource;
  tick: number;
  /** 0 — вплотную, 1 — близко, 2 — средняя, 3 — далеко. */
  distance: number;
  maneuver: Maneuver;
  escape: number;
  weapons: PlayerWeaponState[];
  status: StatusTimers;
  mechanicTimer: number;
  medicTimer: number;
  enemy: EnemyState;
}

export interface LootOffer {
  /** Ресурсы уже начислены, здесь — для показа. */
  resources: Partial<Resources>;
  /** Снятое с врага оружие: можно взять одно. */
  items: string[];
  /** Сколько пленных просится в автобус. */
  survivors: number;
}

export type RunResult = "won" | "lost";

export type LossReason = "out_of_fuel" | "driver_died" | "destroyed";

export type Phase =
  | { type: "route" }
  | { type: "shop"; visit: ShopVisit }
  | { type: "event"; eventId: string; then: EventContinuation }
  | { type: "combat"; combat: CombatState; then: EventContinuation }
  | { type: "loot"; loot: LootOffer; result: CombatResult; then: EventContinuation }
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
  itemsGained: number;
  eventsSeen: number;
  racesContested: number;
  tankPunctures: number;
  fuelLeaked: number;
  fights: number;
  fightsWon: number;
  fightTicks: number;
  escapes: number;
}

export interface LogEntry {
  leg: number;
  text: string;
}

export interface FuelTank {
  durability: number;
  max: number;
}

export interface RunState {
  version: 4;
  seed: number;
  rng: RngState;
  map: RegionMap;
  nodeId: string;
  /** Сколько перегонов проехано. */
  legs: number;
  bus: BusDef;
  /** Слот → установленный предмет. */
  equipment: Record<string, ItemInstance | null>;
  /** Снятые и купленные предметы, которые везём с собой. */
  inventory: ItemInstance[];
  nextUid: number;
  /** Бак — часть корпуса, не снимается. Пробитый (прочность 0) течёт каждый перегон. */
  tank: FuelTank;
  /** Корпус: на нуле автобус уничтожен. Чинится на остановках. */
  hull: SystemHp;
  systems: Record<BusSystem, SystemHp>;
  driver: Driver;
  passengers: Passenger[];
  nextPassengerId: number;
  resources: Resources;
  /** Узлы, к которым сейчас едет соперник (видны на карте). */
  contested: string[];
  phase: Phase;
  stats: RunStats;
  log: LogEntry[];
}

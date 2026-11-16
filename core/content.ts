/**
 * Типы контента. Сам контент лежит в data/*.json и проверяется схемами из data/schemas.
 * core/ не читает файлы: контент передаётся в функции явно.
 * Для Node его загружает tools/load-content.ts, для клиента будет свой загрузчик на Vite.
 */
import type { NodeKind, ResourceKind, Resources, RoadType, SeatRole, ShopKind, StopKind } from "./state";

// ---------- Баланс ----------

export interface RoadDef {
  fuel: number;
  weight: number;
  /** Шанс, что перегон износит случайный модуль на 1. */
  wearChance: number;
}

export interface Balance {
  startResources: Resources;
  tankBase: number;
  stopActions: number;
  foodEveryLegs: number;
  startPassengers: number;
  ticketMin: number;
  ticketMax: number;
  farePerStop: number;
  lookVariants: number;
  region: { columns: number; minPerColumn: number; maxPerColumn: number; branchChance: number };
  roads: Record<RoadType, RoadDef>;
  nodeWeights: Partial<Record<NodeKind, number>>;
  boarding: Record<StopKind, [number, number]>;
  shopChance: number;
  shopWeights: Record<ShopKind, number>;
  checkpointToll: number;
  scavengeTables: Record<StopKind, Partial<Record<ResourceKind, number>>>;
  scavengeRisk: Record<StopKind, number>;
  roadEventChance: number;
  /** Шанс случайного события на обычной остановке (не «особой»). */
  stopEventChance: number;
  /** Бак: попадания в бою, пробитие и утечка (GDD 7.3). */
  tank: {
    /** Шанс попадания в бак за встречу, если бой выигран. */
    hitChance: number;
    /** То же, если бой проигран. */
    hitChanceOnLoss: number;
    hitDamage: [number, number];
    /** Сколько топлива выливается сразу при пробитии. */
    punctureLoss: [number, number];
    /** Сколько вытекает за каждый перегон, пока бак пробит. */
    leakPerLeg: number;
  };
  rivalChance: number;
  rushFuelMult: number;
  contestedActions: number;
  repairDurabilityPerPart: number;
  garagePartsMult: number;
  sellMult: number;
  visibility: { base: number; navigatorBonus: number };
  combat: CombatBalance;
}

/** Настройки боя (GDD 8). Время в тиках: один тик — tickSeconds секунд реального времени в клиенте. */
export interface CombatBalance {
  tickSeconds: number;
  /** Стартовая дистанция: 0 — вплотную, 1 — близко, 2 — средняя, 3 — далеко. */
  startDistance: number;
  /** Насколько меняется дистанция за тик при полной скорости одной стороны. */
  distanceStep: number;
  /** Сколько очков отрыва нужно, чтобы уйти. На дальней дистанции +1 за тик. */
  escapeTicks: number;
  /** Сколько очков отрыва за тик на средней дистанции. */
  escapeMidRate: number;
  /** Множитель точности оружия врагов. */
  enemyAccuracyMult: number;
  evasion: { base: number; engine: number; wheels: number; navigator: number; driver: number };
  /** Шанс ранить пассажира у борта при попадании, прошедшем через броню. */
  crewWoundChance: number;
  /** Шанс ранить водителя при попадании в кабину. */
  driverWoundChance: number;
  mechanicRepairTicks: number;
  /** Стрелок на посту чинит свой разбитый ствол на 1 раз в столько тиков. */
  gunnerRepairTicks: number;
  medicHealTicks: number;
  /** Горение: урон 1 каждые burnEvery тиков. */
  burnEvery: number;
  /** Шанс засады на перегоне. */
  ambushChance: number;
  /** Если бой затянулся дольше — враг уходит. */
  maxTicks: number;
  /** Множитель расхода топлива при разбитом двигателе / колёсах. */
  brokenEngineFuelMult: number;
  brokenWheelsFuelMult: number;
}

// ---------- Предметы: оружие и модули ----------

export type SlotKind = "front" | "side" | "roof" | "rear" | "internal";
export type ItemKind = "weapon" | "armor" | "internal" | "utility";

export type PassiveEffect =
  | { type: "tankBonus"; value: number }
  | { type: "fuelMult"; value: number }
  | { type: "healCapacity"; value: number };

export type RangeBand = "contact" | "near" | "mid" | "far";

export type WeaponEffect =
  /** Цель горит: урон 1 по поражённой системе каждые burnEvery тиков. */
  | { type: "burn"; ticks: number }
  /** Автобусы сцеплены: дистанция не растёт, оторваться нельзя. */
  | { type: "tether"; ticks: number }
  /** Цель теряет половину скорости. */
  | { type: "slow"; ticks: number };

/** Боевые параметры оружия (GDD 7.2, 8). */
export interface WeaponStats {
  ranges: RangeBand[];
  /** Сколько тиков заряжается залп. */
  charge: number;
  /** Выстрелов в залпе; каждый бросает попадание отдельно. */
  shots: number;
  damage: number;
  /** Боеприпасов на залп. */
  ammoPerVolley: number;
  /** Базовая точность до уклонения цели. */
  accuracy: number;
  /** Урон по своему корпусу за залп (таран). */
  selfDamage?: number;
  effects?: WeaponEffect[];
}

export interface ItemDef {
  id: string;
  nameKey: string;
  descKey: string;
  kind: ItemKind;
  slotKinds: SlotKind[];
  durability: number;
  price: number;
  installCost: { parts: number };
  tags: string[];
  weapon?: WeaponStats;
  /** Бронелист: насколько снижает урон попадания в свой борт. */
  armor?: { rating: number };
  passive?: PassiveEffect[];
}

// ---------- Автобусы ----------

export interface SeatDef {
  id: string;
  row: number;
  col: number;
  role: SeatRole;
  /** Слот оружия, к которому привязан пост. */
  slot?: string;
}

export interface SlotDef {
  id: string;
  kind: SlotKind;
  /** Места, которые закрывает бронелист в этом слоте. */
  covers?: string[];
}

export interface BusDef {
  id: string;
  nameKey: string;
  rows: number;
  cols: number;
  /** Колонки у бортов: места там уязвимы. */
  exposedCols: number[];
  seats: SeatDef[];
  slots: SlotDef[];
  startEquipment: Record<string, string>;
  /** Прочность бака. На нуле бак пробит и течёт. */
  tankDurability: number;
  /** Корпус: на нуле автобус уничтожен. */
  hull: number;
  systems: { engine: number; wheels: number; cabin: number };
}

// ---------- Враги ----------

export type EnemyKind = "raider" | "rival" | "boss";

/** Профили ИИ: кого обстреливает и на какую дистанцию стремится. */
export type AiProfile = "gunner" | "berserk" | "rammer" | "tank_hunter" | "sniper";

export type EnemyPhaseEffect =
  | { type: "disableWeapons"; count: number }
  | { type: "setAi"; ai: AiProfile }
  | { type: "setPreferredRange"; range: RangeBand };

export interface EnemyDef {
  id: string;
  nameKey: string;
  kind: EnemyKind;
  tier: number;
  /** Вес при случайном выборе врага. */
  weight: number;
  hull: number;
  systems: { engine: number; wheels: number; cabin: number; tank: number };
  evasion: number;
  /** Скорость манёвра, 1 — как у игрока. */
  speed: number;
  /** Снижение каждого попадания. */
  armor: number;
  weapons: string[];
  ai: AiProfile;
  preferredRange: RangeBand;
  /** Доля корпуса, при которой враг пытается уйти. */
  fleeAtHull?: number;
  /** Доля корпуса, при которой враг сдаётся и откупается. */
  surrenderAtHull?: number;
  loot: {
    resources: Partial<Record<ResourceKind, [number, number]>>;
    survivors: [number, number];
  };
  phases?: { atHull: number; effects: EnemyPhaseEffect[] }[];
}

// ---------- Магазины ----------

export type ShopStockDef =
  | { type: "resource"; resource: ResourceKind; amount: [number, number]; price: number }
  | { type: "item"; itemKinds: ItemKind[]; count: [number, number]; priceMult: number };

export interface ShopDef {
  id: ShopKind;
  nameKey: string;
  stock: ShopStockDef[];
}

// ---------- События ----------

/** road — в пути и на происшествиях, stop — на любой обычной остановке, special — на особой остановке. */
export type EventKind = "road" | "stop" | "special";

export type EventCondition =
  | { type: "roadType"; in: RoadType[] }
  | { type: "nodeKind"; in: NodeKind[] }
  | { type: "minPassengers"; value: number }
  | { type: "resourceAtLeast"; resource: ResourceKind; value: number }
  | { type: "hasItemTag"; tag: string };

export interface ChoiceRequirement {
  healthyPassengers?: number;
  resources?: Partial<Resources>;
  itemTag?: string;
}

export type EventEffect =
  | { type: "resource"; delta: Partial<Resources> }
  | { type: "woundPassengers"; count: number }
  | { type: "healWounded"; count: number }
  | { type: "addPassengers"; count: number }
  | { type: "damageItems"; count: number; amount: number }
  | { type: "gainItem"; itemId?: string; itemKinds?: ItemKind[] }
  | { type: "loseActions"; count: number }
  | { type: "damageTank"; amount: number }
  | { type: "repairTank" };

export interface EventChoice {
  textKey: string;
  requires?: ChoiceRequirement;
  /** Без проверки применяются effects. С проверкой — success или fail. */
  effects?: EventEffect[];
  check?: { chance: number };
  success?: EventEffect[];
  fail?: EventEffect[];
}

export interface EventDef {
  id: string;
  kind: EventKind;
  weight: number;
  conditions: EventCondition[];
  textKey: string;
  choices: EventChoice[];
}

// ---------- Весь контент ----------

export interface Content {
  balance: Balance;
  buses: Record<string, BusDef>;
  items: Record<string, ItemDef>;
  shops: Record<ShopKind, ShopDef>;
  enemies: Record<string, EnemyDef>;
  events: EventDef[];
  /** Тексты: ключ → строка. */
  locale: Record<string, string>;
}

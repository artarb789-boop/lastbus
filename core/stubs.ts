/**
 * Временный контент и настройки для M0.
 * На этапах M1/M3 всё это переезжает в data/*.json со схемами.
 * Числа — стартовые прикидки, их будет править агент баланса по отчётам симуляции.
 */
import type { BusLayout, NodeKind, Resources, ResourceKind, RoadType, Seat, ShopKind } from "./state";

export const START_RESOURCES: Resources = {
  fuel: 60,
  food: 8,
  parts: 4,
  ammo: 10,
  medkits: 2,
  tokens: 6,
};

export const TANK_MAX = 80;
export const STOP_ACTIONS = 2;
export const FOOD_EVERY_LEGS = 2;
export const START_PASSENGERS = 3;

export const TICKET_MIN = 1;
export const TICKET_MAX = 5;
/** Жетонов за каждую проеханную остановку. */
export const FARE_PER_STOP = 1;

/** Вес без пассажиров и груза ниже этого порога расход не увеличивает. */
export const WEIGHT_FREE = 10;
export const WEIGHT_FUEL_FACTOR = 0.05;

export const ROAD_FUEL: Record<RoadType, number> = {
  highway: 6,
  dirt: 8,
  bridge: 7,
  detour: 11,
};

export const ROAD_WEIGHTS: { item: RoadType; weight: number }[] = [
  { item: "highway", weight: 35 },
  { item: "dirt", weight: 35 },
  { item: "bridge", weight: 10 },
  { item: "detour", weight: 20 },
];

export const MIDDLE_NODE_WEIGHTS: { item: NodeKind; weight: number }[] = [
  { item: "village", weight: 30 },
  { item: "garage", weight: 10 },
  { item: "junkyard", weight: 12 },
  { item: "checkpoint", weight: 10 },
  { item: "special", weight: 8 },
  { item: "encounter", weight: 20 },
  { item: "incident", weight: 10 },
];

/** Сколько попутчиков садится на остановке каждого типа: [min, max]. */
export const BOARDING: Partial<Record<NodeKind, [number, number]>> = {
  village: [1, 3],
  garage: [0, 1],
  junkyard: [0, 1],
  checkpoint: [0, 2],
  special: [0, 2],
};

export const SHOP_CHANCE = 1 / 3;

export const SHOP_WEIGHTS: { item: ShopKind; weight: number }[] = [
  { item: "kiosk", weight: 35 },
  { item: "gunsmith", weight: 15 },
  { item: "mechanic", weight: 20 },
  { item: "pharmacy", weight: 15 },
  { item: "fleamarket", weight: 15 },
];

/**
 * Ассортимент магазинов в M0: только ресурсы.
 * Оружие и модули появятся в M1 вместе со слотами.
 * amount — [min, max] за одну покупку, price — цена лота в жетонах.
 */
export const SHOP_STOCK: Record<ShopKind, { resource: ResourceKind; amount: [number, number]; price: number }[]> = {
  kiosk: [
    { resource: "fuel", amount: [12, 20], price: 4 },
    { resource: "fuel", amount: [12, 20], price: 4 },
    { resource: "food", amount: [4, 6], price: 3 },
  ],
  gunsmith: [
    { resource: "ammo", amount: [4, 8], price: 3 },
    { resource: "ammo", amount: [4, 8], price: 3 },
  ],
  mechanic: [
    { resource: "parts", amount: [3, 5], price: 4 },
    { resource: "fuel", amount: [8, 12], price: 3 },
  ],
  pharmacy: [
    { resource: "medkits", amount: [1, 2], price: 3 },
    { resource: "food", amount: [3, 5], price: 3 },
  ],
  fleamarket: [
    { resource: "fuel", amount: [8, 16], price: 2 },
    { resource: "food", amount: [3, 6], price: 2 },
    { resource: "ammo", amount: [3, 6], price: 2 },
  ],
};

export const CHECKPOINT_TOLL = 2;

/**
 * Автобус «Рейсовый», вид сверху, перед — строка 0.
 * Колонка 2 — проход (кроме медпункта в последнем ряду).
 * Колонки 0 и 4 — у бортов, места уязвимы.
 */
function seat(row: number, col: number, role: Seat["role"], slot: string | null = null): Seat {
  return { id: `r${row}c${col}`, row, col, role, slot, exposed: col === 0 || col === 4 };
}

export const BUS_CITY: BusLayout = {
  id: "bus_city",
  rows: 5,
  cols: 5,
  seats: [
    seat(0, 0, "driver"),
    seat(0, 1, "navigator"),
    seat(0, 3, "plain"),
    seat(0, 4, "plain"),

    seat(1, 0, "weapon", "sideL1"),
    seat(1, 1, "plain"),
    seat(1, 3, "plain"),
    seat(1, 4, "weapon", "sideR1"),

    seat(2, 0, "plain"),
    seat(2, 1, "plain"),
    seat(2, 3, "weapon", "roof"),
    seat(2, 4, "plain"),

    seat(3, 0, "weapon", "sideL2"),
    seat(3, 1, "plain"),
    seat(3, 3, "plain"),
    seat(3, 4, "weapon", "sideR2"),

    seat(4, 0, "mechanic"),
    seat(4, 1, "plain"),
    seat(4, 2, "medic"),
    seat(4, 3, "plain"),
    seat(4, 4, "weapon", "rear"),
  ],
};

export const LOOK_VARIANTS = 64;

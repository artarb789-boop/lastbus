/**
 * Каталог картинок, которые ждёт игра: путь в assets/img/, допустимый размер и приоритет.
 * Им пользуются проверка манифеста (tools/check-art.ts), витрина (game/gallery.ts) и бриф художника.
 * Без зависимостей от браузера.
 */
import { RESOURCE_KINDS, STOP_KINDS, type Content } from "../../core";

export type ArtCategory =
  | "buses"
  | "weapons"
  | "items"
  | "people"
  | "drivers"
  | "map"
  | "resources"
  | "events"
  | "shops"
  | "scene";

export interface ArtSpec {
  /** Путь относительно assets/img/, например "buses/enemy_rammer.png". */
  path: string;
  category: ArtCategory;
  /** Допустимая ширина: точная или диапазон. */
  w: number | [number, number];
  h: number;
  priority: 1 | 2 | 3;
  /** Подпись для витрины. */
  label: string;
}

export type ArtStatus = "draft" | "approved" | "rejected";

export interface ManifestEntry {
  w: number;
  h: number;
  status: ArtStatus;
  prompt?: string;
  note?: string;
}

export type Manifest = Record<string, ManifestEntry>;

export const NODE_ICON_KINDS = ["start", ...STOP_KINDS, "encounter", "incident", "boss"] as const;
export const SCENE_LAYERS = ["sky", "dunes_far", "dunes_near", "road"] as const;

/** Размеры в игровых пикселях; на экране — целый масштаб. */
export const SIZES = {
  bus: { w: [44, 64] as [number, number], h: 24 },
  busPlayer: { w: 60, h: 24 },
  busBoss: { w: 80, h: 28 },
  weapon: { w: 16, h: 10 },
  item: { w: 24, h: 24 },
  person: { w: 7, h: 9 },
  driver: { w: 32, h: 32 },
  node: { w: 16, h: 16 },
  resource: { w: 12, h: 12 },
  event: { w: 160, h: 90 },
  shop: { w: 64, h: 32 },
  scene: { w: 334, h: 70 },
};

export function artCatalog(content: Content): ArtSpec[] {
  const out: ArtSpec[] = [];
  const name = (key: string) => content.locale[key] ?? key;

  out.push({ path: "buses/bus_city.png", category: "buses", ...SIZES.busPlayer, priority: 1, label: "Автобус игрока" });
  for (const e of Object.values(content.enemies)) {
    const size = e.id === "enemy_boss_prison_bus" ? SIZES.busBoss : e.id === "enemy_nemesis" ? SIZES.busPlayer : SIZES.bus;
    out.push({ path: `buses/${e.id}.png`, category: "buses", ...size, priority: 1, label: name(e.nameKey) });
    out.push({ path: `buses/${e.id}_wreck.png`, category: "buses", ...size, priority: 3, label: `${name(e.nameKey)}, подбит` });
  }
  for (const item of Object.values(content.items)) {
    if (item.kind === "weapon") {
      out.push({ path: `weapons/${item.id}.png`, category: "weapons", ...SIZES.weapon, priority: 1, label: name(item.nameKey) });
    }
    out.push({ path: `items/${item.id}.png`, category: "items", ...SIZES.item, priority: 1, label: name(item.nameKey) });
  }
  out.push({ path: "people/passenger_base.png", category: "people", ...SIZES.person, priority: 1, label: "Пассажир" });
  out.push({ path: "people/passenger_wounded.png", category: "people", ...SIZES.person, priority: 1, label: "Пассажир, ранен" });
  for (const d of Object.values(content.drivers)) {
    out.push({ path: `drivers/${d.id}.png`, category: "drivers", ...SIZES.driver, priority: 1, label: name(d.nameKey) });
  }
  for (const kind of NODE_ICON_KINDS) {
    out.push({ path: `map/${kind}.png`, category: "map", ...SIZES.node, priority: 2, label: kind });
  }
  for (const kind of RESOURCE_KINDS) {
    out.push({ path: `resources/${kind}.png`, category: "resources", ...SIZES.resource, priority: 2, label: kind });
  }
  for (const s of Object.values(content.shops)) {
    out.push({ path: `shops/${s.id}.png`, category: "shops", ...SIZES.shop, priority: 2, label: name(s.nameKey) });
  }
  for (const layer of SCENE_LAYERS) {
    out.push({ path: `scene/${layer}.png`, category: "scene", ...SIZES.scene, priority: 2, label: layer });
  }
  for (const ev of content.events) {
    out.push({ path: `events/${ev.id}.png`, category: "events", ...SIZES.event, priority: 3, label: ev.id });
  }
  return out;
}

export function sizeOk(spec: Pick<ArtSpec, "w" | "h">, w: number, h: number): boolean {
  const wOk = typeof spec.w === "number" ? w === spec.w : w >= spec.w[0] && w <= spec.w[1];
  return wOk && h === spec.h;
}

export function sizeLabel(spec: Pick<ArtSpec, "w" | "h">): string {
  return `${typeof spec.w === "number" ? spec.w : `${spec.w[0]}–${spec.w[1]}`}×${spec.h}`;
}

/**
 * Сборка Content из сырых JSON-файлов. Чистая функция: файлы читает загрузчик
 * (tools/load-content.ts для Node, game/content.ts для браузера).
 */
import type { Balance, BusDef, Content, DriverDef, EnemyDef, EventDef, ItemDef, ShopDef } from "./content";
import type { ShopKind } from "./state";

export type SchemaName = "balance" | "item" | "bus" | "shop" | "event" | "enemy" | "driver" | "locale";

export interface RawFile {
  /** Путь относительно data/, например "weapons/wpn_mg.json". */
  file: string;
  schema: SchemaName;
  data: unknown;
}

/** Папка в data/ → схема её файлов. */
export const DATA_GROUPS: [string, SchemaName][] = [
  ["weapons", "item"],
  ["modules", "item"],
  ["buses", "bus"],
  ["shops", "shop"],
  ["events", "event"],
  ["enemies", "enemy"],
  ["drivers", "driver"],
  ["locale/ru", "locale"],
];

/** Схема файла по его пути относительно data/. null — файл не контент (например, схема). */
export function schemaForPath(file: string): SchemaName | null {
  if (file === "balance.json") return "balance";
  const dir = file.slice(0, file.lastIndexOf("/"));
  return DATA_GROUPS.find(([d]) => d === dir)?.[1] ?? null;
}

function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1).replace(/\.json$/, "");
}

export function buildContent(raw: RawFile[]): Content {
  const content: Content = {
    balance: undefined as unknown as Balance,
    buses: {},
    items: {},
    shops: {} as Record<ShopKind, ShopDef>,
    enemies: {},
    drivers: {},
    events: [],
    locale: {},
  };
  // Порядок файлов фиксирован, чтобы контент (а значит и забег) не зависел от загрузчика.
  const sorted = [...raw].sort((a, b) => a.file.localeCompare(b.file));
  for (const { file, schema, data } of sorted) {
    const name = baseName(file);
    const withId = data as { id?: string };
    if (schema !== "balance" && schema !== "locale" && withId.id !== name) {
      throw new Error(`${file}: id "${withId.id}" must match file name "${name}"`);
    }
    switch (schema) {
      case "balance":
        content.balance = data as Balance;
        break;
      case "item":
        content.items[name] = data as ItemDef;
        break;
      case "bus":
        content.buses[name] = data as BusDef;
        break;
      case "shop":
        content.shops[name as ShopKind] = data as ShopDef;
        break;
      case "event":
        content.events.push(data as EventDef);
        break;
      case "enemy":
        content.enemies[name] = data as EnemyDef;
        break;
      case "driver":
        content.drivers[name] = data as DriverDef;
        break;
      case "locale":
        for (const [k, v] of Object.entries(data as Record<string, string>)) {
          if (k in content.locale) throw new Error(`${file}: duplicate text key ${k}`);
          content.locale[k] = v;
        }
        break;
    }
  }
  if (!content.balance) throw new Error("balance.json is missing");
  return content;
}

/**
 * Загрузка контента из data/ для Node (симуляция, тесты, валидатор).
 * Клиент на Vite получит свой загрузчик через import.meta.glob.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Balance, BusDef, Content, EnemyDef, EventDef, ItemDef, ShopDef } from "../core/content";
import type { ShopKind } from "../core/state";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

export type SchemaName = "balance" | "item" | "bus" | "shop" | "event" | "enemy" | "locale";

export interface RawFile {
  /** Путь относительно data/. */
  file: string;
  schema: SchemaName;
  data: unknown;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function listJson(dir: string): string[] {
  return readdirSync(join(DATA_DIR, dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => `${dir}/${f}`);
}

/** Все файлы контента со схемой, которой они должны соответствовать. */
export function loadRawFiles(): RawFile[] {
  const files: RawFile[] = [{ file: "balance.json", schema: "balance", data: readJson(join(DATA_DIR, "balance.json")) }];
  const groups: [string, SchemaName][] = [
    ["weapons", "item"],
    ["modules", "item"],
    ["buses", "bus"],
    ["shops", "shop"],
    ["events", "event"],
    ["enemies", "enemy"],
    ["locale/ru", "locale"],
  ];
  for (const [dir, schema] of groups) {
    for (const file of listJson(dir)) files.push({ file, schema, data: readJson(join(DATA_DIR, file)) });
  }
  return files;
}

export function buildContent(raw: RawFile[]): Content {
  const content: Content = {
    balance: undefined as unknown as Balance,
    buses: {},
    items: {},
    shops: {} as Record<ShopKind, ShopDef>,
    enemies: {},
    events: [],
    locale: {},
  };
  for (const { file, schema, data } of raw) {
    const name = basename(file, ".json");
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
      case "locale":
        for (const [k, v] of Object.entries(data as Record<string, string>)) {
          if (k in content.locale) throw new Error(`${file}: duplicate text key ${k}`);
          content.locale[k] = v;
        }
        break;
    }
  }
  return content;
}

let cached: Content | null = null;

/** Контент из data/. Схемы здесь не проверяются — это делает tools/validate-data.ts и тесты. */
export function loadContent(): Content {
  cached ??= buildContent(loadRawFiles());
  return cached;
}

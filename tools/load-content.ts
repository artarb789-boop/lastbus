/**
 * Загрузка контента из data/ для Node (симуляция, тесты, валидатор).
 * Браузерный клиент загружает те же файлы через import.meta.glob (game/content.ts).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Content } from "../core/content";
import { buildContent, DATA_GROUPS, type RawFile } from "../core/content-build";

export { buildContent, type RawFile, type SchemaName } from "../core/content-build";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

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
  for (const [dir, schema] of DATA_GROUPS) {
    for (const file of listJson(dir)) files.push({ file, schema, data: readJson(join(DATA_DIR, file)) });
  }
  return files;
}

let cached: Content | null = null;

/** Контент из data/. Схемы здесь не проверяются — это делает tools/validate-data.ts и тесты. */
export function loadContent(): Content {
  cached ??= buildContent(loadRawFiles());
  return cached;
}

/**
 * Проверка всего контента в data/: JSON Schema для каждого файла и перекрёстные ссылки.
 *   npm run validate
 */
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkContent } from "../core/content-check";
import { buildContent, DATA_DIR, loadRawFiles, type SchemaName } from "./load-content";

const SCHEMA_FILES: Record<Exclude<SchemaName, "locale">, string> = {
  balance: "balance.schema.json",
  item: "item.schema.json",
  bus: "bus.schema.json",
  shop: "shop.schema.json",
  event: "event.schema.json",
  enemy: "enemy.schema.json",
  driver: "driver.schema.json",
};

const LOCALE_SCHEMA = {
  type: "object",
  propertyNames: { pattern: "^[a-z][a-z0-9_.]*$" },
  additionalProperties: { type: "string", minLength: 1 },
};

export function validateData(): string[] {
  // strictTypes выключен: он требует "type" в каждой подсхеме allOf/oneOf, это лишний шум.
  // Неизвестные ключевые слова и опечатки в схемах по-прежнему ловятся (strict: true).
  const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
  ajv.addSchema(JSON.parse(readFileSync(join(DATA_DIR, "schemas", "common.schema.json"), "utf-8")));
  const validators = Object.fromEntries(
    Object.entries(SCHEMA_FILES).map(([name, file]) => [
      name,
      ajv.compile(JSON.parse(readFileSync(join(DATA_DIR, "schemas", file), "utf-8"))),
    ]),
  ) as Record<string, ReturnType<typeof ajv.compile>>;
  validators.locale = ajv.compile(LOCALE_SCHEMA);

  const errors: string[] = [];
  const raw = loadRawFiles();
  for (const f of raw) {
    const validate = validators[f.schema]!;
    if (!validate(f.data)) {
      for (const e of validate.errors ?? []) errors.push(`${f.file}: ${e.instancePath || "/"} ${e.message}`);
    }
  }
  if (errors.length > 0) return errors;

  try {
    return checkContent(buildContent(raw));
  } catch (e) {
    return [(e as Error).message];
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/validate-data.ts")) {
  const errors = validateData();
  if (errors.length > 0) {
    console.error(`Data validation failed (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("Data OK");
}

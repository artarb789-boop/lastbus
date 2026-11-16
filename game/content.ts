/**
 * Загрузка контента в браузере: Vite встраивает все JSON из data/ в сборку.
 */
import type { Content } from "../core/content";
import { buildContent, schemaForPath, type RawFile } from "../core/content-build";

const modules = import.meta.glob("../data/**/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export function loadBrowserContent(): Content {
  const raw: RawFile[] = [];
  for (const [path, data] of Object.entries(modules)) {
    const file = path.replace(/^\.\.\/data\//, "");
    const schema = schemaForPath(file);
    if (schema) raw.push({ file, schema, data });
  }
  return buildContent(raw);
}

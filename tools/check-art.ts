/**
 * Проверка картинок: каждая запись манифеста есть в каталоге, файл существует,
 * размер совпадает с каталогом и с самим PNG, нет полупрозрачных пикселей.
 * Без аргументов печатает и сводку: сколько ассетов готово по приоритетам.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { artCatalog, sizeLabel, sizeOk } from "../game/art/catalog";
import { IMG_DIR, readManifest, readPng } from "./art-io";
import { loadContent } from "./load-content";
import { hasSemiTransparent } from "./pixelize-lib";

const STATUSES = new Set(["draft", "approved", "rejected"]);

export function checkArt(): { errors: string[]; summary: string } {
  const errors: string[] = [];
  const catalog = artCatalog(loadContent());
  const byPath = new Map(catalog.map((s) => [s.path, s]));
  const manifest = readManifest();

  for (const [path, entry] of Object.entries(manifest)) {
    const spec = byPath.get(path);
    if (!spec) {
      errors.push(`${path}: нет в каталоге (game/art/catalog.ts) — проверьте id и папку`);
      continue;
    }
    if (!STATUSES.has(entry.status)) errors.push(`${path}: неизвестный статус "${entry.status}"`);
    if (entry.status === "rejected" && !entry.note) errors.push(`${path}: у rejected должна быть причина в note`);
    const file = join(IMG_DIR, path);
    if (!existsSync(file)) {
      errors.push(`${path}: файла нет`);
      continue;
    }
    const img = readPng(file);
    if (img.width !== entry.w || img.height !== entry.h) {
      errors.push(`${path}: в манифесте ${entry.w}×${entry.h}, а файл ${img.width}×${img.height}`);
    }
    if (!sizeOk(spec, img.width, img.height)) errors.push(`${path}: размер ${img.width}×${img.height}, нужно ${sizeLabel(spec)}`);
    if (hasSemiTransparent(img)) errors.push(`${path}: есть полупрозрачные пиксели — прогоните через pixelize`);
  }

  // Готовые PNG, забытые в манифесте (исходники *_src и превью *_x3 не в счёт).
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  if (existsSync(IMG_DIR)) {
    for (const file of walk(IMG_DIR)) {
      const rel = file.slice(IMG_DIR.length + 1).replace(/\\/g, "/");
      if (!rel.endsWith(".png") || /_(src|x3)\.png$/.test(rel)) continue;
      if (!manifest[rel]) errors.push(`${rel}: файл есть, а в манифесте записи нет`);
    }
  }

  const lines: string[] = [];
  for (const p of [1, 2, 3] as const) {
    const specs = catalog.filter((s) => s.priority === p);
    const count = (st: string) => specs.filter((s) => manifest[s.path]?.status === st).length;
    lines.push(`P${p}: принято ${count("approved")}, черновиков ${count("draft")}, отклонено ${count("rejected")}, всего ${specs.length}`);
  }
  return { errors, summary: lines.join("\n") };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/check-art.ts")) {
  const { errors, summary } = checkArt();
  console.log(summary);
  if (errors.length > 0) {
    console.error(`Art check failed (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("Art OK");
}

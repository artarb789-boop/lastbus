/** Чтение и запись PNG и манифеста картинок (assets/img/manifest.json). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { Manifest } from "../game/art/catalog";
import type { Image } from "./pixelize-lib";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const IMG_DIR = join(ROOT, "assets", "img");
export const MANIFEST_PATH = join(IMG_DIR, "manifest.json");

export function readPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function writePng(path: string, img: Image): void {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}

export function readManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

export function writeManifest(m: Manifest): void {
  const sorted = Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]!]));
  writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

/** Путь файла относительно assets/img/ с прямыми слешами, или null, если файл не там. */
export function imgKey(absPath: string): string | null {
  const rel = relative(IMG_DIR, absPath).replace(/\\/g, "/");
  return rel.startsWith("..") || rel.includes(":") ? null : rel;
}

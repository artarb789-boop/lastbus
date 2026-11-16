/**
 * Пикселизация сгенерированной картинки.
 *
 *   npm run pixelize -- assets/img/buses/enemy_rammer_src.png
 *   npm run pixelize -- <исходник> [--out <png>] [--size 60x24] [--anchor bottom|center]
 *                       [--palette base|people|none] [--band <id>] [--extra "#aabbcc,#112233"]
 *                       [--colors N] [--key "#ff00ff"|none] [--tol 90] [--coverage 0.5]
 *                       [--prompt "..."] [--x3]
 *
 * По умолчанию результат пишется рядом с исходником без суффикса _src, размер и настройки
 * берутся из каталога (game/art/catalog.ts) по пути, а запись в манифесте получает статус draft.
 */
import { resolve } from "node:path";
import { artCatalog, sizeLabel, type ArtCategory, type ArtSpec } from "../game/art/catalog";
import { BAND_COLORS, BANDAGE, BASE_PALETTE, hexToRgb, PERSON_KEYS } from "../game/art/palette";
import { imgKey, readManifest, readPng, writeManifest, writePng } from "./art-io";
import { loadContent } from "./load-content";
import { countColors, DEFAULTS, pixelize, type Image, type PixelizeOptions, type Rgb } from "./pixelize-lib";

function args(argv: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[a.slice(2)] = "true";
      else {
        flags[a.slice(2)] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { positional, flags };
}

/** Настройки по умолчанию для категории. */
const CATEGORY: Record<ArtCategory, { anchor: "bottom" | "center"; palette: "base" | "people"; colors: number }> = {
  buses: { anchor: "bottom", palette: "base", colors: 4 },
  weapons: { anchor: "bottom", palette: "base", colors: 3 },
  items: { anchor: "center", palette: "base", colors: 5 },
  people: { anchor: "bottom", palette: "people", colors: 0 },
  drivers: { anchor: "bottom", palette: "base", colors: 8 },
  map: { anchor: "center", palette: "base", colors: 3 },
  resources: { anchor: "center", palette: "base", colors: 3 },
  events: { anchor: "center", palette: "base", colors: 12 },
  shops: { anchor: "center", palette: "base", colors: 6 },
  scene: { anchor: "bottom", palette: "base", colors: 6 },
};

function upscale(img: Image, k: number): Image {
  const out: Image = { width: img.width * k, height: img.height * k, data: new Uint8Array(img.width * k * img.height * k * 4) };
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}

function main(): void {
  const { positional, flags } = args(process.argv.slice(2));
  const srcArg = positional[0];
  if (!srcArg) {
    console.error("Укажите исходную картинку: npm run pixelize -- assets/img/buses/bus_city_src.png");
    process.exit(1);
  }
  const src = resolve(srcArg);
  const out = resolve(flags.out ?? src.replace(/_src(\.png)$/i, "$1"));
  if (out === src) {
    console.error("Исходник должен называться <имя>_src.png или нужен --out.");
    process.exit(1);
  }

  const key = imgKey(out);
  const content = loadContent();
  const spec: ArtSpec | undefined = key ? artCatalog(content).find((s) => s.path === key) : undefined;
  const cat = spec ? CATEGORY[spec.category] : undefined;

  let width: PixelizeOptions["width"];
  let height: number;
  if (flags.size) {
    const m = /^(\d+)x(\d+)$/.exec(flags.size);
    if (!m) throw new Error("--size в формате 60x24");
    width = Number(m[1]);
    height = Number(m[2]);
  } else if (spec) {
    width = spec.w;
    height = spec.h;
  } else {
    console.error(`Файл ${key ?? out} не из каталога: укажите --size.`);
    process.exit(1);
  }

  const paletteMode = flags.palette ?? cat?.palette ?? "base";
  const palette: Rgb[] = [];
  if (paletteMode !== "none") palette.push(...Object.values(BASE_PALETTE).map(hexToRgb));
  if (paletteMode === "people") palette.push(...Object.values(PERSON_KEYS).map(hexToRgb), hexToRgb(BANDAGE));
  const bandId = flags.band ?? (spec?.category === "buses" ? key!.replace(/^buses\/|(_wreck)?\.png$/g, "") : undefined);
  if (bandId && BAND_COLORS[bandId] && paletteMode !== "none") palette.push(...BAND_COLORS[bandId]!.map(hexToRgb));
  if (flags.extra) palette.push(...flags.extra.split(",").map((h) => hexToRgb(h.trim())));

  const opts: PixelizeOptions = {
    ...DEFAULTS,
    width,
    height,
    anchor: (flags.anchor as "bottom" | "center") ?? cat?.anchor ?? "center",
    palette,
    freeColors: flags.colors !== undefined ? Number(flags.colors) : (cat?.colors ?? DEFAULTS.freeColors),
    key: flags.key === "none" ? null : flags.key ? hexToRgb(flags.key) : DEFAULTS.key,
    keyTolerance: flags.tol ? Number(flags.tol) : DEFAULTS.keyTolerance,
    coverage: flags.coverage ? Number(flags.coverage) : DEFAULTS.coverage,
  };

  const result = pixelize(readPng(src), opts);
  writePng(out, result);
  console.log(`${key ?? out}: ${result.width}×${result.height}, цветов ${countColors(result)}${spec ? `, по каталогу ${sizeLabel(spec)}` : ""}`);

  if (flags.x3) {
    const preview = out.replace(/\.png$/i, "_x3.png");
    writePng(preview, upscale(result, 3));
    console.log(`превью ×3: ${preview}`);
  }

  if (key) {
    const manifest = readManifest();
    const prev = manifest[key];
    manifest[key] = {
      w: result.width,
      h: result.height,
      status: "draft",
      ...(flags.prompt ? { prompt: flags.prompt } : prev?.prompt ? { prompt: prev.prompt } : {}),
    };
    writeManifest(manifest);
    console.log(`манифест: ${key} → draft`);
  }
}

main();

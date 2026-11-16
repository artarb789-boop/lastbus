/**
 * Сгенерированные картинки из assets/img/. В игру попадают только записи манифеста со статусом
 * approved; всё остальное игра рисует кодом, как раньше. С параметром ?art=draft в адресе
 * показываются и черновики — чтобы художник видел свою работу в игре до утверждения.
 */
import type { Manifest } from "./catalog";
import { hexToRgb, PERSON_KEYS } from "./palette";
import { lookColors } from "./people";

const files = import.meta.glob("../../assets/img/**/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const manifestModules = import.meta.glob("../../assets/img/manifest.json", { eager: true, import: "default" }) as Record<string, Manifest>;
export const manifest: Manifest = Object.values(manifestModules)[0] ?? {};

export interface ArtImage {
  url: string;
  w: number;
  h: number;
}

const urls = new Map<string, string>();
for (const [p, url] of Object.entries(files)) urls.set(p.replace(/^.*assets\/img\//, ""), url);

export const showDrafts = typeof location !== "undefined" && new URLSearchParams(location.search).get("art") === "draft";

/** URL файла по пути из assets/img/, без учёта статуса (для витрины). */
export function fileUrl(path: string): string | undefined {
  return urls.get(path);
}

/** Картинка для игры: есть файл и запись approved (или draft в режиме ?art=draft). */
export function art(path: string): ArtImage | null {
  const entry = manifest[path];
  const url = urls.get(path);
  if (!entry || !url) return null;
  if (entry.status !== "approved" && !(showDrafts && entry.status === "draft")) return null;
  return { url, w: entry.w, h: entry.h };
}

/** <img> с целым масштабом или пустая строка, если картинки нет. */
export function artImg(path: string, scale: number, cls = "", alt = ""): string {
  const a = art(path);
  if (!a) return "";
  return `<img class="px ${cls}" src="${a.url}" width="${a.w * scale}" height="${a.h * scale}" alt="${alt}">`;
}

// ---------- Пассажиры: перекраска серой базы ----------

const bases = new Map<string, ImageData>();
const personCache = new Map<string, string>();

function decode(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Загрузить то, что нужно разобрать по пикселям. Вызывается один раз до первой отрисовки. */
export async function loadArt(): Promise<void> {
  for (const key of ["people/passenger_base.png", "people/passenger_wounded.png"]) {
    const a = art(key);
    if (!a) continue;
    try {
      bases.set(key, await decode(a.url));
    } catch {
      // Битый файл — просто остаёмся на спрайте кодом.
    }
  }
}

const KEYS = (Object.entries(PERSON_KEYS) as [keyof typeof PERSON_KEYS, string][]).map(([k, hex]) => [k, hexToRgb(hex)] as const);

/** Пассажир из сгенерированной базы в цветах его внешности, или null. */
export function personUrl(look: number, wounded: boolean): string | null {
  const key = wounded ? "people/passenger_wounded.png" : "people/passenger_base.png";
  const base = bases.get(key) ?? (wounded ? bases.get("people/passenger_base.png") : undefined);
  if (!base) return null;
  const cacheKey = `${key}|${look}`;
  const hit = personCache.get(cacheKey);
  if (hit) return hit;
  const colors = lookColors(look);
  const target = { hair: hexToRgb(colors.H), skin: hexToRgb(colors.S), clothes: hexToRgb(colors.C) };
  const data = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i + 3] === 0) continue;
    for (const [name, rgb] of KEYS) {
      if (Math.abs(data.data[i]! - rgb[0]) + Math.abs(data.data[i + 1]! - rgb[1]) + Math.abs(data.data[i + 2]! - rgb[2]) <= 12) {
        const t = target[name];
        data.data[i] = t[0];
        data.data[i + 1] = t[1];
        data.data[i + 2] = t[2];
        break;
      }
    }
  }
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  c.getContext("2d")!.putImageData(data, 0, 0);
  const url = c.toDataURL("image/png");
  personCache.set(cacheKey, url);
  return url;
}

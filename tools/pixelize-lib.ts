/**
 * Превращение крупной сгенерированной картинки в пиксель-арт целевого размера.
 * Чистые функции над RGBA-буфером: без файлов, чтобы их можно было тестировать.
 *
 * Шаги: хромакей → прозрачность, обрезка по объекту, вписывание в целевой размер,
 * уменьшение блоками (цвет блока — самый частый после приведения к палитре), порог прозрачности.
 */
import { hexToRgb } from "../game/art/palette";

export interface Image {
  width: number;
  height: number;
  /** RGBA, по 4 байта на пиксель. */
  data: Uint8Array;
}

export type Rgb = [number, number, number];

export interface PixelizeOptions {
  /** Целевая высота. */
  height: number;
  /** Целевая ширина: точная или диапазон (тогда берётся по пропорциям объекта). */
  width: number | [number, number];
  /** Прижать объект к нижнему краю (автобусы, оружие) или по центру (иконки). */
  anchor: "bottom" | "center";
  /** Обязательные цвета. Пусто — без привязки к палитре. */
  palette: Rgb[];
  /** Сколько своих цветов можно добавить к палитре для того, что в неё не попадает. */
  freeColors: number;
  /** Цвет фона-хромакея и допуск. */
  key: Rgb | null;
  keyTolerance: number;
  /** Доля непрозрачных пикселей в блоке, при которой целевой пиксель непрозрачен. */
  coverage: number;
}

export const DEFAULTS: Omit<PixelizeOptions, "height" | "width" | "palette"> = {
  anchor: "center",
  freeColors: 4,
  key: hexToRgb("#ff00ff"),
  keyTolerance: 90,
  coverage: 0.5,
};

export function blank(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Перцептивное расстояние между цветами (redmean), в квадрате. */
export function dist2(a: Rgb, b: Rgb): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

export function nearest(c: Rgb, palette: Rgb[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = dist2(c, palette[i]!);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Хромакей: пиксели, близкие к цвету фона, становятся прозрачными. */
export function keyOut(img: Image, key: Rgb, tolerance: number): Image {
  const out: Image = { ...img, data: new Uint8Array(img.data) };
  const t2 = tolerance * tolerance * 3;
  for (let i = 0; i < out.data.length; i += 4) {
    const c: Rgb = [out.data[i]!, out.data[i + 1]!, out.data[i + 2]!];
    const d = (c[0] - key[0]) ** 2 + (c[1] - key[1]) ** 2 + (c[2] - key[2]) ** 2;
    if (d <= t2) out.data[i + 3] = 0;
  }
  return out;
}

export function bbox(img: Image): { x: number; y: number; w: number; h: number } | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! > 127) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Непрозрачные пиксели картинки, для подбора своих цветов. */
function opaquePixels(img: Image): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! > 127) out.push([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]);
  }
  return out;
}

/**
 * Свои цвета: k-средних по пикселям, которые далеко от обязательной палитры.
 * Детерминированно: начальные центры — самые удалённые точки.
 */
export function extraColors(pixels: Rgb[], palette: Rgb[], count: number, threshold = 900): Rgb[] {
  if (count <= 0) return [];
  // Прореживаем, чтобы не считать миллионы пикселей.
  const step = Math.max(1, Math.floor(pixels.length / 20000));
  const far: Rgb[] = [];
  for (let i = 0; i < pixels.length; i += step) {
    const p = pixels[i]!;
    if (palette.length === 0 || dist2(p, palette[nearest(p, palette)]!) > threshold) far.push(p);
  }
  if (far.length === 0) return [];
  const centers: Rgb[] = [far[0]!];
  while (centers.length < Math.min(count, far.length)) {
    let best = far[0]!;
    let bestD = -1;
    for (const p of far) {
      const d = Math.min(...centers.map((c) => dist2(p, c)));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    if (bestD <= 0) break;
    centers.push(best);
  }
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of far) {
      const s = sums[nearest(p, centers)]!;
      s[0]! += p[0];
      s[1]! += p[1];
      s[2]! += p[2];
      s[3]! += 1;
    }
    sums.forEach((s, i) => {
      if (s[3]! > 0) centers[i] = [Math.round(s[0]! / s[3]!), Math.round(s[1]! / s[3]!), Math.round(s[2]! / s[3]!)];
    });
  }
  return centers;
}

/** Главная функция: исходник → пиксель-арт целевого размера. */
export function pixelize(src: Image, opts: PixelizeOptions): Image {
  const keyed = opts.key ? keyOut(src, opts.key, opts.keyTolerance) : src;
  const box = bbox(keyed);
  const H = opts.height;
  if (!box) {
    const w = typeof opts.width === "number" ? opts.width : opts.width[0];
    return blank(w, H);
  }

  // Ширина результата и масштаб вписывания.
  let W: number;
  if (typeof opts.width === "number") W = opts.width;
  else W = Math.min(opts.width[1], Math.max(opts.width[0], Math.round((box.w * H) / box.h)));
  const scale = Math.max(box.w / W, box.h / H); // исходных пикселей на один целевой
  const fitW = Math.max(1, Math.min(W, Math.round(box.w / scale)));
  const fitH = Math.max(1, Math.min(H, Math.round(box.h / scale)));
  const offX = Math.floor((W - fitW) / 2);
  const offY = opts.anchor === "bottom" ? H - fitH : Math.floor((H - fitH) / 2);

  const palette = [...opts.palette];
  palette.push(...extraColors(opaquePixels(keyed), opts.palette, opts.freeColors));
  const quantize = palette.length > 0;

  const out = blank(W, H);
  for (let ty = 0; ty < fitH; ty++) {
    for (let tx = 0; tx < fitW; tx++) {
      const sx0 = box.x + Math.floor((tx * box.w) / fitW);
      const sx1 = Math.max(sx0 + 1, box.x + Math.floor(((tx + 1) * box.w) / fitW));
      const sy0 = box.y + Math.floor((ty * box.h) / fitH);
      const sy1 = Math.max(sy0 + 1, box.y + Math.floor(((ty + 1) * box.h) / fitH));
      let total = 0;
      let opaque = 0;
      const votes = new Map<number, number>();
      const sum = [0, 0, 0];
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          total++;
          const i = (y * keyed.width + x) * 4;
          if (keyed.data[i + 3]! <= 127) continue;
          opaque++;
          const c: Rgb = [keyed.data[i]!, keyed.data[i + 1]!, keyed.data[i + 2]!];
          if (quantize) {
            const k = nearest(c, palette);
            votes.set(k, (votes.get(k) ?? 0) + 1);
          } else {
            sum[0]! += c[0];
            sum[1]! += c[1];
            sum[2]! += c[2];
          }
        }
      }
      if (total === 0 || opaque / total < opts.coverage) continue;
      let color: Rgb;
      if (quantize) {
        let best = 0;
        let bestN = -1;
        for (const [k, n] of votes) {
          if (n > bestN || (n === bestN && k < best)) {
            best = k;
            bestN = n;
          }
        }
        color = palette[best]!;
      } else {
        color = [Math.round(sum[0]! / opaque), Math.round(sum[1]! / opaque), Math.round(sum[2]! / opaque)];
      }
      const o = ((offY + ty) * W + offX + tx) * 4;
      out.data[o] = color[0];
      out.data[o + 1] = color[1];
      out.data[o + 2] = color[2];
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Сколько разных непрозрачных цветов в картинке — для отчёта. */
export function countColors(img: Image): number {
  const set = new Set<number>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! > 0) set.add((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!);
  }
  return set.size;
}

/** Есть ли полупрозрачные пиксели (в пиксель-арте их быть не должно). */
export function hasSemiTransparent(img: Image): boolean {
  for (let i = 3; i < img.data.length; i += 4) {
    const a = img.data[i]!;
    if (a > 0 && a < 255) return true;
  }
  return false;
}

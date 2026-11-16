/**
 * Пиксель-арт кодом. Спрайт — это матрица символов, каждый символ — цвет палитры, "." — прозрачно.
 * Матрица рисуется на canvas один раз и кешируется как data URL; в SVG и HTML спрайт
 * масштабируется целыми коэффициентами с image-rendering: pixelated.
 */

export type Sprite = { rows: string[]; palette: Record<string, string> };

import { BASE_PALETTE } from "./palette";

export { BASE_PALETTE };

const cache = new Map<string, string>();

export function spriteKey(s: Sprite): string {
  return JSON.stringify(s.palette) + "|" + s.rows.join("/");
}

/** Data URL с PNG спрайта в натуральном размере (1 символ = 1 пиксель). */
export function spriteUrl(s: Sprite): string {
  const key = spriteKey(s);
  const hit = cache.get(key);
  if (hit) return hit;
  const h = s.rows.length;
  const w = Math.max(...s.rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = s.rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === "." || ch === " ") continue;
      const color = s.palette[ch] ?? BASE_PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

export function spriteSize(s: Sprite): { w: number; h: number } {
  return { w: Math.max(...s.rows.map((r) => r.length)), h: s.rows.length };
}

/** Простой холст-матрица для процедурной отрисовки спрайтов. */
export class Grid {
  readonly cells: string[][];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = Array.from({ length: h }, () => Array<string>(w).fill("."));
  }
  set(x: number, y: number, ch: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y]![x] = ch;
  }
  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
  }
  hline(x0: number, x1: number, y: number, ch: string): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, ch);
  }
  get(x: number, y: number): string {
    return this.cells[y]?.[x] ?? ".";
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(""));
  }
}

/** Детерминированный «шум» для пятен ржавчины и прочих мелочей. */
export function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

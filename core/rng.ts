/**
 * Seeded RNG — единственный источник случайности в core/.
 * Состояние хранится в RunState, поэтому забег полностью воспроизводится по seed и списку команд.
 * Алгоритм: mulberry32.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Число в [0, 1). */
export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Целое в [min, max] включительно. */
export function int(r: RngState, min: number, max: number): number {
  return min + Math.floor(next(r) * (max - min + 1));
}

export function chance(r: RngState, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick from empty array");
  return items[int(r, 0, items.length - 1)] as T;
}

export function weighted<T>(r: RngState, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) throw new Error("weighted pick with zero total weight");
  let roll = next(r) * total;
  for (const i of items) {
    roll -= i.weight;
    if (roll < 0) return i.item;
  }
  return (items[items.length - 1] as { item: T }).item;
}

/** Перемешивает массив на месте и возвращает его. */
export function shuffle<T>(r: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

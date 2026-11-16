import { describe, expect, it } from "vitest";
import { createRng, int, next, shuffle, weighted } from "../core/rng";

describe("rng", () => {
  it("одинаковый seed даёт одинаковую последовательность", () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 50 }, () => next(a));
    const ys = Array.from({ length: 50 }, () => next(b));
    expect(xs).toEqual(ys);
  });

  it("разные seed дают разные последовательности", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(next(a)).not.toEqual(next(b));
  });

  it("int остаётся в границах включительно", () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = int(r, 1, 5);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });

  it("weighted никогда не выбирает вариант с нулевым весом", () => {
    const r = createRng(3);
    for (let i = 0; i < 1000; i++) {
      expect(weighted(r, [{ item: "a", weight: 1 }, { item: "b", weight: 0 }])).toBe("a");
    }
  });

  it("shuffle сохраняет элементы", () => {
    const r = createRng(9);
    expect(shuffle(r, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

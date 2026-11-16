import { describe, expect, it } from "vitest";
import { BASE_PALETTE, hexToRgb } from "../game/art/palette";
import { artCatalog, sizeOk } from "../game/art/catalog";
import { bbox, blank, countColors, hasSemiTransparent, keyOut, pixelize, type Image, type Rgb } from "../tools/pixelize-lib";
import { loadContent } from "../tools/load-content";
import { enemyMountSlots, weaponSprite } from "../game/art/weapons";

const MAGENTA: Rgb = [255, 0, 255];

function fill(img: Image, x: number, y: number, w: number, h: number, c: Rgb): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const o = (j * img.width + i) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
}

/** «Сгенерированная» картинка: крупный объект на хромакее с шумом и полутонами по краю. */
function fakeGenerated(): Image {
  const img = blank(400, 200);
  fill(img, 0, 0, 400, 200, MAGENTA);
  fill(img, 40, 60, 300, 100, [200, 150, 50]); // корпус
  fill(img, 40, 150, 300, 10, [20, 22, 27]); // низ
  fill(img, 80, 80, 40, 30, [240, 210, 140]); // окно
  // Шум, которого не бывает в пиксель-арте.
  for (let i = 0; i < img.data.length; i += 4 * 7) {
    if (img.data[i] !== 255) img.data[i] = Math.min(255, img.data[i]! + 9);
  }
  // Полупрозрачный ореол по краю.
  fill(img, 38, 60, 2, 100, [230, 80, 220]);
  return img;
}

describe("pixelize", () => {
  it("хромакей становится прозрачным, объект находится по рамке", () => {
    const keyed = keyOut(fakeGenerated(), MAGENTA, 90);
    expect(bbox(keyed)).toEqual({ x: 40, y: 60, w: 300, h: 100 });
  });

  it("даёт точный размер, без полупрозрачности, прижато к низу", () => {
    const out = pixelize(fakeGenerated(), {
      width: 60,
      height: 24,
      anchor: "bottom",
      palette: Object.values(BASE_PALETTE).map(hexToRgb),
      freeColors: 2,
      key: MAGENTA,
      keyTolerance: 90,
      coverage: 0.5,
    });
    expect(out.width).toBe(60);
    expect(out.height).toBe(24);
    expect(hasSemiTransparent(out)).toBe(false);
    // Нижняя строка непрозрачна, верхняя — прозрачна (объект 3:1 вписан в 60×24 по ширине).
    expect(out.data[(23 * 60 + 30) * 4 + 3]).toBe(255);
    expect(out.data[(0 * 60 + 30) * 4 + 3]).toBe(0);
    // Шум схлопнулся в палитру: не больше обязательных + своих цветов.
    expect(countColors(out)).toBeLessThanOrEqual(Object.keys(BASE_PALETTE).length + 2);
    // Корпус получил свой цвет, близкий к исходному.
    const o = (18 * 60 + 40) * 4;
    expect(Math.abs(out.data[o]! - 200)).toBeLessThan(20);
  });

  it("ширина-диапазон берётся по пропорциям объекта", () => {
    const out = pixelize(fakeGenerated(), {
      width: [44, 64],
      height: 24,
      anchor: "bottom",
      palette: [],
      freeColors: 0,
      key: MAGENTA,
      keyTolerance: 90,
      coverage: 0.5,
    });
    expect(out.width).toBe(64); // 300/100 × 24 = 72 → обрезано до 64
    expect(out.height).toBe(24);
  });

  it("пустая картинка даёт прозрачный холст нужного размера", () => {
    const img = blank(50, 50);
    fill(img, 0, 0, 50, 50, MAGENTA);
    const out = pixelize(img, { width: 16, height: 16, anchor: "center", palette: [], freeColors: 0, key: MAGENTA, keyTolerance: 90, coverage: 0.5 });
    expect(out.width).toBe(16);
    expect(countColors(out)).toBe(0);
  });
});

describe("каталог картинок", () => {
  const catalog = artCatalog(loadContent());

  it("пути уникальны и размеры заданы", () => {
    const paths = catalog.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const s of catalog) expect(s.h).toBeGreaterThan(0);
  });

  it("есть все враги, оружие, водители и события", () => {
    const content = loadContent();
    const paths = new Set(catalog.map((s) => s.path));
    for (const id of Object.keys(content.enemies)) expect(paths.has(`buses/${id}.png`)).toBe(true);
    for (const id of Object.keys(content.drivers)) expect(paths.has(`drivers/${id}.png`)).toBe(true);
    for (const ev of content.events) expect(paths.has(`events/${ev.id}.png`)).toBe(true);
    for (const item of Object.values(content.items)) {
      expect(paths.has(`items/${item.id}.png`)).toBe(true);
      if (item.kind === "weapon") expect(paths.has(`weapons/${item.id}.png`)).toBe(true);
    }
  });

  it("проверка размера с диапазоном", () => {
    expect(sizeOk({ w: [44, 64], h: 24 }, 50, 24)).toBe(true);
    expect(sizeOk({ w: [44, 64], h: 24 }, 70, 24)).toBe(false);
    expect(sizeOk({ w: 16, h: 10 }, 16, 11)).toBe(false);
  });
});

describe("оружие кодом", () => {
  const content = loadContent();

  it("у каждого оружия есть спрайт 16×10", () => {
    for (const item of Object.values(content.items)) {
      if (item.kind !== "weapon") continue;
      const s = weaponSprite(item.id);
      expect(s, item.id).not.toBeNull();
      expect(s!.rows.length, item.id).toBe(10);
      for (const r of s!.rows) expect(r.length, item.id).toBe(16);
    }
  });

  it("всё оружие врагов получает место на корпусе", () => {
    for (const e of Object.values(content.enemies)) {
      const slots = enemyMountSlots(e.weapons, content);
      expect(slots.every((s) => s !== null), e.id).toBe(true);
      expect(new Set(slots).size, e.id).toBe(slots.length);
    }
  });
});

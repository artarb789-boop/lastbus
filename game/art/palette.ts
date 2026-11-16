/**
 * Палитры без зависимостей от браузера: их используют и клиент, и инструменты (tools/pixelize).
 */

/** Общая палитра. Цвета корпуса подставляются отдельно для каждого автобуса. */
export const BASE_PALETTE: Record<string, string> = {
  k: "#14161b", // контур, самые тёмные тени
  g: "#2b2f37", // шина
  h: "#8a8f99", // колпак, металл светлый
  G: "#5c6370", // металл
  d: "#3a3f4a", // металл тёмный, решётки
  w: "#f6d68b", // окно с тёплым светом
  W: "#fff1c4", // блик на окне
  b: "#22344a", // тёмное стекло
  y: "#ffd34d", // фара
  r: "#d9423b", // задний фонарь, кровь
  s: "#c9c1b0", // заклёпки, череп
  o: "#ff8a2b", // огонь, выхлоп
  e: "#1b1d22", // тень под автобусом
};

/** Внешность пассажиров: наборы, из которых по индексу look собирается фигурка. */
export const SKIN = ["#f1c9a5", "#d9a37a", "#a8714a", "#6e4a33"];
export const HAIR = ["#2a1d14", "#5a3a22", "#a8743a", "#d9c27a", "#8a8f99", "#b0402c"];
export const SHIRT = ["#4f7cac", "#7a9a4a", "#b05a3a", "#8a5ab0", "#c9a03a", "#3a8a8a", "#a33a5a", "#6a6a6a"];
export const PANTS = "#3a3f4a";
export const BANDAGE = "#f2efe6";

/**
 * Ключевые серые в сгенерированной базе пассажира: игра перекрашивает их в цвета внешности.
 * Остальные цвета базы (контур, повязка, кровь) остаются как есть.
 */
export const PERSON_KEYS = { hair: "#404040", clothes: "#808080", skin: "#c0c0c0" } as const;

/** Цвета банд (корпус, полоса, крыша) — их можно добавить к палитре при пикселизации автобуса. */
export const BAND_COLORS: Record<string, string[]> = {
  bus_city: ["#d99a2b", "#8c5a14", "#e8b44f"],
  bus_shuttle: ["#e8b13a", "#a8601c", "#f2c862"],
  bus_armored: ["#a8923c", "#5e5222", "#c2ad5a"],
  enemy_raider_minibus: ["#a63a32", "#5e1f1b", "#c4544a"],
  enemy_raider_sawnoff: ["#8e4a2c", "#4a2414", "#a85d38"],
  enemy_rival_carrier: ["#3e6d9c", "#1f3b57", "#5b8cc0"],
  enemy_rammer: ["#8a5a3c", "#4c2f1d", "#a4704c"],
  enemy_siphoners: ["#5d7d3a", "#2f441b", "#77994d"],
  enemy_nemesis: ["#2a2a33", "#7a3fa0", "#3a3a46"],
  enemy_boss_prison_bus: ["#6c7a86", "#d9772b", "#8996a2"],
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Спрайт: строки символов-цветов и своя палитра поверх общей. */
export type Sprite = { rows: string[]; palette: Record<string, string> };

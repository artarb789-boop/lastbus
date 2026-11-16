/**
 * Процедурные автобусы, вид сбоку, нос справа. Внешность задаётся параметрами (BusLook),
 * поэтому новый враг получает облик одной записью в ENEMY_LOOKS, без ручного рисования.
 */
import type { Content, RunState } from "../../core";
import { BAND_COLORS } from "./palette";
import { Grid, hash, type Sprite } from "./pixel";

/** Цвета банды из общей таблицы (palette.ts): корпус, полоса, крыша. */
function band(id: string): { body: string; trim: string; roof: string } {
  const [body, trim, roof] = BAND_COLORS[id]!;
  return { body: body!, trim: trim!, roof: roof! };
}

export interface BusLook {
  /** Длина корпуса в пикселях. */
  length: number;
  body: string;
  trim: string;
  roof: string;
  /** Доля пятен ржавчины, 0..1. */
  rust?: number;
  litWindows?: boolean;
  grate?: boolean;
  armor?: boolean;
  ram?: boolean;
  spikes?: boolean;
  skull?: boolean;
  tankOnRoof?: boolean;
  roofGun?: "mg" | "rockets" | null;
  /** Зерно для пятен, чтобы у разных автобусов они не совпадали. */
  seed?: number;
}

const H = 24;
const TOP = 4;

export function busSprite(look: BusLook): Sprite {
  const L = look.length;
  const extra = look.ram ? 5 : look.spikes ? 3 : 0;
  const g = new Grid(L + extra, H);
  const seed = look.seed ?? 1;

  // Крыша и корпус.
  g.hline(3, L - 4, TOP, "O");
  g.hline(1, L - 2, TOP + 1, "O");
  g.rect(0, TOP + 2, L, 12, "M");
  g.set(0, TOP + 2, ".");
  g.set(L - 1, TOP + 2, "O");
  // Ржавчина.
  if (look.rust) {
    for (let y = TOP + 2; y < TOP + 14; y++) {
      for (let x = 0; x < L; x++) if (g.get(x, y) === "M" && hash(seed * 997 + x * 31 + y * 7) < look.rust) g.set(x, y, "T");
    }
  }
  // Полоса и юбка.
  g.hline(0, L - 1, TOP + 10, "T");
  g.hline(0, L - 1, TOP + 11, "T");
  g.hline(1, L - 2, TOP + 14, "k");

  // Окна салона.
  const winEnd = L - 14;
  for (let x = 5; x + 5 <= winEnd; x += 7) {
    const lit = look.litWindows || hash(seed * 13 + x) < 0.35;
    g.rect(x, TOP + 3, 5, 5, lit ? "w" : "b");
    g.set(x, TOP + 3, lit ? "W" : "G");
    if (look.grate) for (let i = 1; i < 5; i += 2) for (let j = 0; j < 5; j++) g.set(x + i, TOP + 3 + j, "d");
  }
  // Дверь и лобовое стекло.
  g.rect(L - 12, TOP + 3, 3, 10, "b");
  g.hline(L - 12, L - 10, TOP + 7, "d");
  g.rect(L - 5, TOP + 3, 4, 5, "b");
  g.set(L - 4, TOP + 3, "W");
  // Фары.
  g.set(L - 1, TOP + 9, "y");
  g.set(L - 2, TOP + 9, "y");
  g.set(0, TOP + 8, "r");
  g.set(0, TOP + 9, "r");

  // Броня: нижние листы с заклёпками.
  if (look.armor) {
    g.rect(1, TOP + 12, L - 2, 2, "G");
    for (let x = 2; x < L - 2; x += 4) g.set(x, TOP + 12, "s");
  }
  // Череп на борту.
  if (look.skull) {
    const cx = Math.floor(L / 2) - 2;
    g.rect(cx, TOP + 9, 5, 3, "s");
    g.set(cx + 1, TOP + 10, "k");
    g.set(cx + 3, TOP + 10, "k");
    g.hline(cx + 1, cx + 3, TOP + 12, "s");
  }
  // Бочка на крыше.
  if (look.tankOnRoof) {
    const x0 = Math.floor(L / 2) - 9;
    g.rect(x0, 1, 16, 3, "h");
    g.hline(x0, x0 + 15, 3, "G");
    g.set(x0, 1, ".");
    g.set(x0 + 15, 1, ".");
  }
  // Оружие на крыше.
  if (look.roofGun === "mg") {
    const x0 = Math.floor(L * 0.6);
    g.rect(x0, 2, 3, 2, "d");
    g.hline(x0 + 3, x0 + 8, 2, "k");
  } else if (look.roofGun === "rockets") {
    const x0 = Math.floor(L * 0.55);
    g.rect(x0, 0, 6, 4, "G");
    g.set(x0 + 6, 1, "r");
    g.set(x0 + 6, 2, "r");
  }
  // Таран и шипы.
  if (look.ram) {
    for (let y = TOP + 4; y <= TOP + 14; y++) {
      const w = Math.min(5, 1 + Math.floor((y - TOP - 4) / 2));
      g.hline(L, L + w - 1, y, y === TOP + 14 ? "d" : "G");
    }
  } else if (look.spikes) {
    for (let y = TOP + 11; y <= TOP + 14; y += 1) g.hline(L, L + (y % 2 === 0 ? 2 : 1), y, "h");
  }

  // Колёса.
  for (const cx of [7, L - 9]) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 10) g.set(cx + dx, TOP + 15 + dy, "g");
      }
    }
    g.set(cx, TOP + 15, "h");
    g.set(cx - 1, TOP + 15, "G");
    g.set(cx + 1, TOP + 15, "G");
    g.set(cx, TOP + 14, "G");
    g.set(cx, TOP + 16, "G");
  }
  // Тень.
  g.hline(2, L - 3, H - 1, "e");

  return { rows: g.rows(), palette: { M: look.body, T: look.trim, O: look.roof } };
}

export const PLAYER_LOOK: BusLook = {
  length: 60,
  ...band("bus_city"),
  litWindows: true,
  seed: 7,
};

export const ENEMY_LOOKS: Record<string, BusLook> = {
  enemy_raider_minibus: { length: 44, ...band("enemy_raider_minibus"), rust: 0.08, seed: 11 },
  enemy_raider_sawnoff: { length: 48, ...band("enemy_raider_sawnoff"), rust: 0.15, seed: 12 },
  enemy_rival_carrier: { length: 60, ...band("enemy_rival_carrier"), armor: true, seed: 13 },
  enemy_rammer: { length: 54, ...band("enemy_rammer"), armor: true, rust: 0.1, seed: 14 },
  enemy_siphoners: { length: 52, ...band("enemy_siphoners"), tankOnRoof: true, rust: 0.1, seed: 15 },
  enemy_nemesis: { length: 60, ...band("enemy_nemesis"), skull: true, armor: true, seed: 16 },
  enemy_boss_prison_bus: {
    length: 76,
    ...band("enemy_boss_prison_bus"),
    grate: true,
    armor: true,
    seed: 17,
  },
};

const FALLBACK_LOOK: BusLook = { length: 50, body: "#7a6a5a", trim: "#3a3028", roof: "#958270", rust: 0.1, seed: 99 };

export function enemyLook(enemyId: string): BusLook {
  return ENEMY_LOOKS[enemyId] ?? FALLBACK_LOOK;
}

/** Облик автобуса игрока по его снаряжению: оружие на крыше, броня, таран. */
export function playerLook(state: RunState, content: Content): BusLook {
  // Оружие (включая таран и шипы) ставится отдельными спрайтами, у корпуса — только броня.
  const anyArmor = Object.values(state.equipment).some(
    (inst) => inst && inst.durability > 0 && content.items[inst.itemId]?.kind === "armor",
  );
  return { ...PLAYER_LOOK, armor: anyArmor };
}

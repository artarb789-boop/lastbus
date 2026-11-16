/**
 * Оружие на корпусе, нарисованное кодом: 16×10, смотрит вправо, точка крепления — середина нижнего края.
 * Оружие для носа (таран, шипы) нарисовано в правой половине, чтобы торчать вперёд из носа.
 * Сгенерированная картинка weapons/<id>.png, если утверждена, заменяет спрайт (см. game/ui/scene.ts).
 */
import type { Content } from "../../core";
import type { Sprite } from "./palette";

/** Свои цвета оружия: дерево, верёвка, тёмная бочка. */
const PALETTE = { N: "#7a4a2a", R: "#c9a46a", B: "#2a2d33" };

const SPRITES: Record<string, string[]> = {
  // Пулемёт на сошках.
  wpn_mg: [
    "................",
    "................",
    "................",
    "................",
    ".....kkkk.......",
    "....kGGGGkkkkkkk",
    "....kGhhGGGGGGGk",
    "....kkGGkkkkkkkk",
    ".....kdk........",
    "....kd.dk.......",
  ],
  // Ракетница: короб из труб на стойке.
  wpn_rockets: [
    "................",
    "................",
    "................",
    "..kkkkkkkkkkkk..",
    "..kGGGGGGGGGGGrk",
    "..kGdGdGdGdGdGrk",
    "..kGGGGGGGGGGGrk",
    "..kkkkkkkkkkkkk.",
    ".......kdk......",
    "......kdddk.....",
  ],
  // Двустволка, высунутая из окна и примотанная верёвкой.
  wpn_shotgun: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..NNNkkkkkkkkkkk",
    ".NNNNGGGGGGGGGGk",
    "..NNkRhRkkkkkkkk",
    "....k...........",
  ],
  // Гарпун на станке и бухта троса.
  wpn_harpoon: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "............k...",
    "..kkkkkkkkkkhk..",
    ".kGGGGGGGGGGhhhk",
    "..kkdkkkkkkkhk..",
    ".RRRRk......k...",
  ],
  // Огнемёт: баллон, ствол и огонёк запальника.
  wpn_flamer: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "..kkk...........",
    ".krrrk..........",
    ".krrrkkkkkkkkk..",
    ".krrrkGGGGGGGGko",
    "..kkk.kkkkkkkk.y",
  ],
  // Две бочки с маслом на кронштейне и сливной кран.
  wpn_oil: [
    "................",
    "................",
    "................",
    "................",
    "..kkkkk.kkkkk...",
    "..kBBBk.kBBBk...",
    "..kGGGk.kGGGk...",
    "..kBBBk.kBBBk...",
    ".kkkkkkkkkkkkkk.",
    "..............kd",
  ],
  // Сварной клин-таран из рельсов.
  wpn_ram: [
    "........kk......",
    "........kGk.....",
    "........kGGk....",
    "........kGGGk...",
    "........kGsGGk..",
    "........kGGGGGk.",
    "........kGsGGGGk",
    "........kGGGGGk.",
    "........kddddk..",
    "........kkkkk...",
  ],
  // Шипы на бампере.
  wpn_spikes: [
    "................",
    "................",
    "................",
    "................",
    "........k.......",
    "........khk.....",
    "........kGhhhk..",
    "........kGk.....",
    "........kGhhhhk.",
    "........kGk.....",
  ],
};

export const WEAPON_SPRITE_IDS = Object.keys(SPRITES);

/** Спрайт оружия или null, если для этого предмета рисунка нет. */
export function weaponSprite(itemId: string): Sprite | null {
  const rows = SPRITES[itemId];
  return rows ? { rows, palette: PALETTE } : null;
}

/** Порядок бортов, по которым раскладывается оружие врага. */
const ORDER: Record<string, string[]> = {
  roof: ["roof", "roof2"],
  side: ["sideL1", "sideL2", "sideR1", "sideR2"],
  front: ["front", "front2"],
  rear: ["rear"],
};

/**
 * У врага оружие задано списком без слотов: раскладываем его по видам крепления
 * (крыша, борта, нос, корма) в порядке списка. Возвращает слот для каждого оружия или null.
 */
export function enemyMountSlots(itemIds: string[], content: Content): (string | null)[] {
  const used = new Map<string, number>();
  return itemIds.map((id) => {
    const kind = content.items[id]?.slotKinds[0];
    const slots = kind ? ORDER[kind] : undefined;
    if (!slots) return null;
    const n = used.get(kind!) ?? 0;
    used.set(kind!, n + 1);
    return slots[n] ?? null;
  });
}

/**
 * Точки крепления оружия на сгенерированном автобусе игрока, в игровых пикселях от левого верхнего угла.
 * Оружие ставится серединой нижнего края в эту точку. Правый борт — «дальний»: его оружие
 * рисуется раньше левого и приглушённым, в промежутках между креплениями левого борта.
 */
export function mountPoint(slot: string, w: number): { x: number; y: number; far: boolean; flip: boolean } | null {
  switch (slot) {
    case "roof":
      return { x: Math.round(w / 2), y: 4, far: false, flip: false };
    case "roof2": // второе оружие на крыше — только у врагов
      return { x: Math.round(w * 0.25), y: 4, far: false, flip: false };
    case "front2": // второе на нос (шипы под тараном) — только у врагов
      return { x: w - 2, y: 22, far: false, flip: false };
    case "front":
      return { x: w - 2, y: 18, far: false, flip: false };
    case "rear":
      return { x: 2, y: 18, far: false, flip: true };
    case "sideL1":
      return { x: Math.round(w * 0.75), y: 13, far: false, flip: false };
    case "sideL2":
      return { x: Math.round(w * 0.45), y: 13, far: false, flip: false };
    case "sideR1":
      return { x: Math.round(w * 0.6), y: 12, far: true, flip: false };
    case "sideR2":
      return { x: Math.round(w * 0.3), y: 12, far: true, flip: false };
    default:
      return null;
  }
}

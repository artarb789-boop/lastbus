/** Пассажиры: маленькие сидячие фигурки, собранные из деталей по индексу внешности. */
import { BANDAGE, HAIR, PANTS, SHIRT, SKIN } from "./palette";
import { hash, type Sprite } from "./pixel";

const BODY = [
  "..HHH..",
  ".HHHHH.",
  ".HSSSH.",
  "..SSS..",
  "..CCC..",
  ".CCCCC.",
  "SCCCCCS",
  ".CCCCC.",
  ".PP.PP.",
];

/** Цвета внешности пассажира: волосы H, кожа S, одежда C. */
export function lookColors(look: number): { H: string; S: string; C: string } {
  return {
    H: HAIR[look % HAIR.length]!,
    S: SKIN[Math.floor(look / HAIR.length) % SKIN.length]!,
    C: SHIRT[Math.floor(hash(look * 7 + 3) * SHIRT.length)]!,
  };
}

export function personSprite(look: number, wounded: boolean): Sprite {
  const rows = BODY.map((r) => r);
  if (wounded) {
    // Повязка на голове.
    rows[1] = ".BBrBB.";
  }
  return {
    rows,
    palette: {
      ...lookColors(look),
      P: PANTS,
      B: BANDAGE,
    },
  };
}

export function driverSprite(wounded: boolean): Sprite {
  const rows = [
    ".kkkkk.",
    "kkkkkkk",
    ".HSSSH.",
    "..SSS..",
    "..CCC..",
    ".CCCCC.",
    "SCCCCCS",
    ".CCCCC.",
    ".PP.PP.",
  ];
  if (wounded) rows[2] = ".BBrBB.";
  return { rows, palette: { H: "#2a1d14", S: "#d9a37a", C: "#c98f2c", P: "#3a3f4a", B: "#f2efe6" } };
}

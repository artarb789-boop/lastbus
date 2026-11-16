/**
 * ЗАГЛУШКИ M0.
 * Бой, события и босс здесь — грубые броски кубика, чтобы забег можно было пройти целиком.
 * На M1.5 их заменит пошаговый бой (core/combat), на M1 — движок событий (core/events).
 */
import { harmRandom, mannedWeaponPosts } from "./crew";
import { log } from "./log";
import { chance, int, pick } from "./rng";
import type { RunState } from "./state";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Встреча с соперником. Сила зависит от занятых постов у оружия и боеприпасов. */
export function resolveEncounterStub(state: RunState): void {
  const r = state.resources;
  const power = mannedWeaponPosts(state) + Math.min(r.ammo, 6) / 3;
  const pWin = clamp(0.35 + 0.1 * power, 0.1, 0.9);
  r.ammo = Math.max(0, r.ammo - int(state.rng, 1, 3));
  if (chance(state.rng, pWin)) {
    const tokens = int(state.rng, 2, 5);
    const parts = int(state.rng, 0, 2);
    r.tokens += tokens;
    r.parts += parts;
    log(state, `encounter won (p=${pWin.toFixed(2)}): +${tokens} tokens, +${parts} parts`);
  } else {
    log(state, `encounter lost (p=${pWin.toFixed(2)})`);
    harmRandom(state, state.rng, int(state.rng, 1, 2), "encounter");
    r.fuel = Math.max(0, r.fuel - int(state.rng, 2, 5));
  }
}

/** Дорожное происшествие. */
export function resolveIncidentStub(state: RunState): void {
  const r = state.resources;
  const roll = pick(state.rng, ["leak", "cache", "ambush"] as const);
  if (roll === "leak") {
    const lost = int(state.rng, 3, 6);
    r.fuel = Math.max(0, r.fuel - lost);
    log(state, `incident: fuel leak −${lost}`);
  } else if (roll === "cache") {
    const food = int(state.rng, 2, 4);
    r.food += food;
    log(state, `incident: roadside cache +${food} food`);
  } else {
    log(state, "incident: sniper ambush");
    harmRandom(state, state.rng, 1, "ambush");
  }
}

/** Особая остановка: небольшой случайный подарок. */
export function resolveSpecialStub(state: RunState): void {
  const r = state.resources;
  const roll = pick(state.rng, ["fuel", "medkits", "tokens"] as const);
  const amount = roll === "fuel" ? int(state.rng, 6, 12) : roll === "medkits" ? 1 : int(state.rng, 2, 4);
  r[roll] += amount;
  log(state, `special stop: +${amount} ${roll}`);
}

/** Босс региона. Возвращает true при победе. */
export function resolveBossStub(state: RunState): boolean {
  const r = state.resources;
  const pWin = clamp(0.2 + 0.09 * mannedWeaponPosts(state) + 0.02 * Math.min(r.ammo, 10) + 0.03 * Math.min(r.parts, 5), 0.05, 0.95);
  r.ammo = Math.max(0, r.ammo - int(state.rng, 3, 6));
  const won = chance(state.rng, pWin);
  log(state, `boss ${won ? "defeated" : "won"} (p=${pWin.toFixed(2)})`);
  if (!won) harmRandom(state, state.rng, 2, "boss");
  return won;
}

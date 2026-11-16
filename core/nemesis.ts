/**
 * Заклятый соперник (GDD 9.2). Именной автобус, который перехватывает вас на заданных столбцах карты.
 * До решающей встречи он отступает, потеряв часть корпуса, и возвращается сильнее.
 * Уйти от него — значит отдать ему жетоны и тоже усилить.
 */
import type { Content, EnemyDef } from "./content";
import { log } from "./log";
import { int, pick, type RngState } from "./rng";
import type { CombatResult, NemesisState, RunState } from "./state";

export function createNemesis(rng: RngState, content: Content): NemesisState {
  return { nameKey: pick(rng, content.balance.nemesis.names), meetings: 0, level: 0, defeated: false };
}

/** Пора ли встретить соперника на пути к узлу этого столбца. */
export function nemesisDue(state: RunState, content: Content, targetColumn: number): boolean {
  const n = state.nemesis;
  const cols = content.balance.nemesis.meetColumns;
  return !n.defeated && n.meetings < cols.length && targetColumn >= cols[n.meetings]!;
}

export function isFinalMeeting(state: RunState, content: Content): boolean {
  return state.nemesis.meetings === content.balance.nemesis.meetColumns.length - 1;
}

/** Описание соперника на текущую встречу: шаблон + уровень + накопленное оружие. */
export function nemesisDef(state: RunState, content: Content): EnemyDef {
  const cfg = content.balance.nemesis;
  const def = structuredClone(content.enemies[cfg.template]!);
  def.hull += cfg.hullPerLevel * state.nemesis.level;
  for (const extra of cfg.bonusWeapons.slice(0, state.nemesis.meetings + 1)) def.weapons.push(...extra);
  if (isFinalMeeting(state, content)) delete def.surrenderAtHull;
  else def.surrenderAtHull = cfg.surrenderAtHull;
  delete def.fleeAtHull;
  return def;
}

/**
 * Итог встречи. Возвращает дополнительные трофеи (оружие на выбор).
 * Вызывается для любого исхода, кроме поражения игрока.
 */
export function afterNemesisFight(state: RunState, content: Content, result: CombatResult): string[] {
  const cfg = content.balance.nemesis;
  const n = state.nemesis;
  n.meetings += 1;
  if (result === "won") {
    n.defeated = true;
    log(state, `nemesis ${n.nameKey} destroyed`);
    return [cfg.finalTrophy];
  }
  n.level += 1;
  if (result === "escaped" || result === "enemy_fled") {
    const stolen = Math.min(state.resources.tokens, int(state.rng, cfg.stealTokens[0], cfg.stealTokens[1]));
    state.resources.tokens -= stolen;
    log(state, `nemesis ${n.nameKey} took ${stolen} tokens and grows stronger`);
  } else {
    log(state, `nemesis ${n.nameKey} retreats, will be back stronger`);
  }
  return [];
}

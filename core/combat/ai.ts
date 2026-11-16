/**
 * ИИ врага (GDD 8.2). Профиль решает, куда стреляет оружие и на какую дистанцию тянется автобус.
 * Цель врага видна игроку заранее — это его «намерение».
 */
import type { AiProfile, Content, RangeBand } from "../content";
import { pick } from "../rng";
import type { EnemyState, Maneuver, RunState, TargetRef } from "../state";

export const BAND_CENTER: Record<RangeBand, number> = { contact: 0, near: 1, mid: 2, far: 3 };

/** Живые цели на автобусе игрока. */
export function playerTargetAlive(state: RunState, target: TargetRef): boolean {
  if (target === "hull") return true;
  if (target === "tank") return state.tank.durability > 0;
  if (target === "engine" || target === "wheels" || target === "cabin") return state.systems[target].hp > 0;
  const slotId = target.slice("weapon:".length);
  const inst = state.equipment[slotId];
  return inst !== null && inst !== undefined && inst.durability > 0;
}

function playerWeaponTargets(state: RunState, content: Content): TargetRef[] {
  return Object.entries(state.equipment)
    .filter(([, inst]) => inst && inst.durability > 0 && content.items[inst.itemId]?.kind === "weapon")
    .map(([slotId]) => `weapon:${slotId}` as TargetRef);
}

/** Цель по профилю: первая живая из списка предпочтений. */
function preferredTarget(state: RunState, content: Content, ai: AiProfile): TargetRef {
  const alive = (t: TargetRef) => playerTargetAlive(state, t);
  switch (ai) {
    case "gunner": {
      const weapons = playerWeaponTargets(state, content);
      if (weapons.length > 0) return pick(state.rng, weapons);
      return alive("engine") ? "engine" : "hull";
    }
    case "rammer":
      return alive("wheels") ? "wheels" : alive("engine") ? "engine" : "hull";
    case "tank_hunter":
      return alive("tank") ? "tank" : "hull";
    case "sniper":
      return alive("cabin") ? "cabin" : "hull";
    case "berserk":
      return "hull";
  }
}

/** Обновить цели оружия врага, если нынешняя цель уничтожена или профиль сменился. */
export function retargetEnemy(state: RunState, content: Content, enemy: EnemyState, force = false): void {
  const current = enemy.weapons[0]?.target ?? "hull";
  // Все стволы врага бьют в одну цель — так намерение читается одной строкой.
  if (!force && playerTargetAlive(state, current) && current !== "hull") return;
  if (!force && current === "hull" && enemy.ai === "berserk") return;
  const next = preferredTarget(state, content, enemy.ai);
  if (next === current && !force) return;
  for (const w of enemy.weapons) w.target = next;
}

export function enemyIsFleeing(_content: Content, enemy: EnemyState): boolean {
  const def = enemy.def;
  return def.fleeAtHull !== undefined && enemy.hull.hp <= def.fleeAtHull * enemy.hull.max;
}

/** Манёвр врага: тянется к предпочитаемой дистанции, при бегстве — уходит. */
export function enemyManeuver(content: Content, enemy: EnemyState, distance: number): Maneuver {
  if (enemyIsFleeing(content, enemy)) return "retreat";
  const want = BAND_CENTER[enemy.preferredRange];
  if (distance > want + 0.3) return "approach";
  if (distance < want - 0.3) return "retreat";
  return "hold";
}

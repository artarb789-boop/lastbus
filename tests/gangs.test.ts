import { describe, expect, it } from "vitest";
import { applyCommand, type RunState } from "../core";
import { combatTick, startCombat } from "../core/combat/engine";
import { contentWith, drive, quietContent, runOn } from "./helpers";

const c = quietContent;

function gangArena(ids: string[]): RunState {
  const s = runOn(1, ["start", "village", "village", "boss"], c);
  const posts = s.bus.seats.filter((x) => x.role === "weapon" && s.equipment[x.slot!]);
  s.passengers.forEach((p, i) => {
    if (posts[i]) p.seat = posts[i]!.id;
  });
  s.hull = { hp: 999, max: 999 };
  s.phase = { type: "combat", combat: startCombat(s, c, ids, "encounter"), then: { type: "route" } };
  return s;
}

function combatOf(s: RunState) {
  if (s.phase.type !== "combat") throw new Error(`expected combat, got ${s.phase.type}`);
  return s.phase.combat;
}

describe("банды", () => {
  it("в бою несколько врагов, у каждого своё оружие и цель", () => {
    const s = gangArena(["enemy_raider_minibus", "enemy_rammer"]);
    const cb = combatOf(s);
    expect(cb.enemies.map((e) => e.enemyId)).toEqual(["enemy_raider_minibus", "enemy_rammer"]);
    expect(cb.enemies[1]!.weapons.every((w) => w.target === "wheels")).toBe(true);
    expect(cb.weapons.every((w) => w.enemy === 0)).toBe(true);
  });

  it("ствол можно навести на второго врага, а на выбывшего — нельзя", () => {
    const s = gangArena(["enemy_raider_minibus", "enemy_raider_sawnoff"]);
    const slot = combatOf(s).weapons[0]!.slotId;
    expect(applyCommand(s, { type: "setTarget", slotId: slot, target: "weapon:1", enemy: 1 }, c)).toEqual({ ok: true });
    expect(combatOf(s).weapons[0]!.enemy).toBe(1);
    expect(applyCommand(s, { type: "setTarget", slotId: slot, target: "weapon:5", enemy: 1 }, c).ok).toBe(false);
    combatOf(s).enemies[1]!.out = "fled";
    expect(applyCommand(s, { type: "setTarget", slotId: slot, target: "hull", enemy: 1 }, c).ok).toBe(false);
  });

  it("бой идёт, пока в строю хоть один; разбитый выбывает, ствол переходит на следующего", () => {
    const s = gangArena(["enemy_raider_minibus", "enemy_raider_sawnoff"]);
    const cb = combatOf(s);
    for (const e of cb.enemies) for (const w of e.weapons) w.disabled = true;
    cb.enemies[0]!.hull.hp = 0;
    expect(combatTick(s, c, cb)).toBeNull();
    expect(cb.enemies[0]!.out).toBe("destroyed");
    expect(cb.enemies[1]!.out).toBeNull();
    // Подождём, пока стволы перейдут на второго.
    for (let k = 0; k < 40; k++) combatTick(s, c, cb);
    expect(cb.weapons.every((w) => w.enemy === 1)).toBe(true);
  });

  it("трофеи — со всех разбитых, исход — победа, если разбит хоть один", () => {
    const s = gangArena(["enemy_raider_minibus", "enemy_raider_sawnoff"]);
    const cb = combatOf(s);
    for (const e of cb.enemies) for (const w of e.weapons) w.disabled = true;
    cb.enemies[0]!.hull.hp = 0;
    cb.enemies[1]!.hull.hp = 0;
    expect(applyCommand(s, { type: "advance", ticks: 1 }, c).ok).toBe(true);
    expect(s.phase.type).toBe("loot");
    if (s.phase.type !== "loot") return;
    expect(s.phase.result).toBe("won");
    // Оружие с обоих автобусов (минибус — пулемёт, обрезы — дробовик).
    expect(s.phase.loot.items).toEqual(expect.arrayContaining(["wpn_mg", "wpn_shotgun"]));
  });

  it("на дальних встречах иногда выходит банда", () => {
    const gangy = contentWith((x) => {
      Object.assign(x.balance, structuredClone(quietContent.balance));
      x.balance.gangs.chance = 1;
      x.balance.gangs.minColumn = 0;
    });
    const s = runOn(2, ["start", "encounter", "village", "boss"], gangy);
    drive(s, gangy);
    expect(s.phase.type).toBe("combat");
    if (s.phase.type !== "combat") return;
    expect(s.phase.combat.enemies.length).toBe(2);
    // Банда легче поодиночке.
    const e = s.phase.combat.enemies[0]!;
    expect(e.hull.max).toBe(Math.round(gangy.enemies[e.enemyId]!.hull * gangy.balance.gangs.hullMult));
  });
});

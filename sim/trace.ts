/**
 * Разбор боёв одного забега: кто против кого, сколько длился бой, что потратили.
 *   npx tsx sim/trace.ts [seed] [bot]
 */
import { applyCommand, newRun } from "../core";
import { loadContent } from "../tools/load-content";
import { BOTS } from "./bots";

const seed = Number(process.argv[2] ?? 1);
const botName = process.argv[3] ?? "careful";
const content = loadContent();
const state = newRun(seed, content);
const bot = BOTS[botName]!(seed);

let inFight = false;
let before = { ammo: 0, hull: 0, tick: 0 };
for (let step = 0; step < 3000 && state.phase.type !== "over"; step++) {
  if (state.phase.type === "combat" && !inFight) {
    inFight = true;
    before = { ammo: state.resources.ammo, hull: state.hull.hp, tick: 0 };
    const c = state.phase.combat;
    console.log(
      `FIGHT ${c.source} vs ${c.enemy.enemyId} | hull ${state.hull.hp}/${state.hull.max} ammo ${state.resources.ammo} ` +
        `weapons ${c.weapons.map((w) => `${w.slotId}:${state.equipment[w.slotId]?.itemId}`).join(",")} ` +
        `crew ${state.passengers.map((p) => `${p.seat}/${p.status[0]}`).join(" ")}`,
    );
  }
  const cmd = bot.decide(state, content);
  const res = applyCommand(state, cmd, content);
  if (!res.ok) console.log("  rejected", cmd, res.error);
  if (state.phase.type === "combat") {
    const c = state.phase.combat;
    if (c.tick % 40 === 0 && c.tick !== before.tick) {
      before.tick = c.tick;
      console.log(
        `  t${c.tick} dist ${c.distance.toFixed(2)} man ${c.maneuver}/${c.enemy.maneuver} | me hull ${state.hull.hp} ammo ${state.resources.ammo} ` +
          `charges ${c.weapons.map((w) => w.charge).join("/")} | enemy hull ${c.enemy.hull.hp}/${c.enemy.hull.max} ` +
          `weapons ${c.enemy.weapons.map((w) => `${w.itemId}:${w.hp}`).join(",")} target ${c.enemy.weapons[0]?.target}`,
      );
    }
  }
  if (inFight && state.phase.type !== "combat") {
    inFight = false;
    const last = state.log.filter((l) => l.text.startsWith("combat ended")).at(-1);
    console.log(`  ${last?.text} | hull ${before.hull}→${state.hull.hp} ammo ${before.ammo}→${state.resources.ammo}`);
  }
}
console.log("END", state.phase);

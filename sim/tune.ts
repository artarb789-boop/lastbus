/**
 * Быстрый перебор вариантов баланса без правки файлов.
 *   npx tsx sim/tune.ts [runs]
 * Каждый вариант — патч поверх контента из data/. Печатает сводку по ботам careful и greedy.
 */
import type { Content } from "../core";
import { loadContent } from "../tools/load-content";
import { BOTS } from "./bots";
import { runGame } from "./runner";

type Patch = (c: Content) => void;

// Примеры вариантов. Агент баланса меняет этот список под свой вопрос.
const variants: Record<string, Patch> = {
  current: () => {},
  "enemy accuracy 1.0": (c) => {
    c.balance.combat.enemyAccuracyMult = 1;
  },
  "hull 16": (c) => {
    c.buses.bus_city!.hull = 16;
  },
  "escape 30 ticks": (c) => {
    c.balance.combat.escapeTicks = 30;
  },
};

const runs = Number(process.argv[2] ?? 1000);
const base = loadContent();
const pct = (x: number) => `${((x / runs) * 100).toFixed(1)}%`;

for (const [name, patch] of Object.entries(variants)) {
  const content = structuredClone(base);
  patch(content);
  console.log(`\n### ${name}`);
  for (const bot of ["careful", "greedy"]) {
    let wins = 0, fuel = 0, destroyed = 0, fights = 0, won = 0, ticks = 0, boss = 0;
    for (let s = 1; s <= runs; s++) {
      const { state } = runGame(s, BOTS[bot]!, content);
      if (state.phase.type === "over") {
        if (state.phase.result === "won") wins++;
        if (state.phase.reason === "out_of_fuel") fuel++;
        if (state.phase.reason === "destroyed") destroyed++;
      }
      if (state.nodeId === state.map.bossId) boss++;
      fights += state.stats.fights;
      won += state.stats.fightsWon;
      ticks += state.stats.fightTicks;
    }
    console.log(
      `  ${bot.padEnd(8)} win ${pct(wins)}  reached boss ${pct(boss)}  destroyed ${pct(destroyed)}  out_of_fuel ${pct(fuel)}  ` +
        `fights/run ${(fights / runs).toFixed(2)}  won ${((won / Math.max(1, fights)) * 100).toFixed(0)}%  ticks/fight ${(ticks / Math.max(1, fights)).toFixed(0)}`,
    );
  }
}

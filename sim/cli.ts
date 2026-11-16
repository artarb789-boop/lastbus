/**
 * Прогон ботов по многим seed и сводка по балансу.
 *   npm run sim -- --runs 2000 --bots careful,greedy,random --seed 1
 */
import { BOTS } from "./bots";
import { runGame } from "./runner";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

const runs = Number(arg("runs", "2000"));
const firstSeed = Number(arg("seed", "1"));
const botNames = arg("bots", Object.keys(BOTS).join(",")).split(",");

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`Runs per bot: ${runs}, seeds ${firstSeed}..${firstSeed + runs - 1}\n`);

for (const name of botNames) {
  const factory = BOTS[name];
  if (!factory) {
    console.error(`unknown bot: ${name}`);
    process.exit(1);
  }
  const outcomes: Record<string, number> = {};
  const legs: number[] = [];
  const delivered: number[] = [];
  const fares: number[] = [];
  const died: number[] = [];
  const boarded: number[] = [];
  let wins = 0;

  for (let k = 0; k < runs; k++) {
    const { state } = runGame(firstSeed + k, factory);
    if (state.phase.type !== "over") continue;
    const key = `${state.phase.result}:${state.phase.reason}`;
    outcomes[key] = (outcomes[key] ?? 0) + 1;
    if (state.phase.result === "won") wins++;
    legs.push(state.legs);
    delivered.push(state.stats.delivered);
    fares.push(state.stats.tokensFromFares);
    died.push(state.stats.died);
    boarded.push(state.stats.boarded);
  }

  console.log(`== ${name} ==`);
  console.log(`  win rate:          ${pct(wins / runs)}`);
  console.log(`  outcomes:          ${Object.entries(outcomes).map(([k, v]) => `${k} ${pct(v / runs)}`).join(", ")}`);
  console.log(`  avg legs:          ${avg(legs).toFixed(1)}`);
  console.log(`  avg boarded:       ${avg(boarded).toFixed(1)}`);
  console.log(`  avg delivered:     ${avg(delivered).toFixed(1)}`);
  console.log(`  avg fare tokens:   ${avg(fares).toFixed(1)}`);
  console.log(`  avg deaths:        ${avg(died).toFixed(2)}`);
  console.log("");
}

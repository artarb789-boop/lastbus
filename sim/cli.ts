/**
 * Прогон ботов по многим seed и сводка по балансу.
 *   npm run sim -- --runs 2000 --bots careful,greedy,random --seed 1
 */
import { loadContent } from "../tools/load-content";
import { BOTS } from "./bots";
import { runGame } from "./runner";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

const runs = Number(arg("runs", "2000"));
const firstSeed = Number(arg("seed", "1"));
const botNames = arg("bots", Object.keys(BOTS).join(",")).split(",");
const content = loadContent();

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
  const series: Record<string, number[]> = {
    legs: [],
    boarded: [],
    delivered: [],
    fareTokens: [],
    deaths: [],
    itemsGained: [],
    installedAtEnd: [],
    eventsSeen: [],
    racesContested: [],
    tankPunctures: [],
    fuelLeaked: [],
    fuelAtEnd: [],
    fights: [],
    fightsWon: [],
    escapes: [],
    ticksPerFight: [],
    hullAtEnd: [],
  };
  let wins = 0;

  for (let k = 0; k < runs; k++) {
    const { state } = runGame(firstSeed + k, factory, content);
    if (state.phase.type !== "over") continue;
    const key = `${state.phase.result}:${state.phase.reason}`;
    outcomes[key] = (outcomes[key] ?? 0) + 1;
    if (state.phase.result === "won") wins++;
    series.legs!.push(state.legs);
    series.boarded!.push(state.stats.boarded);
    series.delivered!.push(state.stats.delivered);
    series.fareTokens!.push(state.stats.tokensFromFares);
    series.deaths!.push(state.stats.died);
    series.itemsGained!.push(state.stats.itemsGained);
    series.installedAtEnd!.push(Object.values(state.equipment).filter(Boolean).length);
    series.eventsSeen!.push(state.stats.eventsSeen);
    series.racesContested!.push(state.stats.racesContested);
    series.tankPunctures!.push(state.stats.tankPunctures);
    series.fuelLeaked!.push(state.stats.fuelLeaked);
    series.fuelAtEnd!.push(state.resources.fuel);
    series.fights!.push(state.stats.fights);
    series.fightsWon!.push(state.stats.fightsWon);
    series.escapes!.push(state.stats.escapes);
    if (state.stats.fights > 0) series.ticksPerFight!.push(state.stats.fightTicks / state.stats.fights);
    series.hullAtEnd!.push(state.hull.hp);
  }

  console.log(`== ${name} ==`);
  console.log(`  win rate:          ${pct(wins / runs)}`);
  console.log(
    `  outcomes:          ${Object.entries(outcomes)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v / runs)}`)
      .join(", ")}`,
  );
  for (const [label, xs] of Object.entries(series)) {
    console.log(`  avg ${label.padEnd(15)} ${avg(xs).toFixed(2)}`);
  }
  console.log("");
}

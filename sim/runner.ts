import { applyCommand, newRun, type Command, type Content, type RunOptions, type RunState } from "../core";
import type { BotFactory } from "./bots";

export interface GameRecord {
  seed: number;
  state: RunState;
  commands: Command[];
  rejected: number;
}

const MAX_STEPS = 2000;
const MAX_REJECTS_IN_ROW = 20;

/** Прогон одного забега ботом. Отклонённые команды не попадают в список для воспроизведения. */
export function runGame(seed: number, botFactory: BotFactory, content: Content, opts: RunOptions = {}): GameRecord {
  const state = newRun(seed, content, opts);
  const bot = botFactory(seed);
  const commands: Command[] = [];
  let rejected = 0;
  let rejectsInRow = 0;

  for (let step = 0; step < MAX_STEPS && state.phase.type !== "over"; step++) {
    const cmd = bot.decide(state, content);
    const res = applyCommand(state, cmd, content);
    if (res.ok) {
      commands.push(cmd);
      rejectsInRow = 0;
    } else {
      rejected++;
      rejectsInRow++;
      if (rejectsInRow >= MAX_REJECTS_IN_ROW) {
        throw new Error(`bot ${bot.name} stuck on seed ${seed}: ${res.error} (${JSON.stringify(cmd)})`);
      }
    }
  }
  if (state.phase.type !== "over") throw new Error(`run did not finish in ${MAX_STEPS} steps, seed ${seed}`);
  return { seed, state, commands, rejected };
}

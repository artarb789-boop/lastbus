import type { RunState } from "./state";

/** Отладочный журнал забега. Клиент будет показывать свои локализованные сообщения. */
export function log(state: RunState, text: string): void {
  state.log.push({ leg: state.legs, text });
}

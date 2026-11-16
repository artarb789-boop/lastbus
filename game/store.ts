/**
 * Состояние клиента: забег из ядра, список команд и состояние интерфейса.
 * Сохранение — это seed и команды: при загрузке забег воспроизводится заново.
 */
import { applyCommand, newRun, replay, type Command, type Content, type RunState } from "../core";

const SAVE_KEY = "lastbus.save.v1";

export interface UiState {
  /** Выбранный пассажир для пересадки, высадки или обыска. */
  selectedPassenger: string | null;
  /** Кого отправить на обыск. */
  scavengeTeam: string[];
  /** Выбранный предмет из багажа для установки. */
  selectedItem: string | null;
  /** Спорная остановка, для которой выбирается темп. */
  pendingEdge: string | null;
  paused: boolean;
  speed: 1 | 2 | 4;
  lootItem: number | null;
  lootSurvivors: boolean;
  /** Цель, которую раздаём стволам в бою кликом по врагу. */
  aimSlot: string | null;
}

export interface Store {
  content: Content;
  state: RunState;
  commands: Command[];
  ui: UiState;
  error: string | null;
}

function freshUi(): UiState {
  return {
    selectedPassenger: null,
    scavengeTeam: [],
    selectedItem: null,
    pendingEdge: null,
    paused: true,
    speed: 1,
    lootItem: null,
    lootSurvivors: true,
    aimSlot: null,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

export function createStore(content: Content): Store {
  const saved = loadSave();
  if (saved) {
    try {
      const state = replay(saved.seed, saved.commands, content);
      return { content, state, commands: saved.commands, ui: freshUi(), error: null };
    } catch (e) {
      console.warn("save could not be replayed, starting a new run", e);
    }
  }
  const seed = seedFromUrl() ?? randomSeed();
  return { content, state: newRun(seed, content), commands: [], ui: freshUi(), error: null };
}

export function startNewRun(store: Store, seed: number = randomSeed()): void {
  store.state = newRun(seed, store.content);
  store.commands = [];
  store.ui = freshUi();
  store.error = null;
  persist(store);
}

/** Отправить команду в ядро. Подряд идущие advance склеиваются, чтобы сохранение было коротким. */
export function dispatch(store: Store, cmd: Command): boolean {
  const res = applyCommand(store.state, cmd, store.content);
  if (!res.ok) {
    store.error = res.error;
    return false;
  }
  store.error = null;
  const last = store.commands[store.commands.length - 1];
  if (cmd.type === "advance" && last?.type === "advance" && last.ticks + cmd.ticks <= 200) {
    last.ticks += cmd.ticks;
  } else {
    store.commands.push(cmd.type === "advance" ? { ...cmd } : cmd);
  }
  persist(store);
  return true;
}

function persist(store: Store): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: store.state.seed, commands: store.commands }));
  } catch {
    // Хранилище недоступно (приватный режим) — играем без сохранения.
  }
}

function loadSave(): { seed: number; commands: Command[] } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { seed: number; commands: Command[] };
    return typeof data.seed === "number" && Array.isArray(data.commands) ? data : null;
  } catch {
    return null;
  }
}

function seedFromUrl(): number | null {
  const v = new URLSearchParams(location.search).get("seed");
  return v && /^\d+$/.test(v) ? Number(v) : null;
}

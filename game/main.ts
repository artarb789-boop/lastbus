/**
 * Клиент «Последнего автобуса». Отрисовка — простой HTML/SVG по состоянию,
 * все изменения забега идут через команды ядра (store.dispatch).
 */
import type { Command, TargetRef } from "../core";
import { loadBrowserContent } from "./content";
import { createStore, dispatch, startNewRun, type Store } from "./store";
import { renderBus, renderGear } from "./ui/bus";
import { renderCombat } from "./ui/combat";
import { renderHud } from "./ui/hud";
import { renderMap } from "./ui/map";
import { renderPanel } from "./ui/panels";
import { ERRORS, esc } from "./ui/text";

const app = document.getElementById("app")!;
const store: Store = createStore(loadBrowserContent());

function render(): void {
  const { state } = store;
  const inCombat = state.phase.type === "combat";
  const main = inCombat ? renderCombat(store) : renderMap(store);
  const error = store.error ? `<div class="error">${esc(ERRORS[store.error] ?? store.error)}</div>` : "";
  app.innerHTML = `
    ${renderHud(store)}
    <main class="layout ${inCombat ? "in-combat" : ""}">
      <div class="main-view">${main}${error}${inCombat ? "" : renderPanel(store)}</div>
      <aside class="side">${renderBus(store)}${renderGear(store)}</aside>
    </main>`;
}

function send(cmd: Command): void {
  dispatch(store, cmd);
  // После смены фазы сбрасываем временные выборы, чтобы не тянуть их в новый экран.
  const phase = store.state.phase.type;
  if (phase !== "stop") store.ui.scavengeTeam = [];
  if (phase !== "route") store.ui.pendingEdge = null;
  if (phase !== "loot") {
    store.ui.lootItem = null;
    store.ui.lootSurvivors = true;
  }
  if (cmd.type === "install") store.ui.selectedItem = null;
  if (cmd.type === "seatPassenger" || cmd.type === "dropPassenger") store.ui.selectedPassenger = null;
  // Пока игрок выбирает цель в открытом списке, не перерисовываем — иначе список закроется.
  if (cmd.type === "advance" && document.activeElement?.tagName === "SELECT") return;
  render();
}

function onUi(action: string, value: string): void {
  const ui = store.ui;
  const state = store.state;
  switch (action) {
    case "newRun":
      if (state.phase.type === "over" || confirm("Начать новый забег? Текущий будет потерян.")) startNewRun(store);
      break;
    case "pickEdge": {
      const edge = state.map.edges.find((e) => e.id === value);
      if (!edge) break;
      if (state.contested.includes(edge.to)) ui.pendingEdge = edge.id;
      else return send({ type: "chooseRoute", edgeId: edge.id });
      break;
    }
    case "cancelEdge":
      ui.pendingEdge = null;
      break;
    case "seat": {
      const occupant = state.passengers.find((p) => p.seat === value);
      if (ui.selectedPassenger && ui.selectedPassenger !== occupant?.id) {
        return send({ type: "seatPassenger", passengerId: ui.selectedPassenger, seatId: value });
      }
      ui.selectedPassenger = occupant && ui.selectedPassenger !== occupant.id ? occupant.id : null;
      break;
    }
    case "toggleScavenger":
      ui.scavengeTeam = ui.scavengeTeam.includes(value)
        ? ui.scavengeTeam.filter((id) => id !== value)
        : [...ui.scavengeTeam, value].slice(-3);
      break;
    case "selectItem":
      ui.selectedItem = ui.selectedItem === value ? null : value;
      break;
    case "lootItem":
      ui.lootItem = ui.lootItem === Number(value) ? null : Number(value);
      break;
    case "lootSurvivors":
      ui.lootSurvivors = !ui.lootSurvivors;
      break;
    case "autoMan": {
      // Свободных здоровых пассажиров — на пустые посты при целом оружии, сначала с обычных мест.
      for (const post of state.bus.seats) {
        if (post.role !== "weapon" || !post.slot) continue;
        const inst = state.equipment[post.slot];
        if (!inst || inst.durability <= 0 || state.passengers.some((p) => p.seat === post.id)) continue;
        const idle = state.passengers.find(
          (p) => p.status === "healthy" && state.bus.seats.find((s) => s.id === p.seat)?.role === "plain",
        );
        if (idle) dispatch(store, { type: "seatPassenger", passengerId: idle.id, seatId: post.id });
      }
      break;
    }
    case "togglePause":
      ui.paused = !ui.paused;
      break;
    case "speed":
      ui.speed = Number(value) as 1 | 2 | 4;
      break;
  }
  render();
}

app.addEventListener("click", (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-cmd],[data-ui]");
  if (!el || (el as HTMLButtonElement).disabled) return;
  if (el.dataset.cmd) {
    send(JSON.parse(el.dataset.cmd) as Command);
  } else if (el.dataset.ui) {
    if (el instanceof HTMLInputElement) ev.preventDefault();
    onUi(el.dataset.ui, el.dataset.value ?? "");
  }
});

app.addEventListener("change", (ev) => {
  const el = ev.target as HTMLSelectElement;
  if (el.dataset.targetSlot) send({ type: "setTarget", slotId: el.dataset.targetSlot, target: el.value as TargetRef });
});

document.addEventListener("keydown", (ev) => {
  if (ev.code === "Space" && store.state.phase.type === "combat") {
    ev.preventDefault();
    onUi("togglePause", "");
  }
});

// Ход времени в бою: один тик за tickSeconds / speed секунд, пока не на паузе.
// Таймер, а не requestAnimationFrame: время меряется по часам, поэтому темп не зависит от частоты кадров.
let lastPhase = store.state.phase.type;
let acc = 0;
let lastTime = performance.now();
function clock(): void {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  const phase = store.state.phase.type;
  if (phase === "combat" && lastPhase !== "combat") store.ui.paused = true; // бой начинается на паузе
  lastPhase = phase;
  if (phase === "combat" && !store.ui.paused) {
    acc += dt * store.ui.speed;
    const tick = store.content.balance.combat.tickSeconds;
    const ticks = Math.min(20, Math.floor(acc / tick));
    if (ticks > 0) {
      acc -= ticks * tick;
      send({ type: "advance", ticks });
    }
  } else {
    acc = 0;
  }
}

render();
setInterval(clock, 50);

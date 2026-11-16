import { capacity, driverDef, isLeaking, RESOURCE_KINDS, tankMax } from "../../core";
import type { Store } from "../store";
import { bar, esc, RES, SYSTEM, t, uiAttr } from "./text";

export function renderHud(store: Store): string {
  const { state, content } = store;
  const r = state.resources;
  const res = RESOURCE_KINDS.map((k) => {
    const value = k === "fuel" ? `${r.fuel}/${tankMax(state, content)}` : String(r[k]);
    return `<span class="res" title="${RES[k].label}">${RES[k].icon} ${value}</span>`;
  }).join("");

  const sys = (name: string, hp: number, max: number, extra = "") =>
    `<span class="sys ${hp <= 0 ? "broken" : ""}" title="${esc(SYSTEM[name] ?? name)}">${esc(SYSTEM[name] ?? name)} ${bar(hp, max)} ${hp}/${max}${extra}</span>`;

  return `
    <header class="hud">
      <div class="title">🚌 Последний автобус</div>
      <div class="resources">${res}</div>
      <div class="systems">
        ${sys("hull", state.hull.hp, state.hull.max)}
        ${sys("engine", state.systems.engine.hp, state.systems.engine.max)}
        ${sys("wheels", state.systems.wheels.hp, state.systems.wheels.max)}
        ${sys("cabin", state.systems.cabin.hp, state.systems.cabin.max)}
        ${sys("tank", state.tank.durability, state.tank.max, isLeaking(state) ? ' <b class="warn">течёт!</b>' : "")}
      </div>
      <div class="meta">
        <span>Водитель: ${esc(t(content, driverDef(state, content)?.nameKey ?? state.driver.id))}, ${state.driver.status === "healthy" ? "здоров" : '<b class="warn">ранен</b>'}</span>
        <span title="Заклятый соперник">⚔ ${esc(t(content, state.nemesis.nameKey))}: ${
          state.nemesis.defeated
            ? "повержен"
            : `встреч ${state.nemesis.meetings}/${content.balance.nemesis.meetColumns.length}, ур. ${state.nemesis.level}`
        }</span>
        <span>Пассажиры: ${state.passengers.length}/${capacity(state)}</span>
        <span>Перегонов: ${state.legs}</span>
        <span class="muted">seed ${state.seed}</span>
        <button ${uiAttr("newRun")}>Новый забег</button>
      </div>
    </header>`;
}

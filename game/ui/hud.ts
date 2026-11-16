import { capacity, driverDef, foodForecast, isLeaking, RESOURCE_KINDS, tankMax } from "../../core";
import { artImg } from "../art/images";
import { isMuted } from "../audio/sound";
import type { Store } from "../store";
import { bar, esc, RES, SYSTEM, t, uiAttr } from "./text";

export function renderHud(store: Store): string {
  const { state, content } = store;
  const r = state.resources;
  const food = foodForecast(state, content);
  const res = RESOURCE_KINDS.map((k) => {
    let value = k === "fuel" ? `${r.fuel}/${tankMax(state, content)}` : String(r[k]);
    let title = RES[k].label;
    let cls = "";
    if (k === "food") {
      // Еда: сколько нужно на следующий приём и когда он.
      value += `<span class="muted">/${food.need}</span>`;
      title = `Еда. Следующий приём через ${food.legs} перег.: нужно ${food.need}, есть ${r.food}.` +
        (food.short > 0 ? ` Не хватит ${food.short} — они будут голодать, а голодные с прошлого раза получат ранение.` : "");
      if (food.short > 0) cls = food.legs === 1 ? "bad" : "warn";
    }
    return `<span class="res ${cls}" title="${esc(title)}">${artImg(`resources/${k}.png`, 2, "res-icon", RES[k].label) || RES[k].icon} ${value}</span>`;
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
        ${food.hungry > 0 ? `<span class="warn" title="Пропустили еду. Ещё один пропуск подряд — ранение.">🍽 голодают: ${food.hungry}</span>` : ""}
        ${food.short > 0 ? `<span class="${food.legs === 1 ? "bad-text" : "warn"}">еды не хватит через ${food.legs} перег. (−${food.short})</span>` : ""}
        <span>Перегонов: ${state.legs}</span>
        <span class="muted">seed ${state.seed}</span>
        <button title="Звук" ${uiAttr("toggleSound")}>${isMuted() ? "🔇 Звук выкл." : "🔊 Звук"}</button>
        <button ${uiAttr("newRun")}>Новый забег</button>
      </div>
    </header>`;
}

/** Панели фаз: маршрут, остановка, магазин, событие, трофеи, конец забега. */
import {
  availableChoices,
  eventDef,
  findEdge,
  findNode,
  fuelCost,
  healthyPassengers,
  RESOURCE_KINDS,
  systemRepairCost,
  type RepairableSystem,
} from "../../core";
import type { Store } from "../store";
import { cmdAttr, esc, itemName, NODE, RES, SHOP, SYSTEM, t, uiAttr } from "./text";

export function renderPanel(store: Store): string {
  switch (store.state.phase.type) {
    case "route":
      return routePanel(store);
    case "stop":
      return stopPanel(store);
    case "shop":
      return shopPanel(store);
    case "event":
      return eventPanel(store);
    case "loot":
      return lootPanel(store);
    case "over":
      return overPanel(store);
    case "combat":
      return "";
  }
}

// ---------- Маршрут ----------

function routePanel(store: Store): string {
  const { state, content, ui } = store;
  const pending = ui.pendingEdge ? findEdge(state.map, ui.pendingEdge) : undefined;
  if (pending) {
    const node = findNode(state.map, pending.to);
    const normal = fuelCost(state, content, pending, "normal");
    const rush = fuelCost(state, content, pending, "rush");
    return `
      <section class="panel">
        <h2>Соперник едет туда же</h2>
        <p>К остановке «${esc(NODE[node.kind].label)}» направляется автобус конкурентов. Как поедем?</p>
        <div class="choices">
          <button ${cmdAttr({ type: "chooseRoute", edgeId: pending.id, pace: "normal" })}>Как обычно (⛽${normal}) — он успеет первым, останется 1 действие</button>
          <button ${cmdAttr({ type: "chooseRoute", edgeId: pending.id, pace: "rush" })}>Рывок (⛽${rush}) — приедем первыми</button>
          <button ${cmdAttr({ type: "chooseRoute", edgeId: pending.id, pace: "intercept" })}>Перехватить (⛽${normal}) — бой на дороге</button>
          <button ${uiAttr("cancelEdge")}>Назад</button>
        </div>
      </section>`;
  }
  return `
    <section class="panel">
      <h2>Куда едем?</h2>
      <p>Нажмите на подсвеченный узел на карте. Рядом с дорогой — её тип и расход топлива, 🛒 — магазин по пути, ⚑ — туда едет соперник.</p>
      <p class="muted">Посадку можно менять и сейчас: выберите пассажира в салоне, затем место.</p>
    </section>`;
}

// ---------- Остановка ----------

function stopPanel(store: Store): string {
  const { state, content, ui } = store;
  if (state.phase.type !== "stop") return "";
  const node = findNode(state.map, state.nodeId);
  const garage = node.kind === "garage";
  const left = state.phase.actionsLeft;

  const team = ui.scavengeTeam.filter((id) => state.passengers.some((p) => p.id === id && p.status === "healthy"));
  const healthy = healthyPassengers(state);
  const teamPick = healthy
    .map((p) => {
      const on = team.includes(p.id);
      return `<button class="chip ${on ? "on" : ""}" ${uiAttr("toggleScavenger", p.id)}>${esc(p.id)}</button>`;
    })
    .join("");

  const repairs = (["hull", "engine", "wheels", "cabin", "tank"] as RepairableSystem[])
    .map((sys) => {
      const cost = systemRepairCost(state, content, sys, garage);
      if (cost === 0) return "";
      return `<button ${cmdAttr({ type: "repairSystem", system: sys })}>Чинить: ${esc(SYSTEM[sys]!)} (🔩${cost})</button>`;
    })
    .join("");

  const wounded = state.passengers.filter((p) => p.status === "wounded").length + (state.driver.status === "wounded" ? 1 : 0);
  const selected = state.passengers.find((p) => p.id === ui.selectedPassenger);

  return `
    <section class="panel">
      <h2>${NODE[node.kind].icon} ${esc(NODE[node.kind].label)}</h2>
      <p>Действий осталось: <b>${left}</b>${garage ? " · в автосервисе ремонт и установка вдвое дешевле" : ""}</p>
      <div class="block">
        <h4>Обыск</h4>
        <div class="chips">${teamPick || '<span class="muted">некого отправить</span>'}</div>
        <button ${left > 0 && team.length > 0 ? "" : "disabled"} ${cmdAttr({ type: "scavenge", passengerIds: team.slice(0, 3) })}>Обыскать (${team.length} чел.)</button>
        <span class="muted">до 3 человек, есть риск ранения</span>
      </div>
      <div class="block">
        <h4>Лечение и ремонт</h4>
        <button ${left > 0 && wounded > 0 && state.resources.medkits > 0 ? "" : "disabled"} ${cmdAttr({ type: "heal" })}>Лечить раненых (✚1 на человека, раненых: ${wounded})</button>
        ${repairs || '<span class="muted">корпус и системы целы</span>'}
      </div>
      <div class="block">
        <h4>Пассажир</h4>
        ${
          selected
            ? `<button ${cmdAttr({ type: "dropPassenger", passengerId: selected.id })}>Высадить ${esc(selected.id)} без оплаты</button>`
            : '<span class="muted">выберите пассажира в салоне, чтобы высадить его</span>'
        }
      </div>
      <button class="primary" ${cmdAttr({ type: "leaveStop" })}>Ехать дальше</button>
    </section>`;
}

// ---------- Магазин ----------

function shopPanel(store: Store): string {
  const { state, content } = store;
  if (state.phase.type !== "shop") return "";
  const visit = state.phase.visit;
  const offers = visit.offers
    .map((o, i) => {
      const what =
        o.type === "resource"
          ? `${RES[o.resource].icon} ${o.amount} ${RES[o.resource].label.toLowerCase()}`
          : `🔫 ${esc(itemName(content, o.itemId))} <span class="muted">${esc(t(content, content.items[o.itemId]!.descKey))}</span>`;
      const can = !o.sold && state.resources.tokens >= o.price;
      return `<li class="${o.sold ? "sold" : ""}">${what} <button ${can ? "" : "disabled"} ${cmdAttr({ type: "buy", offerIndex: i })}>${o.sold ? "продано" : `Купить (🪙${o.price})`}</button></li>`;
    })
    .join("");
  return `
    <section class="panel">
      <h2>🛒 ${esc(SHOP[visit.kind])}</h2>
      <p class="muted">Магазин у дороги — не остановка: пассажиры не выходят, действия не тратятся. Купленное можно сразу поставить в снаряжении справа.</p>
      <ul class="offers">${offers}</ul>
      <button class="primary" ${cmdAttr({ type: "leaveShop" })}>Ехать дальше</button>
    </section>`;
}

// ---------- Событие ----------

function eventPanel(store: Store): string {
  const { state, content } = store;
  if (state.phase.type !== "event") return "";
  const ev = eventDef(content, state.phase.eventId);
  const available = new Set(availableChoices(state, content, ev));
  const choices = ev.choices
    .map((ch, i) => {
      const ok = available.has(i);
      const chance = ch.check ? ` <span class="muted">(шанс ${Math.round(ch.check.chance * 100)}%)</span>` : "";
      return `<button ${ok ? "" : "disabled"} ${cmdAttr({ type: "resolveChoice", choiceIndex: i })}>${esc(t(content, ch.textKey))}${chance}</button>`;
    })
    .join("");
  return `
    <section class="panel event">
      <h2>Событие</h2>
      <p class="event-text">${esc(t(content, ev.textKey))}</p>
      <div class="choices">${choices}</div>
    </section>`;
}

// ---------- Трофеи ----------

function lootPanel(store: Store): string {
  const { state, content, ui } = store;
  if (state.phase.type !== "loot") return "";
  const { loot, result } = state.phase;
  const res = RESOURCE_KINDS.filter((k) => loot.resources[k])
    .map((k) => `${RES[k].icon} +${loot.resources[k]}`)
    .join(" · ");
  const items = loot.items
    .map(
      (id, i) =>
        `<button class="chip ${ui.lootItem === i ? "on" : ""}" ${uiAttr("lootItem", i)}>${esc(itemName(content, id))}</button>`,
    )
    .join("");
  return `
    <section class="panel">
      <h2>${result === "won" ? "Победа!" : "Враг сдался"}</h2>
      <p>Добыча: ${res || "ничего"}</p>
      ${loot.items.length ? `<h4>Снять одно оружие (в багаж)</h4><div class="chips">${items}</div>` : ""}
      ${
        loot.survivors > 0
          ? `<label class="check"><input type="checkbox" ${ui.lootSurvivors ? "checked" : ""} ${uiAttr("lootSurvivors")}> Взять пленных в автобус (${loot.survivors})</label>`
          : ""
      }
      <button class="primary" ${cmdAttr({ type: "finishLoot", itemIndex: ui.lootItem, takeSurvivors: ui.lootSurvivors })}>Забрать и ехать</button>
    </section>`;
}

// ---------- Конец забега ----------

const REASON: Record<string, string> = {
  boss_defeated: "Босс повержен — вы прорвались к Конечной!",
  out_of_fuel: "Кончилось топливо. Автобус встал посреди дороги.",
  driver_died: "Водитель погиб.",
  destroyed: "Автобус уничтожен в бою.",
};

function overPanel(store: Store): string {
  const { state } = store;
  if (state.phase.type !== "over") return "";
  const s = state.stats;
  return `
    <section class="panel over ${state.phase.result}">
      <h2>${state.phase.result === "won" ? "Конечная" : "Конец пути"}</h2>
      <p>${esc(REASON[state.phase.reason] ?? state.phase.reason)}</p>
      <ul>
        <li>Перегонов: ${state.legs}, остановок: ${s.stopsVisited}</li>
        <li>Доставлено пассажиров: ${s.delivered}, заработано за проезд: 🪙${s.tokensFromFares}</li>
        <li>Боёв: ${s.fights}, побед: ${s.fightsWon}, отрывов: ${s.escapes}</li>
        <li>Погибло: ${s.died}</li>
      </ul>
      <button class="primary" ${uiAttr("newRun")}>Новый забег</button>
    </section>`;
}

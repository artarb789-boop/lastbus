/** Панели фаз: маршрут, остановка, магазин, событие, трофеи, конец забега. */
import {
  availableChoices,
  eventDef,
  findEdge,
  findNode,
  foodForecast,
  fuelCost,
  healthyPassengers,
  RESOURCE_KINDS,
  systemRepairCost,
  type RepairableSystem,
} from "../../core";
import type { Store } from "../store";
import { playerBusLook, busSprite } from "../art/buses";
import { artImg } from "../art/images";
import { spriteUrl } from "../art/pixel";
import { cmdAttr, esc, fitsLabel, itemName, NODE, RES, SHOP, SYSTEM, sellPrice, t, uiAttr } from "./text";

/** Иконка ресурса: картинка ×2, если утверждена, иначе эмодзи. */
function resIcon(k: keyof typeof RES): string {
  return artImg(`resources/${k}.png`, 2, "res-icon", RES[k].label) || RES[k].icon;
}

function itemIcon(id: string): string {
  return artImg(`items/${id}.png`, 2, "item-icon");
}

/** Выбор водителя перед новым забегом. */
/** Короткие характеристики автобуса для карточки выбора. */
function busStats(store: Store, busId: string): string {
  const { content } = store;
  const bus = content.buses[busId]!;
  const seats = bus.seats.filter((s) => s.role !== "driver").length;
  const guns = bus.slots.filter((s) => s.kind !== "internal").length;
  const inner = bus.slots.length - guns;
  const pct = (x: number) => `${x > 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)}%`;
  const rows: string[] = [
    `Мест: <b>${seats}</b>`,
    `Корпус: <b>${bus.hull}</b>`,
    `Двигатель / колёса / кабина: <b>${bus.systems.engine} / ${bus.systems.wheels} / ${bus.systems.cabin}</b>`,
    `Слотов: <b>${guns}</b> наружных, <b>${inner}</b> внутри`,
    `Бак: <b>${content.balance.tankBase + (bus.tankBonus ?? 0)}</b>, прочность ${bus.tankDurability}`,
  ];
  if (bus.fuelMult && bus.fuelMult !== 1) rows.push(`Расход топлива: <b>${pct(bus.fuelMult - 1)}</b>`);
  if (bus.evasionBonus) rows.push(`Уклонение: <b>${pct(bus.evasionBonus)}</b>`);
  const start = Object.values(bus.startEquipment).map((id) => esc(itemName(content, id)));
  if (start.length) rows.push(`С собой: ${start.join(", ")}`);
  return `<ul class="stats">${rows.map((r) => `<li>${r}</li>`).join("")}</ul>`;
}

/** Картинка автобуса: сгенерированная, если утверждена, иначе нарисованная кодом. */
function busPicture(busId: string): string {
  const generated = artImg(`buses/${busId}.png`, 2, "bus-pic");
  if (generated) return generated;
  const s = busSprite(playerBusLook(busId));
  const w = Math.max(...s.rows.map((r) => r.length));
  return `<img class="px bus-pic" src="${spriteUrl(s)}" width="${w * 2}" height="${s.rows.length * 2}" alt="">`;
}

/** Экран нового забега: выбор автобуса и водителя. */
export function renderDriverPick(store: Store): string {
  const { content, ui } = store;
  const buses = Object.values(content.buses)
    .sort((a, b) => a.hull - b.hull)
    .map(
      (b) => `
        <button class="pick-card ${ui.newBus === b.id ? "on" : ""}" ${uiAttr("pickBus", b.id)}>
          <div class="pic">${busPicture(b.id)}</div>
          <h3>${esc(t(content, b.nameKey))}</h3>
          <p>${esc(t(content, b.descKey))}</p>
          ${busStats(store, b.id)}
        </button>`,
    )
    .join("");
  const drivers = Object.values(content.drivers)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (d) => `
        <button class="pick-card ${ui.newDriver === d.id ? "on" : ""}" ${uiAttr("pickDriver", d.id)}>
          ${artImg(`drivers/${d.id}.png`, 3, "portrait", "")}
          <h3>${esc(t(content, d.nameKey))}</h3>
          <p>${esc(t(content, d.descKey))}</p>
        </button>`,
    )
    .join("");
  const back = store.commands.length > 0 ? `<button ${uiAttr("cancelDriver")}>Вернуться к текущему забегу</button>` : "";
  const busName = t(content, content.buses[ui.newBus]?.nameKey ?? ui.newBus);
  const driverName = t(content, content.drivers[ui.newDriver]?.nameKey ?? ui.newDriver);
  return `
    <section class="panel new-run">
      <h2>Новый забег</h2>
      <h3 class="step">1. Автобус</h3>
      <p class="muted">От автобуса зависят места для пассажиров, слоты под оружие, прочность и расход топлива.</p>
      <div class="pick-grid">${buses}</div>
      <h3 class="step">2. Водитель</h3>
      <p class="muted">Водитель — единственный в автобусе со своей особенностью. Остальных вы подберёте по дороге.</p>
      <div class="pick-grid">${drivers}</div>
      <div class="start-row">
        <button class="primary big" ${uiAttr("startRun")}>В путь: ${esc(busName)}, ${esc(driverName)}</button>
        ${back}
      </div>
    </section>`;
}

/** Предупреждение о еде перед выбором дороги. */
function foodWarning(store: Store): string {
  const { state, content } = store;
  const f = foodForecast(state, content);
  if (f.short === 0) return "";
  const when = f.legs === 1 ? "на этом перегоне" : `через ${f.legs} перегона`;
  return `<p class="warn">🥫 Еды не хватит ${when}: нужно ${f.need}, есть ${state.resources.food}. ${f.short} чел. будут голодать, а кто голодал и в прошлый раз — получит ранение. Еду можно купить в магазине 🛒 на перегоне или найти обыском.</p>`;
}

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
          <button ${cmdAttr({ type: "chooseRoute", edgeId: pending.id, pace: "normal" })}>Как обычно (⛽${normal}) — он успеет первым и всё обыщет, обыска не будет</button>
          <button ${cmdAttr({ type: "chooseRoute", edgeId: pending.id, pace: "rush" })}>Рывок (⛽${rush}) — приедем первыми</button>
          <button ${cmdAttr({ type: "chooseRoute", edgeId: pending.id, pace: "intercept" })}>Перехватить (⛽${normal}) — бой на дороге</button>
          <button ${uiAttr("cancelEdge")}>Назад</button>
        </div>
      </section>`;
  }
  return `
    <section class="panel">
      <h2>Куда едем?</h2>
      ${foodWarning(store)}
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

  const team = ui.scavengeTeam.filter((id) => state.passengers.some((p) => p.id === id));
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
      <h2>${artImg(`map/${node.kind}.png`, 2, "node-icon") || NODE[node.kind].icon} ${esc(NODE[node.kind].label)}</h2>
      <p class="muted">Лечение, ремонт, установка и продажа — без ограничений, платите только запчастями и аптечками.${garage ? " В автосервисе ремонт и установка вдвое дешевле." : ""}</p>
      <div class="block">
        <h4>Обыск <span class="muted">· ${left > 0 ? `можно ещё ${left}` : "уже обыскали"}</span></h4>
        <div class="chips">${teamPick || '<span class="muted">некого отправить</span>'}</div>
        <button ${left > 0 && team.length > 0 ? "" : "disabled"} ${cmdAttr({ type: "scavenge", passengerIds: team.slice(0, 3) })}>Обыскать (${team.length} чел.)</button>
        <span class="muted">до 3 человек, есть риск ранения</span>
      </div>
      <div class="block">
        <h4>Лечение и ремонт</h4>
        <button ${wounded > 0 && state.resources.medkits > 0 ? "" : "disabled"} ${cmdAttr({ type: "heal" })}>Лечить раненых (✚1 на человека, раненых: ${wounded})</button>
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
          ? `${resIcon(o.resource)} ${o.amount} ${RES[o.resource].label.toLowerCase()}`
          : `${itemIcon(o.itemId) || "🔫"} ${esc(itemName(content, o.itemId))} <span class="muted">${esc(t(content, content.items[o.itemId]!.descKey))} · ставится: ${esc(fitsLabel(content, o.itemId))}</span>`;
      const can = !o.sold && state.resources.tokens >= o.price;
      return `<li class="${o.sold ? "sold" : ""}">${what} <button ${can ? "" : "disabled"} ${cmdAttr({ type: "buy", offerIndex: i })}>${o.sold ? "продано" : `Купить (🪙${o.price})`}</button></li>`;
    })
    .join("");
  return `
    <section class="panel">
      ${artImg(`shops/${visit.kind}.png`, 3, "shop-sign")}
      <h2>🛒 ${esc(SHOP[visit.kind])}</h2>
      <p class="muted">Магазин у дороги — не остановка: пассажиры не выходят. Купленное можно сразу поставить в снаряжении справа.</p>
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
      ${artImg(`events/${ev.id}.png`, 3, "event-art")}
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
    .map((k) => `${resIcon(k)} +${loot.resources[k]}`)
    .join(" · ");
  const items = loot.items
    .map((id, i) => {
      const fitsBus = state.bus.slots.some((sl) => content.items[id]!.slotKinds.includes(sl.kind));
      return `<button class="chip ${ui.lootItem === i ? "on" : ""}" ${uiAttr("lootItem", i)}>${itemIcon(id)}${esc(itemName(content, id))}
        <span class="muted small">${fitsBus ? esc(fitsLabel(content, id)) : "не ставится"} · 🪙${sellPrice(content, id)}</span></button>`;
    })
    .join("");
  const picked = ui.lootItem !== null ? loot.items[ui.lootItem] : undefined;
  const finish = (sellItem: boolean, label: string, primary: boolean) =>
    `<button class="${primary ? "primary" : ""}" ${cmdAttr({ type: "finishLoot", itemIndex: ui.lootItem, takeSurvivors: ui.lootSurvivors, sellItem })}>${label}</button>`;
  return `
    <section class="panel">
      <h2>${result === "won" ? "Победа!" : "Враг сдался"}</h2>
      <p>Добыча: ${res || "ничего"}</p>
      ${loot.items.length ? `<h4>Снять одно оружие</h4><p class="muted small">Возьмите в багаж, чтобы поставить на автобус (в любой момент вне боя), или сразу продайте.</p><div class="chips">${items}</div>` : ""}
      ${
        loot.survivors > 0
          ? `<label class="check"><input type="checkbox" ${ui.lootSurvivors ? "checked" : ""} ${uiAttr("lootSurvivors")}> Взять пленных в автобус (${loot.survivors})</label>`
          : ""
      }
      <div class="row">
        ${
          picked
            ? finish(false, `Взять «${esc(itemName(content, picked))}» в багаж и ехать`, true) +
              finish(true, `Продать за 🪙${sellPrice(content, picked)} и ехать`, false)
            : finish(false, loot.items.length ? "Ехать без оружия" : "Забрать и ехать", true)
        }
      </div>
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

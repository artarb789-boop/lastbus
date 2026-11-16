/** Салон (вид сверху) и снаряжение автобуса. */
import { coveredSeats, findNode, fits, installCost, itemDef, occupant, repairCost } from "../../core";
import type { Store } from "../store";
import { bar, cmdAttr, esc, itemName, SLOT, uiAttr } from "./text";

const ROLE_LABEL: Record<string, string> = {
  driver: "Водитель",
  navigator: "Штурман",
  mechanic: "Механик",
  medic: "Медпункт",
  plain: "",
  weapon: "",
};

export function renderBus(store: Store): string {
  const { state, content, ui } = store;
  const covered = coveredSeats(state, content);
  const cells: string[] = [];
  for (let r = 0; r < state.bus.rows; r++) {
    for (let c = 0; c < state.bus.cols; c++) {
      const seat = state.bus.seats.find((s) => s.row === r && s.col === c);
      if (!seat) {
        cells.push('<div class="aisle"></div>');
        continue;
      }
      const exposed = state.bus.exposedCols.includes(seat.col);
      let role = ROLE_LABEL[seat.role] ?? "";
      if (seat.role === "weapon" && seat.slot) {
        const inst = state.equipment[seat.slot];
        role = inst ? `🔫 ${itemName(content, inst.itemId)}` : `пост: пусто`;
      }
      let who = "";
      if (seat.role === "driver") {
        who = `<span class="person driver ${state.driver.status}">🧑‍✈️</span>`;
      } else {
        const p = occupant(state, seat.id);
        if (p) {
          const sel = ui.selectedPassenger === p.id ? "selected" : "";
          who = `<span class="person ${p.status} ${sel}" title="Билет: ещё ${p.ticket.stopsLeft} из ${p.ticket.stopsTotal} остановок">${p.ticket.stopsLeft}</span>`;
        }
      }
      const cls = ["seat", `role-${seat.role}`, exposed ? "exposed" : "", covered.has(seat.id) ? "covered" : ""].join(" ");
      cells.push(`<button class="${cls}" ${uiAttr("seat", seat.id)}><span class="role">${esc(role)}</span>${who}</button>`);
    }
  }

  return `
    <section class="bus">
      <h3>Салон <span class="muted">— выберите пассажира, затем место</span></h3>
      <div class="legend muted">цифра — сколько остановок осталось ехать · пунктир — место у борта · 🛡 — закрыто бронёй · красный — ранен</div>
      <div class="seats" style="grid-template-columns: repeat(${state.bus.cols}, 1fr)">${cells.join("")}</div>
    </section>`;
}

export function renderGear(store: Store): string {
  const { state, content, ui } = store;
  const phase = state.phase.type;
  const atStop = phase === "stop";
  const inShop = phase === "shop";
  const garage = atStop && findNode(state.map, state.nodeId).kind === "garage";
  const canUninstall = phase === "route" || atStop || inShop;

  const slots = state.bus.slots
    .map((slot) => {
      const inst = state.equipment[slot.id];
      let body = '<span class="muted">пусто</span>';
      let actions = "";
      if (inst) {
        const def = itemDef(content, inst);
        body = `${esc(itemName(content, inst.itemId))} ${bar(inst.durability, def.durability, inst.durability <= 0 ? "bad" : "")} ${inst.durability}/${def.durability}`;
        if (canUninstall) actions += `<button ${cmdAttr({ type: "uninstall", slotId: slot.id })}>Снять</button>`;
        if (atStop && inst.durability < def.durability) {
          actions += `<button ${cmdAttr({ type: "repair", uid: inst.uid })}>Чинить (🔩${repairCost(content, inst, garage)})</button>`;
        }
        if (inShop) {
          actions += `<button ${cmdAttr({ type: "sell", uid: inst.uid })}>Продать (🪙${Math.floor(def.price * content.balance.sellMult)})</button>`;
        }
      }
      // Установка выбранного предмета из багажа.
      const selected = state.inventory.find((i) => i.uid === ui.selectedItem);
      if (selected && (atStop || inShop) && fits(itemDef(content, selected), slot)) {
        const cost = installCost(content, itemDef(content, selected), garage);
        actions += `<button class="primary" ${cmdAttr({ type: "install", uid: selected.uid, slotId: slot.id })}>Поставить сюда (🔩${cost}${atStop ? ", 1 действие" : ""})</button>`;
      }
      return `<tr><td>${esc(SLOT[slot.id] ?? slot.id)}</td><td>${body}</td><td class="actions">${actions}</td></tr>`;
    })
    .join("");

  const inventory =
    state.inventory.length === 0
      ? '<p class="muted">Багаж пуст.</p>'
      : `<ul class="inventory">${state.inventory
          .map((inst) => {
            const def = itemDef(content, inst);
            const sel = ui.selectedItem === inst.uid;
            let actions = "";
            if (atStop || inShop) actions += `<button ${uiAttr("selectItem", inst.uid)}>${sel ? "Отменить" : "Установить…"}</button>`;
            if (inShop) actions += `<button ${cmdAttr({ type: "sell", uid: inst.uid })}>Продать (🪙${Math.floor(def.price * content.balance.sellMult)})</button>`;
            return `<li class="${sel ? "selected" : ""}">${esc(itemName(content, inst.itemId))} <span class="muted">${inst.durability}/${def.durability}</span> ${actions}</li>`;
          })
          .join("")}</ul>`;

  return `
    <section class="gear">
      <h3>Снаряжение</h3>
      <table class="slots">${slots}</table>
      <h4>Багаж</h4>
      ${inventory}
    </section>`;
}

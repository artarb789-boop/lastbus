/** Салон (вид сверху) и снаряжение автобуса. */
import { coveredSeats, findNode, fits, installCost, itemDef, occupant, repairCost } from "../../core";
import { artImg, personUrl } from "../art/images";
import { driverSprite, personSprite } from "../art/people";
import { spriteUrl } from "../art/pixel";
import type { Store } from "../store";
import { bar, cmdAttr, esc, fitsLabel, itemName, sellPrice, SLOT, SLOT_KIND, uiAttr } from "./text";

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
        const img = spriteUrl(driverSprite(state.driver.status === "wounded"));
        who = `<span class="person driver ${state.driver.status}"><img class="px" src="${img}" alt="водитель"></span>`;
      } else {
        const p = occupant(state, seat.id);
        if (p) {
          const sel = ui.selectedPassenger === p.id ? "selected" : "";
          const wounded = p.status === "wounded";
          const img = personUrl(p.look, wounded) ?? spriteUrl(personSprite(p.look, wounded));
          who = `<span class="person ${p.status} ${sel}" title="Билет: ещё ${p.ticket.stopsLeft} из ${p.ticket.stopsTotal} остановок"><img class="px" src="${img}" alt=""><b class="ticket">${p.ticket.stopsLeft}</b></span>`;
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

/** Порядок слотов на панели: как они расположены на автобусе. */
const SLOT_ORDER = ["front", "roof", "rear", "sideL1", "sideL2", "sideR1", "sideR2", "int1", "int2"];

/**
 * Снаряжение: слоты автобуса карточками и багаж.
 * Выберите предмет в багаже — подходящие слоты подсветятся, нажмите «Поставить» на нужном.
 * Ставить и снимать можно в любой момент вне боя; чинить — на остановке; продавать — на остановке и в магазине.
 */
export function renderGear(store: Store): string {
  const { state, content, ui } = store;
  const phase = state.phase.type;
  const atStop = phase === "stop";
  const inShop = phase === "shop";
  const garage = atStop && findNode(state.map, state.nodeId).kind === "garage";
  const canRefit = phase === "route" || atStop || inShop || phase === "loot";
  const canSell = atStop || inShop;
  const selected = canRefit ? state.inventory.find((i) => i.uid === ui.selectedItem) : undefined;
  const selectedDef = selected ? itemDef(content, selected) : undefined;

  const slots = [...state.bus.slots]
    .sort((a, b) => SLOT_ORDER.indexOf(a.id) - SLOT_ORDER.indexOf(b.id))
    .map((slot) => {
      const inst = state.equipment[slot.id];
      const fitsHere = selectedDef ? fits(selectedDef, slot) : false;
      let body = `<span class="muted">пусто</span>`;
      const actions: string[] = [];
      if (inst) {
        const def = itemDef(content, inst);
        const broken = inst.durability <= 0;
        body = `${artImg(`items/${inst.itemId}.png`, 1, "item-icon")}<b>${esc(itemName(content, inst.itemId))}</b>
          <span class="dur">${bar(inst.durability, def.durability, broken ? "bad" : "")} ${inst.durability}/${def.durability}</span>`;
        if (canRefit && !selected) actions.push(`<button ${cmdAttr({ type: "uninstall", slotId: slot.id })}>Снять</button>`);
        if (atStop && inst.durability < def.durability) {
          actions.push(`<button ${cmdAttr({ type: "repair", uid: inst.uid })}>Чинить 🔩${repairCost(content, inst, garage)}</button>`);
        }
        if (canSell && !selected) actions.push(`<button ${cmdAttr({ type: "sell", uid: inst.uid })}>Продать 🪙${sellPrice(content, inst.itemId)}</button>`);
      }
      if (selected && selectedDef && fitsHere) {
        const cost = installCost(content, selectedDef, garage);
        const label = inst ? "Заменить" : "Поставить";
        const enough = state.resources.parts >= cost;
        actions.push(`<button class="primary" ${enough ? "" : "disabled"} ${cmdAttr({ type: "install", uid: selected.uid, slotId: slot.id })}>${label} 🔩${cost}</button>`);
      }
      const cls = ["gear-slot", inst ? "filled" : "empty", selected ? (fitsHere ? "fits" : "nofit") : ""].join(" ");
      return `
        <div class="${cls}">
          <div class="slot-name">${esc(SLOT[slot.id] ?? slot.id)} <span class="muted">· ${esc(SLOT_KIND[slot.kind] ?? slot.kind)}</span></div>
          <div class="slot-body">${body}</div>
          ${actions.length ? `<div class="slot-actions">${actions.join("")}</div>` : ""}
        </div>`;
    })
    .join("");

  const inventory =
    state.inventory.length === 0
      ? '<p class="muted">Багаж пуст. Сюда попадают трофеи, покупки и снятое снаряжение.</p>'
      : `<div class="cargo">${state.inventory
          .map((inst) => {
            const def = itemDef(content, inst);
            const sel = ui.selectedItem === inst.uid;
            const freeFit = state.bus.slots.some((sl) => !state.equipment[sl.id] && fits(def, sl));
            const anyFit = state.bus.slots.some((sl) => fits(def, sl));
            const where = anyFit ? `ставится: ${esc(fitsLabel(content, inst.itemId))}${freeFit ? "" : " · свободного места нет, можно заменить"}` : "на этот автобус не ставится";
            const actions: string[] = [];
            if (canRefit && anyFit) actions.push(`<button class="${sel ? "on" : ""}" ${uiAttr("selectItem", inst.uid)}>${sel ? "Отмена" : "Установить…"}</button>`);
            if (canSell) actions.push(`<button ${cmdAttr({ type: "sell", uid: inst.uid })}>Продать 🪙${sellPrice(content, inst.itemId)}</button>`);
            return `
              <div class="cargo-item ${sel ? "selected" : ""}">
                <div>${artImg(`items/${inst.itemId}.png`, 1, "item-icon")}<b>${esc(itemName(content, inst.itemId))}</b> <span class="muted">${inst.durability}/${def.durability}</span></div>
                <div class="muted small">${where}</div>
                ${actions.length ? `<div class="slot-actions">${actions.join("")}</div>` : ""}
              </div>`;
          })
          .join("")}</div>`;

  const hint = phase === "combat"
    ? "В бою снаряжение не меняется."
    : selected
      ? `Выберите подсвеченный слот для «${esc(itemName(content, selected.itemId))}». Занятый слот — замена, старое уйдёт в багаж.`
      : canSell
        ? "Ставить и снимать — в любой момент вне боя. Здесь можно и продать."
        : "Ставить и снимать — в любой момент вне боя. Продать — на остановке или в магазине.";

  return `
    <section class="gear">
      <h3>Снаряжение</h3>
      <p class="muted small">${hint}${garage ? " В автосервисе установка и ремонт вдвое дешевле." : ""}</p>
      <div class="gear-slots">${slots}</div>
      <h4>Багаж</h4>
      ${inventory}
    </section>`;
}

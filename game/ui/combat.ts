/** Экран боя: реальное время с паузой, как в FTL. */
import {
  bandOf,
  canEscape,
  enemyEvasion,
  itemDef,
  playerEvasion,
  weaponManned,
  type CombatState,
  type RangeBand,
  type TargetRef,
} from "../../core";
import type { Store } from "../store";
import { bar, cmdAttr, esc, itemName, SLOT, SYSTEM, t, targetLabel, uiAttr } from "./text";

const BAND_LABEL: Record<RangeBand, string> = { contact: "вплотную", near: "близко", mid: "средняя", far: "далеко" };
const SOURCE_LABEL: Record<string, string> = {
  encounter: "Встреча на дороге",
  ambush: "Засада!",
  intercept: "Перехват соперника",
  boss: "Босс региона",
  nemesis: "Заклятый соперник",
};

export function renderCombat(store: Store): string {
  const { state, content, ui } = store;
  if (state.phase.type !== "combat") return "";
  const c = state.phase.combat;
  const e = c.enemy;
  const def = e.def;
  const band = bandOf(c.distance);
  const seconds = (c.tick * content.balance.combat.tickSeconds).toFixed(1);

  const targets: TargetRef[] = ["hull", "engine", "wheels", "cabin", "tank", ...e.weapons.map((_, i) => `weapon:${i}` as TargetRef)];

  const myWeapons = c.weapons
    .map((w) => {
      const inst = state.equipment[w.slotId];
      if (!inst) return "";
      const stats = itemDef(content, inst).weapon!;
      const manned = weaponManned(state, w.slotId);
      const broken = inst.durability <= 0;
      const inRange = stats.ranges.includes(band);
      const status = broken ? '<b class="warn">разбит</b>' : !manned ? '<b class="warn">пост пуст</b>' : !inRange ? '<span class="muted">не достаёт</span>' : "";
      const options = targets
        .map((tg) => `<option value="${tg}" ${tg === w.target ? "selected" : ""}>${esc(targetLabel(content, tg, e.weapons))}</option>`)
        .join("");
      return `
        <div class="weapon ${ui.aimSlot === w.slotId ? "aiming" : ""}">
          <div><b>${esc(itemName(content, inst.itemId))}</b> <span class="muted">${esc(SLOT[w.slotId] ?? w.slotId)} · ${stats.ranges.map((r) => BAND_LABEL[r]).join(", ")}${stats.ammoPerVolley ? ` · 🎯${stats.ammoPerVolley}` : ""}</span> ${status}</div>
          <div>заряд ${bar(w.charge, stats.charge, "charge")} прочность ${inst.durability}/${itemDef(content, inst).durability}</div>
          <label>цель <select data-target-slot="${esc(w.slotId)}">${options}</select></label>
        </div>`;
    })
    .join("");

  const enemySystems = (["hull", "engine", "wheels", "cabin", "tank"] as const)
    .map((k) => {
      const sys = k === "hull" ? e.hull : e.systems[k];
      return `<div class="esys ${sys.hp <= 0 ? "broken" : ""}">${esc(SYSTEM[k]!)} ${bar(sys.hp, sys.max, "enemy")} ${sys.hp}/${sys.max}</div>`;
    })
    .join("");
  const enemyWeapons = e.weapons
    .map((w) => {
      const stats = content.items[w.itemId]!.weapon!;
      return `<div class="esys ${w.hp <= 0 || w.disabled ? "broken" : ""}">🔫 ${esc(itemName(content, w.itemId))}${w.disabled ? " (отключено)" : ""} ${bar(w.charge, stats.charge, "charge")} ${w.hp}/${w.max}</div>`;
    })
    .join("");
  const intent = targetLabel(content, e.weapons[0]?.target ?? "hull", undefined, state.equipment);
  const emptyPosts = c.weapons.some((w) => {
    const inst = state.equipment[w.slotId];
    return inst && inst.durability > 0 && !weaponManned(state, w.slotId);
  });
  const effects = [
    c.status.tethered > 0 ? "вас сцепили гарпуном" : "",
    e.status.tethered > 0 ? "враг сцеплен" : "",
    c.status.slowed > 0 ? "вы замедлены" : "",
    e.status.slowed > 0 ? "враг замедлен" : "",
    c.status.burning.length ? "у вас пожар" : "",
    e.status.burning.length ? "враг горит" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const man = (m: string, label: string) =>
    `<button class="${c.maneuver === m ? "on" : ""}" ${cmdAttr({ type: "setManeuver", maneuver: m })}>${label}</button>`;
  const escapeMax = content.balance.combat.escapeTicks;
  const escapeReady = canEscape(c, content);

  const log = state.log
    .slice(-6)
    .map((l) => `<li>${esc(l.text)}</li>`)
    .join("");

  return `
    <section class="combat">
      <div class="combat-head">
        <h2>${esc(SOURCE_LABEL[c.source] ?? c.source)}: ${esc(t(content, e.name))}</h2>
        <div class="time">
          <button class="primary" ${uiAttr("togglePause")}>${ui.paused ? "▶ Продолжить" : "⏸ Пауза"}</button>
          ${[1, 2, 4].map((s) => `<button class="${ui.speed === s ? "on" : ""}" ${uiAttr("speed", s)}>×${s}</button>`).join("")}
          <span class="muted">${seconds} с · пробел — пауза</span>
        </div>
      </div>
      <div class="combat-grid">
        <div class="col">
          <h3>Ваши стволы</h3>
          ${emptyPosts ? `<button class="primary" ${uiAttr("autoMan")}>Посадить людей к оружию</button>` : ""}
          ${myWeapons || '<p class="muted">Оружия нет.</p>'}
          <h4>Манёвр</h4>
          <div class="row">${man("approach", "Сближаться")}${man("hold", "Держаться")}${man("retreat", "Отходить")}</div>
          <p>Дистанция: <b>${BAND_LABEL[band]}</b> · ваше уклонение ${Math.round(playerEvasion(state, content) * 100)}%</p>
          <p>Отрыв ${bar(c.escape, escapeMax, "escape")}
            <button ${escapeReady ? "" : "disabled"} ${cmdAttr({ type: "escape" })}>${c.source === "boss" ? "От босса не уйти" : "Оторваться"}</button></p>
        </div>
        <div class="col">
          <h3>Враг</h3>
          <p class="intent">Намерение: целится в <b>${esc(intent)}</b></p>
          ${enemySystems}
          ${enemyWeapons}
          <p class="muted">Уклонение ${Math.round(enemyEvasion(content, c) * 100)}% · броня ${def.armor} · хочет дистанцию «${BAND_LABEL[e.preferredRange]}»</p>
          ${effects ? `<p class="warn">${esc(effects)}</p>` : ""}
          <ul class="log">${log}</ul>
        </div>
      </div>
    </section>`;
}

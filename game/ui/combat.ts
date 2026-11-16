/** Экран боя: реальное время с паузой, как в FTL. */
import {
  bandOf,
  canEscape,
  occupant,
  enemyEvasion,
  itemDef,
  playerEvasion,
  weaponManned,
  type CombatState,
  type EnemyState,
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
  const band = bandOf(c.distance);
  const seconds = (c.tick * content.balance.combat.tickSeconds).toFixed(1);
  const gang = c.enemies.length > 1;
  const enemyName = (e: EnemyState) => t(content, e.name);
  const targetsOf = (e: EnemyState): TargetRef[] => ["hull", "engine", "wheels", "cabin", "tank", ...e.weapons.map((_, i) => `weapon:${i}` as TargetRef)];

  const cb = content.balance.combat;
  const repairCost = cb.fieldRepairParts;
  const canPatch = state.resources.parts >= repairCost;
  const myWeapons = c.weapons
    .map((w) => {
      const inst = state.equipment[w.slotId];
      if (!inst) return "";
      const maxDur = itemDef(content, inst).durability;
      const stats = itemDef(content, inst).weapon!;
      const manned = weaponManned(state, w.slotId);
      const broken = inst.durability <= 0;
      const inRange = stats.ranges.includes(band);
      // Разбитый ствол латает стрелок на посту — показываем, сколько осталось.
      const gunnerFix = broken && manned ? ` · стрелок латает ${bar(w.repairTimer, cb.gunnerRepairTicks, "repair")}` : "";
      const status = broken
        ? `<b class="warn">разбит</b>${gunnerFix || ' <span class="muted">· некому латать</span>'}`
        : !manned
          ? '<b class="warn">пост пуст</b>'
          : !inRange
            ? '<span class="muted">не достаёт</span>'
            : "";
      const patch =
        inst.durability < maxDur
          ? `<button class="${broken ? "primary" : ""}" ${canPatch ? "" : "disabled"} title="Сразу +1 прочности за ${repairCost} запч." ${cmdAttr({ type: "fieldRepair", slotId: w.slotId })}>Залатать (🔩${repairCost})</button>`
          : "";
      // Значение — «враг|цель»; у банды цели сгруппированы по автобусам.
      const optionsFor = (e: EnemyState, ei: number) =>
        targetsOf(e)
          .map((tg) => {
            const sel = ei === w.enemy && tg === w.target ? "selected" : "";
            return `<option value="${ei}|${tg}" ${sel}>${esc(targetLabel(content, tg, e.weapons))}</option>`;
          })
          .join("");
      const options = gang
        ? c.enemies
            .map((e, ei) => (e.out === null ? `<optgroup label="${esc(enemyName(e))}">${optionsFor(e, ei)}</optgroup>` : ""))
            .join("")
        : optionsFor(c.enemies[0]!, 0);
      return `
        <div class="weapon ${ui.aimSlot === w.slotId ? "aiming" : ""}">
          <div><b>${esc(itemName(content, inst.itemId))}</b> <span class="muted">${esc(SLOT[w.slotId] ?? w.slotId)} · ${stats.ranges.map((r) => BAND_LABEL[r]).join(", ")}${stats.ammoPerVolley ? ` · 🎯${stats.ammoPerVolley}` : ""}</span> ${status}</div>
          <div>заряд ${bar(w.charge, stats.charge, "charge")} прочность ${inst.durability}/${maxDur} ${patch}</div>
          <label>цель <select data-target-slot="${esc(w.slotId)}">${options}</select></label>
        </div>`;
    })
    .join("");

  const OUT_LABEL: Record<string, string> = { destroyed: "разбит", surrendered: "сдался", fled: "ушёл" };
  const enemyBlock = (e: EnemyState) => {
    const head = gang ? `<h4>${esc(enemyName(e))}${e.out ? ` — <span class="muted">${OUT_LABEL[e.out]}</span>` : ""}</h4>` : "";
    if (e.out) return `<div class="enemy-card out">${head}</div>`;
    const systems = (["hull", "engine", "wheels", "cabin", "tank"] as const)
      .map((k) => {
        const sys = k === "hull" ? e.hull : e.systems[k];
        return `<div class="esys ${sys.hp <= 0 ? "broken" : ""}">${esc(SYSTEM[k]!)} ${bar(sys.hp, sys.max, "enemy")} ${sys.hp}/${sys.max}</div>`;
      })
      .join("");
    const weapons = e.weapons
      .map((w) => {
        const stats = content.items[w.itemId]!.weapon!;
        return `<div class="esys ${w.hp <= 0 || w.disabled ? "broken" : ""}">🔫 ${esc(itemName(content, w.itemId))}${w.disabled ? " (отключено)" : ""} ${bar(w.charge, stats.charge, "charge")} ${w.hp}/${w.max}</div>`;
      })
      .join("");
    const intent = targetLabel(content, e.weapons[0]?.target ?? "hull", undefined, state.equipment);
    const fx = [e.status.tethered > 0 ? "сцеплен" : "", e.status.slowed > 0 ? "замедлен" : "", e.status.burning.length ? "горит" : ""]
      .filter(Boolean)
      .join(", ");
    return `
      <div class="enemy-card">
        ${head}
        <p class="intent">Намерение: целится в <b>${esc(intent)}</b></p>
        ${systems}
        ${weapons}
        <p class="muted">Уклонение ${Math.round(enemyEvasion(content, e) * 100)}% · броня ${e.def.armor} · хочет дистанцию «${BAND_LABEL[e.preferredRange]}»${fx ? ` · <span class="warn">${fx}</span>` : ""}</p>
      </div>`;
  };
  const emptyPosts = c.weapons.some((w) => {
    const inst = state.equipment[w.slotId];
    return inst && inst.durability > 0 && !weaponManned(state, w.slotId);
  });
  const effects = [
    c.status.tethered > 0 ? "вас сцепили гарпуном" : "",
    c.status.slowed > 0 ? "вы замедлены" : "",
    c.status.burning.length ? "у вас пожар" : "",
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
        <h2>${esc(gang ? "Банда" : SOURCE_LABEL[c.source] ?? c.source)}: ${esc(c.enemies.map(enemyName).join(" и "))}</h2>
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
          ${mechanicRow(store, c)}
          <h4>Манёвр</h4>
          <div class="row">${man("approach", "Сближаться")}${man("hold", "Держаться")}${man("retreat", "Отходить")}</div>
          <p>Дистанция: <b>${BAND_LABEL[band]}</b> · ваше уклонение ${Math.round(playerEvasion(state, content) * 100)}%</p>
          <p>Отрыв ${bar(c.escape, escapeMax, "escape")}
            <button ${escapeReady ? "" : "disabled"} ${cmdAttr({ type: "escape" })}>${c.source === "boss" ? "От босса не уйти" : "Оторваться"}</button></p>
        </div>
        <div class="col">
          <h3>${gang ? `Враги (${c.enemies.filter((e) => e.out === null).length} в строю)` : "Враг"}</h3>
          ${c.enemies.map(enemyBlock).join("")}
          ${effects ? `<p class="warn">${esc(effects)}</p>` : ""}
          <ul class="log">${log}</ul>
        </div>
      </div>
    </section>`;
}

/** Механик в бою: что чинит в первую очередь и сидит ли он на посту. */
function mechanicRow(store: Store, c: CombatState): string {
  const { state, content } = store;
  const seat = state.bus.seats.find((x) => x.role === "mechanic");
  const mech = seat ? occupant(state, seat.id) : undefined;
  const working = mech !== undefined;
  const every = content.balance.combat.mechanicRepairTicks;
  const btn = (focus: "systems" | "weapons", label: string) =>
    `<button class="${c.mechanicFocus === focus ? "on" : ""}" ${cmdAttr({ type: "setMechanicFocus", focus })}>${label}</button>`;
  const note = working
    ? `${bar(c.mechanicTimer, every, "repair")} <span class="muted">+1 раз в ${(every * content.balance.combat.tickSeconds).toFixed(0)} с</span>`
    : '<b class="warn">пост механика пуст</b>';
  return `
    <h4>Механик чинит</h4>
    <div class="row">${btn("systems", "Сначала системы")}${btn("weapons", "Сначала оружие")} ${note}</div>`;
}

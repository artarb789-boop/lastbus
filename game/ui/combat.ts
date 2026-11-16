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
};

const W = 900;
const H = 170;

function scene(store: Store, c: CombatState): string {
  const { state, content } = store;
  const def = content.enemies[c.enemy.enemyId]!;
  const px = 110;
  const ex = px + 170 + c.distance * 160;
  const bands = (["contact", "near", "mid", "far"] as RangeBand[])
    .map((b, i) => {
      const x0 = px + 170 + Math.max(0, i - 0.5) * 160;
      const x1 = px + 170 + Math.min(3, i + 0.5) * 160;
      return `<rect class="band ${bandOf(c.distance) === b ? "active" : ""}" x="${x0}" y="138" width="${x1 - x0}" height="20"/><text class="band-label" x="${(x0 + x1) / 2}" y="152">${BAND_LABEL[b]}</text>`;
    })
    .join("");
  const busShape = (x: number, cls: string, label: string, hp: number, max: number, flip: boolean) => `
    <g class="vehicle ${cls}" transform="translate(${x},78)">
      <rect x="-80" y="-30" width="160" height="50" rx="8"/>
      ${[-55, -25, 5, 35].map((wx) => `<rect class="window" x="${flip ? -wx - 20 : wx}" y="-22" width="20" height="16" rx="2"/>`).join("")}
      <circle class="wheel" cx="-50" cy="22" r="10"/><circle class="wheel" cx="50" cy="22" r="10"/>
      <text class="vlabel" y="-40">${esc(label)}</text>
      <rect class="hpbg" x="-80" y="-62" width="160" height="7"/>
      <rect class="hp" x="-80" y="-62" width="${(160 * Math.max(0, hp)) / max}" height="7"/>
    </g>`;
  const tether = c.status.tethered > 0 || c.enemy.status.tethered > 0 ? `<line class="tether" x1="${px + 80}" y1="78" x2="${ex - 80}" y2="78"/>` : "";
  return `
    <svg class="scene" viewBox="0 0 ${W} ${H}">
      <rect class="road" x="0" y="100" width="${W}" height="36"/>
      <line class="lane" x1="0" y1="118" x2="${W}" y2="118"/>
      ${bands}
      ${tether}
      ${busShape(px, "player", "Ваш автобус", state.hull.hp, state.hull.max, false)}
      ${busShape(ex, "enemy", t(content, def.nameKey), c.enemy.hull.hp, c.enemy.hull.max, true)}
    </svg>`;
}

export function renderCombat(store: Store): string {
  const { state, content, ui } = store;
  if (state.phase.type !== "combat") return "";
  const c = state.phase.combat;
  const e = c.enemy;
  const def = content.enemies[e.enemyId]!;
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
        <h2>${esc(SOURCE_LABEL[c.source] ?? c.source)}: ${esc(t(content, def.nameKey))}</h2>
        <div class="time">
          <button class="primary" ${uiAttr("togglePause")}>${ui.paused ? "▶ Продолжить" : "⏸ Пауза"}</button>
          ${[1, 2, 4].map((s) => `<button class="${ui.speed === s ? "on" : ""}" ${uiAttr("speed", s)}>×${s}</button>`).join("")}
          <span class="muted">${seconds} с · пробел — пауза</span>
        </div>
      </div>
      ${scene(store, c)}
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

/**
 * Перекрёстная проверка контента: то, что JSON Schema проверить не может.
 * Ссылки между файлами, наличие текстов, достижимость вариантов событий.
 */
import type { Content, EventEffect, ItemKind } from "./content";
import { STOP_KINDS } from "./state";

export function checkContent(c: Content): string[] {
  const errors: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
  const hasText = (key: string) => typeof c.locale[key] === "string" && c.locale[key]!.length > 0;
  const items = Object.values(c.items);
  const allTags = new Set(items.flatMap((i) => i.tags));
  const kindsWithItems = new Set<ItemKind>(items.map((i) => i.kind));

  // ---- Баланс ----
  const b = c.balance;
  if (b.ticketMin > b.ticketMax) err("balance", "ticketMin > ticketMax");
  if (b.region.minPerColumn > b.region.maxPerColumn) err("balance", "region.minPerColumn > maxPerColumn");
  for (const k of STOP_KINDS) {
    const [lo, hi] = b.boarding[k];
    if (lo > hi) err("balance", `boarding.${k} min > max`);
    const total = Object.values(b.scavengeTables[k]).reduce((s, w) => s + (w ?? 0), 0);
    if (total <= 0) err("balance", `scavengeTables.${k} has zero total weight`);
  }
  if (Object.values(b.nodeWeights).reduce((s, w) => s + (w ?? 0), 0) <= 0) err("balance", "nodeWeights sum to zero");

  // ---- Предметы ----
  for (const item of items) {
    const where = `item ${item.id}`;
    if (!hasText(item.nameKey)) err(where, `missing text ${item.nameKey}`);
    if (!hasText(item.descKey)) err(where, `missing text ${item.descKey}`);
  }

  // ---- Автобусы ----
  for (const bus of Object.values(c.buses)) {
    const where = `bus ${bus.id}`;
    if (!hasText(bus.nameKey)) err(where, `missing text ${bus.nameKey}`);
    const seatIds = new Set<string>();
    for (const s of bus.seats) {
      if (seatIds.has(s.id)) err(where, `duplicate seat ${s.id}`);
      seatIds.add(s.id);
      if (s.id !== `r${s.row}c${s.col}`) err(where, `seat id ${s.id} does not match row/col`);
      if (s.row >= bus.rows || s.col >= bus.cols) err(where, `seat ${s.id} outside grid`);
    }
    if (bus.seats.filter((s) => s.role === "driver").length !== 1) err(where, "must have exactly one driver seat");
    const slotIds = new Map(bus.slots.map((s) => [s.id, s] as const));
    for (const s of bus.seats) {
      if (s.role === "weapon" && !s.slot) err(where, `weapon post ${s.id} has no slot`);
      if (s.slot && !slotIds.has(s.slot)) err(where, `seat ${s.id} references unknown slot ${s.slot}`);
    }
    for (const slot of bus.slots) {
      for (const seatId of slot.covers ?? []) {
        if (!seatIds.has(seatId)) err(where, `slot ${slot.id} covers unknown seat ${seatId}`);
      }
    }
    for (const [slotId, itemId] of Object.entries(bus.startEquipment)) {
      const slot = slotIds.get(slotId);
      const item = c.items[itemId];
      if (!slot) err(where, `startEquipment uses unknown slot ${slotId}`);
      if (!item) err(where, `startEquipment uses unknown item ${itemId}`);
      if (slot && item && !item.slotKinds.includes(slot.kind)) err(where, `${itemId} does not fit slot ${slotId}`);
    }
  }

  // ---- Магазины ----
  for (const shop of Object.values(c.shops)) {
    const where = `shop ${shop.id}`;
    if (!hasText(shop.nameKey)) err(where, `missing text ${shop.nameKey}`);
    for (const st of shop.stock) {
      if (st.type === "resource" && st.amount[0] > st.amount[1]) err(where, "amount min > max");
      if (st.type === "item") {
        if (st.count[0] > st.count[1]) err(where, "count min > max");
        if (!st.itemKinds.some((k) => kindsWithItems.has(k))) err(where, `no items of kinds ${st.itemKinds.join(",")}`);
      }
    }
  }

  // ---- Враги ----
  const enemies = Object.values(c.enemies);
  if (!enemies.some((e) => e.kind === "boss")) err("enemies", "need at least one boss");
  if (!enemies.some((e) => e.kind !== "boss")) err("enemies", "need at least one regular enemy");
  for (const e of enemies) {
    const where = `enemy ${e.id}`;
    if (!hasText(e.nameKey)) err(where, `missing text ${e.nameKey}`);
    for (const w of e.weapons) {
      const item = c.items[w];
      if (!item) err(where, `unknown weapon ${w}`);
      else if (item.kind !== "weapon" || !item.weapon) err(where, `${w} is not a weapon`);
    }
    for (const [k, r] of Object.entries(e.loot.resources)) if (r && r[0] > r[1]) err(where, `loot ${k} min > max`);
    if (e.loot.survivors[0] > e.loot.survivors[1]) err(where, "loot survivors min > max");
    if (e.kind === "boss" && (e.fleeAtHull !== undefined || e.surrenderAtHull !== undefined)) {
      err(where, "a boss cannot flee or surrender");
    }
  }

  // ---- Заклятый соперник ----
  const nem = c.balance.nemesis;
  const tmpl = c.enemies[nem.template];
  if (!tmpl) err("balance.nemesis", `unknown template ${nem.template}`);
  else if (tmpl.kind !== "nemesis") err("balance.nemesis", `template ${nem.template} must have kind "nemesis"`);
  for (const k of nem.names) if (!hasText(k)) err("balance.nemesis", `missing text ${k}`);
  for (const ws of nem.bonusWeapons) for (const w of ws) if (!c.items[w]?.weapon) err("balance.nemesis", `unknown weapon ${w}`);
  if (!c.items[nem.finalTrophy]) err("balance.nemesis", `unknown trophy ${nem.finalTrophy}`);
  const cols = nem.meetColumns;
  if (cols.some((col, i) => i > 0 && col <= cols[i - 1]!)) err("balance.nemesis", "meetColumns must increase");
  if (cols.some((col) => col >= c.balance.region.columns - 1)) err("balance.nemesis", "meetColumns must be before the boss column");

  // ---- Водители ----
  if (Object.keys(c.drivers).length === 0) err("drivers", "need at least one driver");
  for (const d of Object.values(c.drivers)) {
    const where = `driver ${d.id}`;
    if (!hasText(d.nameKey)) err(where, `missing text ${d.nameKey}`);
    if (!hasText(d.descKey)) err(where, `missing text ${d.descKey}`);
    for (const perk of d.perks) {
      if (perk.type !== "startEquipment") continue;
      const item = c.items[perk.item];
      if (!item) err(where, `unknown item ${perk.item}`);
      for (const bus of Object.values(c.buses)) {
        const slot = bus.slots.find((s) => s.id === perk.slot);
        if (!slot) err(where, `bus ${bus.id} has no slot ${perk.slot}`);
        else if (item && !item.slotKinds.includes(slot.kind)) err(where, `${perk.item} does not fit ${perk.slot}`);
      }
    }
  }

  // ---- Оружие и броня ----
  for (const item of items) {
    if (item.kind === "armor" && !item.armor) err(`item ${item.id}`, "armor item needs armor.rating");
    if (item.kind !== "armor" && item.armor) err(`item ${item.id}`, "only armor items may have armor.rating");
  }

  // ---- События ----
  const eventIds = new Set<string>();
  for (const ev of c.events) {
    const where = `event ${ev.id}`;
    if (eventIds.has(ev.id)) err(where, "duplicate id");
    eventIds.add(ev.id);
    if (!hasText(ev.textKey)) err(where, `missing text ${ev.textKey}`);
    if (!ev.choices.some((ch) => !ch.requires)) err(where, "needs at least one choice without requirements");
    for (const cond of ev.conditions) {
      if (cond.type === "hasItemTag" && !allTags.has(cond.tag)) err(where, `condition uses unknown tag ${cond.tag}`);
    }
    for (const ch of ev.choices) {
      if (!hasText(ch.textKey)) err(where, `missing text ${ch.textKey}`);
      if (ch.requires?.itemTag && !allTags.has(ch.requires.itemTag)) err(where, `requires unknown tag ${ch.requires.itemTag}`);
      const effects: EventEffect[] = [...(ch.effects ?? []), ...(ch.success ?? []), ...(ch.fail ?? [])];
      for (const eff of effects) {
        if (eff.type === "gainItem") {
          if (eff.itemId && !c.items[eff.itemId]) err(where, `gainItem unknown item ${eff.itemId}`);
          if (!eff.itemId && !eff.itemKinds) err(where, "gainItem needs itemId or itemKinds");
          if (eff.itemKinds && !eff.itemKinds.some((k) => kindsWithItems.has(k))) err(where, "gainItem kinds have no items");
        }
        if (eff.type === "loseActions" && ev.kind === "road") err(where, "loseActions only makes sense at a stop (stop/special events)");
      }
    }
  }

  return errors;
}

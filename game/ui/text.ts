/** Подписи интерфейса и помощники для HTML. */
import type { Content, NodeKind, ResourceKind, RoadType, ShopKind, TargetRef } from "../../core";

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** Атрибут с командой для общего обработчика кликов. */
export function cmdAttr(cmd: object): string {
  return `data-cmd="${esc(JSON.stringify(cmd))}"`;
}

/** Атрибут с действием интерфейса (без команды в ядро). */
export function uiAttr(action: string, value: string | number = ""): string {
  return `data-ui="${esc(action)}" data-value="${esc(value)}"`;
}

export function t(content: Content, key: string): string {
  return content.locale[key] ?? key;
}

export function itemName(content: Content, itemId: string): string {
  const def = content.items[itemId];
  return def ? t(content, def.nameKey) : itemId;
}

export const RES: Record<ResourceKind, { label: string; icon: string }> = {
  fuel: { label: "Топливо", icon: "⛽" },
  food: { label: "Еда", icon: "🥫" },
  parts: { label: "Запчасти", icon: "🔩" },
  ammo: { label: "Боеприпасы", icon: "🎯" },
  medkits: { label: "Аптечки", icon: "✚" },
  tokens: { label: "Жетоны", icon: "🪙" },
};

export const NODE: Record<NodeKind, { label: string; icon: string }> = {
  start: { label: "Старт", icon: "●" },
  village: { label: "Посёлок", icon: "🏘" },
  garage: { label: "Автосервис", icon: "🔧" },
  junkyard: { label: "Свалка", icon: "🗑" },
  checkpoint: { label: "Блокпост", icon: "🚧" },
  special: { label: "Особое место", icon: "★" },
  encounter: { label: "Встреча", icon: "⚔" },
  incident: { label: "Происшествие", icon: "⚠" },
  boss: { label: "Босс", icon: "💀" },
};

export const ROAD: Record<RoadType, string> = {
  highway: "трасса",
  dirt: "грунтовка",
  bridge: "мост",
  detour: "объезд",
};

export const SHOP: Record<ShopKind, string> = {
  kiosk: "Ларёк",
  gunsmith: "Оружейник",
  mechanic: "Механик",
  pharmacy: "Аптека",
  fleamarket: "Барахолка",
};

export const SLOT: Record<string, string> = {
  front: "Нос",
  sideL1: "Левый борт, перед",
  sideL2: "Левый борт, зад",
  sideR1: "Правый борт, перед",
  sideR2: "Правый борт, зад",
  roof: "Крыша",
  rear: "Корма",
  int1: "Внутри 1",
  int2: "Внутри 2",
};

export const SYSTEM: Record<string, string> = {
  hull: "Корпус",
  engine: "Двигатель",
  wheels: "Колёса",
  cabin: "Кабина",
  tank: "Бак",
};

/**
 * Подпись цели. Для оружия врага передайте enemyWeapons, для оружия игрока — equipment
 * (тогда покажется название ствола, а не слота).
 */
export function targetLabel(
  content: Content,
  target: TargetRef,
  enemyWeapons?: { itemId: string }[],
  equipment?: Record<string, { itemId: string } | null>,
): string {
  if (target.startsWith("weapon:")) {
    const ref = target.slice(7);
    const idx = Number(ref);
    if (enemyWeapons && Number.isInteger(idx) && enemyWeapons[idx]) return itemName(content, enemyWeapons[idx]!.itemId);
    const inst = equipment?.[ref];
    if (inst) return `${itemName(content, inst.itemId)} (${(SLOT[ref] ?? ref).toLowerCase()})`;
    return SLOT[ref] ?? ref;
  }
  return SYSTEM[target] ?? target;
}

export const ERRORS: Record<string, string> = {
  not_enough_fuel: "Не хватит топлива на этот перегон",
  not_enough_tokens: "Не хватает жетонов",
  not_enough_parts: "Не хватает запчастей",
  no_actions_left: "Действия на этой остановке закончились",
  no_medkits: "Нет аптечек",
  nobody_wounded: "Раненых нет",
  does_not_fit: "Сюда этот предмет не ставится",
  cannot_escape: "Отрыв ещё не накоплен",
  choice_unavailable: "Этот вариант сейчас недоступен",
  scavenger_not_healthy: "На обыск идут только здоровые",
  scavenge_needs_1_to_3: "На обыск нужно от 1 до 3 человек",
  driver_seat: "Место водителя занято водителем",
  not_damaged: "Чинить нечего",
};

export function bar(value: number, max: number, cls = ""): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<span class="bar ${cls}"><span style="width:${pct}%"></span></span>`;
}

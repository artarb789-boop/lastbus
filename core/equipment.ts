/**
 * Снаряжение автобуса: слоты, установка, износ, ремонт, пассивные эффекты, броня.
 */
import type { Content, ItemDef, ItemKind, SlotDef } from "./content";
import { log } from "./log";
import { chance, pick, type RngState } from "./rng";
import type { ItemInstance, RoadType, RunState } from "./state";

export function itemDef(content: Content, inst: ItemInstance): ItemDef {
  const def = content.items[inst.itemId];
  if (!def) throw new Error(`unknown item ${inst.itemId}`);
  return def;
}

export function makeItem(state: RunState, content: Content, itemId: string): ItemInstance {
  const def = content.items[itemId];
  if (!def) throw new Error(`unknown item ${itemId}`);
  return { uid: `i${state.nextUid++}`, itemId, durability: def.durability };
}

export function slotDef(state: RunState, slotId: string): SlotDef | undefined {
  return state.bus.slots.find((s) => s.id === slotId);
}

export function fits(def: ItemDef, slot: SlotDef): boolean {
  return def.slotKinds.includes(slot.kind);
}

export interface Installed {
  slot: SlotDef;
  inst: ItemInstance;
  def: ItemDef;
}

export function installed(state: RunState, content: Content): Installed[] {
  const out: Installed[] = [];
  for (const slot of state.bus.slots) {
    const inst = state.equipment[slot.id];
    if (inst) out.push({ slot, inst, def: itemDef(content, inst) });
  }
  return out;
}

/** Работающие (прочность > 0) установленные предметы. */
export function working(state: RunState, content: Content): Installed[] {
  return installed(state, content).filter((x) => x.inst.durability > 0);
}

// ---------- Пассивные эффекты ----------

function passiveValues(state: RunState, content: Content, type: string): number[] {
  return working(state, content).flatMap((x) => (x.def.passive ?? []).filter((p) => p.type === type).map((p) => p.value));
}

export function tankMax(state: RunState, content: Content): number {
  const modules = passiveValues(state, content, "tankBonus").reduce((a, b) => a + b, 0);
  return content.balance.tankBase + (state.bus.tankBonus ?? 0) + modules;
}

export function fuelMult(state: RunState, content: Content): number {
  return passiveValues(state, content, "fuelMult").reduce((a, b) => a * b, 1);
}

/** Сколько человек лечит одно действие «Лечение». */
export function healCapacity(state: RunState, content: Content): number {
  return 2 + passiveValues(state, content, "healCapacity").reduce((a, b) => a + b, 0);
}

export function hasWorkingTag(state: RunState, content: Content, tag: string): boolean {
  return working(state, content).some((x) => x.def.tags.includes(tag));
}

// ---------- Посты и броня ----------

function healthyAt(state: RunState, seatId: string): boolean {
  return state.passengers.some((p) => p.seat === seatId);
}

/**
 * Оружие стреляет, если оно цело и на посту есть кто-то живой (раненые тоже стреляют).
 * Носовое оружие (таран, шипы) работает от водителя.
 */
export function activeWeapons(state: RunState, content: Content): Installed[] {
  return working(state, content).filter((x) => {
    if (x.def.kind !== "weapon") return false;
    if (x.slot.kind === "front") return true;
    const post = state.bus.seats.find((s) => s.role === "weapon" && s.slot === x.slot.id);
    return post !== undefined && healthyAt(state, post.id);
  });
}

/** Места, закрытые целыми бронелистами. */
export function coveredSeats(state: RunState, content: Content): Set<string> {
  const covered = new Set<string>();
  for (const x of working(state, content)) {
    if (x.def.kind === "armor") for (const seatId of x.slot.covers ?? []) covered.add(seatId);
  }
  return covered;
}

export function isExposedSeat(state: RunState, seatId: string): boolean {
  const seat = state.bus.seats.find((s) => s.id === seatId);
  return seat !== undefined && state.bus.exposedCols.includes(seat.col);
}

// ---------- Износ, повреждения, ремонт ----------

export function damageItem(state: RunState, content: Content, inst: ItemInstance, amount: number, cause: string): void {
  const before = inst.durability;
  inst.durability = Math.max(0, inst.durability - amount);
  log(state, `${inst.itemId} −${before - inst.durability} durability (${cause})${inst.durability === 0 ? ", broken" : ""}`);
}

/** Повредить случайные установленные предметы. Сломанные уже не выбираются. */
export function damageRandomItems(
  state: RunState,
  content: Content,
  rng: RngState,
  count: number,
  amount: number,
  cause: string,
  kinds?: ItemKind[],
): void {
  for (let k = 0; k < count; k++) {
    const pool = working(state, content).filter((x) => !kinds || kinds.includes(x.def.kind));
    if (pool.length === 0) return;
    damageItem(state, content, pick(rng, pool).inst, amount, cause);
  }
}

/** Износ на перегоне: с шансом дороги случайный целый предмет теряет 1 прочности. */
export function wearAfterLeg(state: RunState, content: Content, road: RoadType): void {
  if (chance(state.rng, content.balance.roads[road].wearChance)) {
    damageRandomItems(state, content, state.rng, 1, 1, `wear on ${road}`);
  }
}

/**
 * Механик на посту чинит 1 прочность после каждого перегона:
 * бак, затем двигатель, колёса, кабину, затем самый повреждённый предмет. Корпус — только на остановке.
 */
export function mechanicAfterLeg(state: RunState, content: Content): void {
  const mechanicSeat = state.bus.seats.find((s) => s.role === "mechanic");
  if (!mechanicSeat || !healthyAt(state, mechanicSeat.id)) return;
  if (state.tank.durability < state.tank.max) {
    state.tank.durability += 1;
    log(state, `mechanic patched tank +1 (${state.tank.durability}/${state.tank.max})`);
    return;
  }
  for (const sys of ["engine", "wheels", "cabin"] as const) {
    if (state.systems[sys].hp < state.systems[sys].max) {
      state.systems[sys].hp += 1;
      log(state, `mechanic repaired ${sys} +1`);
      return;
    }
  }
  const damaged = installed(state, content)
    .filter((x) => x.inst.durability < x.def.durability)
    .sort((a, b) => a.inst.durability / a.def.durability - b.inst.durability / b.def.durability);
  const target = damaged[0];
  if (!target) return;
  target.inst.durability += 1;
  log(state, `mechanic repaired ${target.inst.itemId} +1`);
}

function garageMult(content: Content, atGarage: boolean): number {
  return atGarage ? content.balance.garagePartsMult : 1;
}

export function installCost(content: Content, def: ItemDef, atGarage: boolean): number {
  return Math.ceil(def.installCost.parts * garageMult(content, atGarage));
}

export function repairCost(content: Content, inst: ItemInstance, atGarage: boolean): number {
  const def = content.items[inst.itemId]!;
  const missing = def.durability - inst.durability;
  if (missing <= 0) return 0;
  const base = Math.max(1, Math.ceil(missing / content.balance.repairDurabilityPerPart));
  return Math.max(1, Math.ceil(base * garageMult(content, atGarage)));
}

/** Где лежит предмет: в слоте или в багаже. */
export function locateItem(
  state: RunState,
  uid: string,
): { where: "slot"; slotId: string; inst: ItemInstance } | { where: "inventory"; index: number; inst: ItemInstance } | null {
  for (const [slotId, inst] of Object.entries(state.equipment)) {
    if (inst?.uid === uid) return { where: "slot", slotId, inst };
  }
  const index = state.inventory.findIndex((i) => i.uid === uid);
  if (index >= 0) return { where: "inventory", index, inst: state.inventory[index]! };
  return null;
}

export function itemsOfKinds(content: Content, kinds: readonly ItemKind[]): ItemDef[] {
  return Object.values(content.items)
    .filter((i) => kinds.includes(i.kind))
    .sort((a, b) => a.id.localeCompare(b.id));
}

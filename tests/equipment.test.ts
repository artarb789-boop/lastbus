import { describe, expect, it } from "vitest";
import { activeWeapons, applyCommand, coveredSeats, fuelCost, repairCost, tankMax } from "../core";
import { harmRandom } from "../core/crew";
import { makeItem } from "../core/equipment";
import { content, drive, quietContent, runOn } from "./helpers";

const c = quietContent;

describe("установка и снятие", () => {
  it("установка на остановке тратит только запчасти (не действия), старый предмет уходит в багаж", () => {
    const s = runOn(1, ["start", "village", "boss"]);
    drive(s);
    const rockets = makeItem(s, c, "wpn_rockets");
    s.inventory.push(rockets);
    s.resources.parts = 10;
    const actions = s.phase.type === "stop" ? s.phase.actionsLeft : -1;
    expect(applyCommand(s, { type: "install", uid: rockets.uid, slotId: "roof" }, c).ok).toBe(true);
    expect(s.equipment.roof?.itemId).toBe("wpn_rockets");
    expect(s.inventory.map((i) => i.itemId)).toEqual(["wpn_mg"]);
    expect(s.resources.parts).toBe(10 - content.items.wpn_rockets!.installCost.parts);
    expect(s.phase.type === "stop" && s.phase.actionsLeft).toBe(actions);
  });

  it("предмет не ставится в слот чужого вида", () => {
    const s = runOn(2, ["start", "village", "boss"]);
    drive(s);
    const ram = makeItem(s, c, "wpn_ram");
    s.inventory.push(ram);
    expect(applyCommand(s, { type: "install", uid: ram.uid, slotId: "roof" }, c)).toEqual({ ok: false, error: "does_not_fit" });
  });

  it("в автосервисе установка дешевле", () => {
    const s = runOn(3, ["start", "garage", "boss"]);
    drive(s);
    const tank = makeItem(s, c, "mod_tuned_engine");
    s.inventory.push(tank);
    s.resources.parts = 10;
    applyCommand(s, { type: "install", uid: tank.uid, slotId: "int1" }, c);
    const full = content.items.mod_tuned_engine!.installCost.parts;
    expect(s.resources.parts).toBe(10 - Math.ceil(full * content.balance.garagePartsMult));
  });

  it("в магазине установка не тратит действий", () => {
    const s = runOn(4, ["start", "village", "boss"]);
    s.map.edges[0]!.shop = "mechanic";
    applyCommand(s, { type: "chooseRoute", edgeId: "e0" }, c);
    const plate = makeItem(s, c, "arm_plate_light");
    s.inventory.push(plate);
    expect(applyCommand(s, { type: "install", uid: plate.uid, slotId: "sideL1" }, c).ok).toBe(true);
    expect(s.phase.type).toBe("shop");
  });

  it("снятие бесплатно и кладёт предмет в багаж", () => {
    const s = runOn(5, ["start", "village", "boss"]);
    expect(applyCommand(s, { type: "uninstall", slotId: "roof" }, c).ok).toBe(true);
    expect(s.equipment.roof).toBeNull();
    expect(s.inventory[0]?.itemId).toBe("wpn_mg");
  });
});

describe("пассивные эффекты и вес", () => {
  it("большой бак увеличивает вместимость, пока цел", () => {
    const s = runOn(6, ["start", "village", "boss"]);
    s.equipment.int1 = makeItem(s, c, "mod_big_tank");
    expect(tankMax(s, c)).toBe(content.balance.tankBase + 30);
    s.equipment.int1.durability = 0;
    expect(tankMax(s, c)).toBe(content.balance.tankBase);
  });

  it("перебранный двигатель снижает расход", () => {
    const s = runOn(7, ["start", "village", "boss"]);
    const edge = s.map.edges[0]!;
    edge.road = "detour";
    const before = fuelCost(s, c, edge);
    s.equipment.int1 = makeItem(s, c, "mod_tuned_engine");
    expect(fuelCost(s, c, edge)).toBeLessThan(before);
  });

  it("веса нет: пассажиры, груз и снаряжение не меняют расход", () => {
    const s = runOn(8, ["start", "village", "boss"]);
    const edge = s.map.edges[0]!;
    const before = fuelCost(s, c, edge);
    s.inventory.push(makeItem(s, c, "arm_plate_heavy"));
    s.equipment.sideL1 = makeItem(s, c, "arm_plate_heavy");
    s.resources.food = 500;
    s.resources.parts = 500;
    for (let i = 0; i < 10; i++) s.passengers.push({ ...s.passengers[0]!, id: `x${i}`, seat: `r${i % 4}c1` });
    expect(fuelCost(s, c, edge)).toBe(before);
    expect(before).toBe(content.balance.roads[edge.road].fuel);
  });

  it("рывок к спорному узлу стоит дороже", () => {
    const s = runOn(9, ["start", "village", "boss"]);
    const edge = s.map.edges[0]!;
    expect(fuelCost(s, c, edge, "rush")).toBeGreaterThan(fuelCost(s, c, edge, "normal"));
  });
});

describe("посты и броня", () => {
  it("оружие стреляет, только если пост занят здоровым", () => {
    const s = runOn(10, ["start", "village", "boss"]);
    const post = s.bus.seats.find((x) => x.slot === "roof")!;
    s.passengers.forEach((p, i) => (p.seat = `r${i}c1`));
    expect(activeWeapons(s, c)).toHaveLength(0);
    s.passengers[0]!.seat = post.id;
    expect(activeWeapons(s, c)).toHaveLength(1);
    s.passengers[0]!.status = "wounded";
    expect(activeWeapons(s, c)).toHaveLength(0);
  });

  it("бронелист закрывает места у борта, сломанный — нет", () => {
    const s = runOn(11, ["start", "village", "boss"]);
    s.equipment.sideL1 = makeItem(s, c, "arm_plate_light");
    expect([...coveredSeats(s, c)].sort()).toEqual(["r0c0", "r1c0", "r2c0"]);
    s.equipment.sideL1.durability = 0;
    expect(coveredSeats(s, c).size).toBe(0);
  });

  it("попадание по салону сначала ранит открытых у борта, потом бьёт по броне", () => {
    const s = runOn(12, ["start", "village", "boss"]);
    s.passengers = s.passengers.slice(0, 2);
    s.passengers[0]!.seat = "r1c0"; // у левого борта
    s.passengers[1]!.seat = "r1c1"; // в середине
    s.equipment.sideL1 = makeItem(s, c, "arm_plate_heavy");
    harmRandom(s, c, s.rng, 1, "test");
    // Место r1c0 закрыто бронёй → урон уходит в бронелист, люди целы.
    expect(s.passengers.every((p) => p.status === "healthy")).toBe(true);
    expect(s.equipment.sideL1.durability).toBe(content.items.arm_plate_heavy!.durability - 1);

    s.equipment.sideL1 = null;
    harmRandom(s, c, s.rng, 1, "test");
    expect(s.passengers.find((p) => p.seat === "r1c0")!.status).toBe("wounded");
    expect(s.passengers.find((p) => p.seat === "r1c1")!.status).toBe("healthy");
  });
});

describe("ремонт", () => {
  it("ремонт возвращает полную прочность и не тратит действий", () => {
    const s = runOn(13, ["start", "village", "boss"]);
    drive(s);
    const mg = s.equipment.roof!;
    mg.durability = 0;
    s.resources.parts = 10;
    const cost = repairCost(c, mg, false);
    expect(applyCommand(s, { type: "repair", uid: mg.uid }, c).ok).toBe(true);
    expect(mg.durability).toBe(content.items.wpn_mg!.durability);
    expect(s.resources.parts).toBe(10 - cost);
  });

  it("целый предмет не чинится", () => {
    const s = runOn(14, ["start", "village", "boss"]);
    drive(s);
    expect(applyCommand(s, { type: "repair", uid: s.equipment.roof!.uid }, c)).toEqual({ ok: false, error: "not_damaged" });
  });

  it("механик на посту чинит по 1 после перегона", () => {
    const s = runOn(15, ["start", "village", "village", "boss"]);
    const mechSeat = s.bus.seats.find((x) => x.role === "mechanic")!;
    s.passengers[0]!.seat = mechSeat.id;
    s.passengers[0]!.ticket.stopsLeft = 99;
    s.equipment.roof!.durability = 1;
    drive(s);
    expect(s.equipment.roof!.durability).toBe(2);
  });
});

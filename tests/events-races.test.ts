import { describe, expect, it } from "vitest";
import { applyCommand, availableChoices, checkContent, eventDef, type EventDef } from "../core";
import { validateData } from "../tools/validate-data";
import { content, contentWith, drive, quietContent, runOn } from "./helpers";

describe("данные", () => {
  it("все файлы в data/ проходят схемы и перекрёстную проверку", () => {
    expect(validateData()).toEqual([]);
  });

  it("перекрёстная проверка ловит битую ссылку и пропавший текст", () => {
    const broken = contentWith((c) => {
      c.buses.bus_city!.startEquipment.roof = "wpn_missing";
      delete c.locale["ev.blockade.text"];
    });
    const errors = checkContent(broken);
    expect(errors.some((e) => e.includes("wpn_missing"))).toBe(true);
    expect(errors.some((e) => e.includes("ev.blockade.text"))).toBe(true);
  });
});

/** Контент, где в пути всегда случается заданное событие. */
function withOnlyEvent(ev: EventDef) {
  return contentWith((c) => {
    c.balance.roadEventChance = 1;
    c.balance.stopEventChance = 0;
    c.balance.combat.ambushChance = 0;
    c.balance.rivalChance = 0;
    for (const r of Object.values(c.balance.roads)) r.wearChance = 0;
    c.events = [ev];
  });
}

describe("события", () => {
  it("дорожное событие прерывает перегон, после ответа автобус прибывает", () => {
    const ev = structuredClone(content.events.find((e) => e.id === "ev_road_hitchhikers")!);
    const c = withOnlyEvent(ev);
    const s = runOn(1, ["start", "village", "boss"], c);
    s.passengers = [];
    drive(s, c);
    expect(s.phase).toMatchObject({ type: "event", eventId: ev.id });
    expect(s.nodeId).toBe("n1");
    expect(applyCommand(s, { type: "resolveChoice", choiceIndex: 0 }, c).ok).toBe(true);
    // Двое подобранных проехали ещё 0 остановок до прибытия, затем прибытие на остановку.
    expect(s.phase.type).toBe("stop");
    expect(s.stats.boarded).toBeGreaterThanOrEqual(2);
  });

  it("вариант с невыполненным требованием отклоняется", () => {
    const ev = structuredClone(content.events.find((e) => e.id === "ev_road_blockade")!);
    const c = withOnlyEvent(ev);
    const s = runOn(2, ["start", "village", "boss"], c);
    s.passengers = [];
    drive(s, c);
    expect(availableChoices(s, c, eventDef(c, ev.id))).toEqual([2]);
    expect(applyCommand(s, { type: "resolveChoice", choiceIndex: 0 }, c)).toEqual({ ok: false, error: "choice_unavailable" });
    const fuel = s.resources.fuel;
    expect(applyCommand(s, { type: "resolveChoice", choiceIndex: 2 }, c).ok).toBe(true);
    expect(s.resources.fuel).toBe(fuel - 6);
  });

  it("особая остановка открывает событие, отказ ополчению стоит действие", () => {
    const militia = content.events.find((e) => e.id === "ev_special_militia")!;
    const c = contentWith((cc) => {
      cc.balance.roadEventChance = 0;
      cc.balance.stopEventChance = 0;
      cc.balance.combat.ambushChance = 0;
      cc.balance.rivalChance = 0;
      cc.events = [militia];
    });
    const s = runOn(3, ["start", "special", "boss"], c);
    drive(s, c);
    expect(s.phase).toMatchObject({ type: "event", eventId: militia.id });
    const refuse = militia.choices.findIndex((ch) => !ch.requires);
    applyCommand(s, { type: "resolveChoice", choiceIndex: refuse }, c);
    expect(s.phase).toEqual({ type: "stop", actionsLeft: content.balance.stopActions - 1 });
  });

  it("у каждого события в данных всегда есть доступный вариант", () => {
    const s = runOn(4, ["start", "village", "boss"]);
    s.passengers = [];
    s.resources = { fuel: 0, food: 0, parts: 0, ammo: 0, medkits: 0, tokens: 0 };
    for (const k of Object.keys(s.equipment)) s.equipment[k] = null;
    for (const ev of content.events) expect(availableChoices(s, content, ev).length).toBeGreaterThan(0);
  });
});

describe("гонки за остановку", () => {
  const raceContent = contentWith((c) => {
    c.balance.roadEventChance = 0;
    c.balance.stopEventChance = 0;
    c.balance.combat.ambushChance = 0;
    c.balance.rivalChance = 1;
    for (const r of Object.values(c.balance.roads)) r.wearChance = 0;
  });

  function contestedRun(seed: number) {
    const s = runOn(seed, ["start", "village", "village", "boss"], raceContent);
    drive(s, raceContent);
    // Уезжаем с первой остановки: соперник гарантированно нацелился на следующую.
    applyCommand(s, { type: "leaveStop" }, raceContent);
    expect(s.contested).toEqual(["n2"]);
    return s;
  }

  it("обычный темп: соперник успевает первым, остаётся меньше действий", () => {
    const s = contestedRun(1);
    applyCommand(s, { type: "chooseRoute", edgeId: "e1", pace: "normal" }, raceContent);
    expect(s.phase).toEqual({ type: "stop", actionsLeft: content.balance.contestedActions });
    expect(s.stats.racesContested).toBe(1);
  });

  it("рывок: дороже по топливу, все действия", () => {
    const s = contestedRun(2);
    const fuel = s.resources.fuel;
    applyCommand(s, { type: "chooseRoute", edgeId: "e1", pace: "rush" }, raceContent);
    expect(s.phase).toEqual({ type: "stop", actionsLeft: content.balance.stopActions });
    expect(fuel - s.resources.fuel).toBeGreaterThan(content.balance.roads.highway.fuel);
  });

  it("особый темп к неспорному узлу отклоняется", () => {
    const s = runOn(3, ["start", "village", "boss"]);
    expect(applyCommand(s, { type: "chooseRoute", edgeId: "e0", pace: "rush" }, quietContent)).toEqual({
      ok: false,
      error: "not_contested",
    });
  });

  it("соперники выбирают только остановки", () => {
    const s = runOn(4, ["start", "village", "encounter", "boss"], raceContent);
    drive(s, raceContent);
    applyCommand(s, { type: "leaveStop" }, raceContent);
    expect(s.contested).toEqual([]);
  });
});

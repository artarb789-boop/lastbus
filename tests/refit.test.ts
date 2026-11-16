import { describe, expect, it } from "vitest";
import { applyCommand } from "../core";
import { makeItem } from "../core/equipment";
import { content, drive, quietContent, runOn } from "./helpers";

const c = quietContent;

describe("снаряжение вне остановок и продажа", () => {
  it("оружие ставится и снимается прямо в дороге", () => {
    const s = runOn(1, ["start", "village", "boss"]);
    expect(s.phase.type).toBe("route");
    const mg = makeItem(s, c, "wpn_mg");
    s.inventory.push(mg);
    s.resources.parts = 10;
    // Пулемёт теперь ставится и на борт.
    expect(applyCommand(s, { type: "install", uid: mg.uid, slotId: "sideR1" }, c)).toEqual({ ok: true });
    expect(s.equipment.sideR1?.itemId).toBe("wpn_mg");
    expect(applyCommand(s, { type: "uninstall", slotId: "sideR1" }, c)).toEqual({ ok: true });
    expect(s.inventory.some((i) => i.uid === mg.uid)).toBe(true);
  });

  it("таран по-прежнему только на нос", () => {
    const s = runOn(1, ["start", "village", "boss"]);
    const ram = makeItem(s, c, "wpn_ram");
    s.inventory.push(ram);
    s.resources.parts = 10;
    expect(applyCommand(s, { type: "install", uid: ram.uid, slotId: "sideR1" }, c)).toEqual({ ok: false, error: "does_not_fit" });
  });

  it("на остановке можно продать скупщику, а в дороге — нет", () => {
    const s = runOn(2, ["start", "village", "boss"]);
    const item = makeItem(s, c, "wpn_harpoon");
    s.inventory.push(item);
    expect(applyCommand(s, { type: "sell", uid: item.uid }, c).ok).toBe(false);
    drive(s);
    expect(s.phase.type).toBe("stop");
    const tokens = s.resources.tokens;
    expect(applyCommand(s, { type: "sell", uid: item.uid }, c)).toEqual({ ok: true });
    expect(s.resources.tokens).toBe(tokens + Math.floor(content.items.wpn_harpoon!.price * c.balance.sellMult));
  });

  it("трофейное оружие можно сразу продать", () => {
    const s = runOn(3, ["start", "village", "boss"]);
    s.phase = { type: "loot", loot: { resources: {}, items: ["wpn_rockets"], survivors: 0 }, result: "won", then: { type: "route" } };
    const tokens = s.resources.tokens;
    const before = s.inventory.length;
    expect(applyCommand(s, { type: "finishLoot", itemIndex: 0, takeSurvivors: false, sellItem: true }, c)).toEqual({ ok: true });
    expect(s.inventory.length).toBe(before);
    expect(s.resources.tokens).toBe(tokens + Math.floor(content.items.wpn_rockets!.price * c.balance.sellMult));
  });
});

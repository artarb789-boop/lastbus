/**
 * Простейшие боты для M0. Используют свой RNG, чтобы не влиять на RNG забега:
 * забег воспроизводится по seed и списку команд, независимо от того, кто их отдал.
 */
import {
  fuelCost,
  occupant,
  outgoingEdges,
  findNode,
  seatById,
  type Command,
  type MapEdge,
  type RunState,
} from "../core";
import { createRng, int, pick, type RngState } from "../core/rng";

export interface Bot {
  name: string;
  decide(state: RunState): Command;
}

export type BotFactory = (seed: number) => Bot;

// ---------- Общие помощники ----------

function canTake(state: RunState, edge: MapEdge): boolean {
  if (state.resources.fuel >= fuelCost(state, edge)) return true;
  // Можно рискнуть, если на перегоне магазин с топливом и есть жетоны.
  const sellsFuel = edge.shop === "kiosk" || edge.shop === "mechanic" || edge.shop === "fleamarket";
  return sellsFuel && state.resources.tokens >= 4;
}

/** Перестановки салона: здоровых — на пустые посты у оружия, раненых — с постов на защищённые места. */
function crewFix(state: RunState): Command | null {
  for (const p of state.passengers) {
    const seat = seatById(state, p.seat);
    if (p.status === "wounded" && seat && seat.role !== "plain") {
      const safe = state.bus.seats.find((s) => s.role === "plain" && !s.exposed && !occupant(state, s.id));
      if (safe) return { type: "seatPassenger", passengerId: p.id, seatId: safe.id };
    }
  }
  const emptyPosts = state.bus.seats.filter((s) => s.role === "weapon" && !occupant(state, s.id));
  for (const post of emptyPosts) {
    const idle = state.passengers.find((p) => p.status === "healthy" && seatById(state, p.seat)?.role === "plain");
    if (idle) return { type: "seatPassenger", passengerId: idle.id, seatId: post.id };
  }
  return null;
}

function needsOf(state: RunState) {
  const r = state.resources;
  const mouths = state.passengers.length + 1;
  const wounded = state.passengers.some((p) => p.status === "wounded") || state.driver.status === "wounded";
  return {
    fuel: r.fuel < 45,
    food: r.food < mouths * 2,
    medkits: wounded && r.medkits === 0,
    ammo: r.ammo < 6,
    parts: false,
    tokens: false,
  };
}

// ---------- Осторожный бот ----------

const NODE_SCORE: Record<string, number> = {
  village: 3,
  garage: 2,
  junkyard: 2,
  special: 2,
  checkpoint: 1,
  incident: 0,
  encounter: -1,
  boss: 0,
};

export function makeCarefulBot(opts: { scavengers: number; heal: boolean; name: string }): BotFactory {
  return () => ({
    name: opts.name,
    decide(state) {
      const phase = state.phase;

      if (phase.type === "shop") {
        const need = needsOf(state);
        const idx = phase.visit.offers.findIndex(
          (o) => !o.sold && o.price <= state.resources.tokens && need[o.resource],
        );
        return idx >= 0 ? { type: "buy", offerIndex: idx } : { type: "leaveShop" };
      }

      if (phase.type === "stop") {
        const fix = crewFix(state);
        if (fix) return fix;
        if (phase.actionsLeft > 0) {
          const wounded = state.passengers.some((p) => p.status === "wounded") || state.driver.status === "wounded";
          if (opts.heal && wounded && state.resources.medkits > 0) return { type: "heal" };
          const team = state.passengers.filter((p) => p.status === "healthy").slice(0, opts.scavengers);
          if (team.length > 0) return { type: "scavenge", passengerIds: team.map((p) => p.id) };
        }
        return { type: "leaveStop" };
      }

      // route
      const fix = crewFix(state);
      if (fix) return fix;
      const need = needsOf(state);
      const options = outgoingEdges(state.map, state.nodeId);
      const scored = options
        .filter((e) => canTake(state, e))
        .map((e) => {
          const kind = findNode(state.map, e.to).kind;
          let score = NODE_SCORE[kind] ?? 0;
          if (e.shop && state.resources.tokens >= 3 && (need.fuel || need.food)) score += 3;
          score -= fuelCost(state, e) / 5;
          return { e, score };
        })
        .sort((a, b) => b.score - a.score);
      const fallback = options.find((e) => e.shop !== null || state.resources.fuel >= fuelCost(state, e));
      const best = scored[0]?.e ?? fallback ?? options[0];
      if (!best) throw new Error("no outgoing edges in route phase");
      return { type: "chooseRoute", edgeId: best.id };
    },
  });
}

// ---------- Случайный бот ----------

export const randomBot: BotFactory = (seed) => {
  const rng: RngState = createRng(seed ^ 0x5eed);
  return {
    name: "random",
    decide(state) {
      const phase = state.phase;
      if (phase.type === "shop") {
        const open = phase.visit.offers.map((o, i) => ({ o, i })).filter((x) => !x.o.sold);
        if (open.length > 0 && int(rng, 0, 1) === 0) return { type: "buy", offerIndex: pick(rng, open).i };
        return { type: "leaveShop" };
      }
      if (phase.type === "stop") {
        if (phase.actionsLeft > 0 && int(rng, 0, 2) > 0) {
          const healthy = state.passengers.filter((p) => p.status === "healthy");
          if (healthy.length > 0) return { type: "scavenge", passengerIds: [pick(rng, healthy).id] };
        }
        return { type: "leaveStop" };
      }
      const options = outgoingEdges(state.map, state.nodeId);
      return { type: "chooseRoute", edgeId: pick(rng, options).id };
    },
  };
};

export const BOTS: Record<string, BotFactory> = {
  careful: makeCarefulBot({ scavengers: 2, heal: true, name: "careful" }),
  greedy: makeCarefulBot({ scavengers: 3, heal: false, name: "greedy" }),
  random: randomBot,
};

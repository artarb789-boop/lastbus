import type { Content, SeatDef } from "./content";
import { coveredSeats, damageItem, isExposedSeat, working } from "./equipment";
import { log } from "./log";
import { int, pick, type RngState } from "./rng";
import type { Passenger, RunState } from "./state";

// ---------- Места ----------

export function seatById(state: RunState, seatId: string): SeatDef | undefined {
  return state.bus.seats.find((s) => s.id === seatId);
}

export function occupant(state: RunState, seatId: string): Passenger | undefined {
  return state.passengers.find((p) => p.seat === seatId);
}

/** Свободные места для пассажиров (место водителя не в счёт). */
export function freeSeats(state: RunState): SeatDef[] {
  const taken = new Set(state.passengers.map((p) => p.seat));
  return state.bus.seats.filter((s) => s.role !== "driver" && !taken.has(s.id));
}

export function capacity(state: RunState): number {
  return state.bus.seats.filter((s) => s.role !== "driver").length;
}

/**
 * Порядок, в котором новые пассажиры сами занимают места:
 * сначала защищённые обычные, потом у бортов, посты — в последнюю очередь.
 * Расстановку по постам делает игрок.
 */
function boardingPriority(state: RunState, seat: SeatDef): number {
  if (seat.role === "plain") return isExposedSeat(state, seat.id) ? 1 : 0;
  if (seat.role === "navigator") return 2;
  return 3;
}

/** Пересадка. Если место занято — пассажиры меняются местами. */
export function movePassenger(state: RunState, passengerId: string, seatId: string): string | null {
  const p = state.passengers.find((x) => x.id === passengerId);
  if (!p) return "unknown_passenger";
  const target = seatById(state, seatId);
  if (!target) return "unknown_seat";
  if (target.role === "driver") return "driver_seat";
  if (p.seat === seatId) return null;
  const other = occupant(state, seatId);
  if (other) other.seat = p.seat;
  p.seat = seatId;
  return null;
}

// ---------- Посадка и выход ----------

export function boardPassengers(state: RunState, content: Content, count: number): Passenger[] {
  const b = content.balance;
  const seats = freeSeats(state).sort((x, y) => boardingPriority(state, x) - boardingPriority(state, y));
  const boarded: Passenger[] = [];
  for (let k = 0; k < count && k < seats.length; k++) {
    const stops = int(state.rng, b.ticketMin, b.ticketMax);
    const p: Passenger = {
      id: `p${state.nextPassengerId++}`,
      look: int(state.rng, 0, b.lookVariants - 1),
      status: "healthy",
      hp: b.passengerHp,
      maxHp: b.passengerHp,
      seat: (seats[k] as SeatDef).id,
      ticket: { stopsTotal: stops, stopsLeft: stops },
    };
    state.passengers.push(p);
    boarded.push(p);
  }
  state.stats.boarded += boarded.length;
  if (boarded.length > 0) {
    log(state, `boarded ${boarded.length}: ${boarded.map((p) => `${p.id}(${p.ticket.stopsTotal})`).join(", ")}`);
  }
  return boarded;
}

/** Оплата при выходе: farePerStop за каждую проеханную остановку, раненый платит половину. */
export function fareFor(content: Content, p: Passenger): number {
  const ridden = p.ticket.stopsTotal - p.ticket.stopsLeft;
  const fare = ridden * content.balance.farePerStop;
  return p.status === "wounded" ? Math.floor(fare / 2) : fare;
}

/** Выход с оплатой (доставлен). */
export function deliver(state: RunState, content: Content, p: Passenger): number {
  const fare = fareFor(content, p);
  state.resources.tokens += fare;
  state.stats.tokensFromFares += fare;
  state.stats.delivered += 1;
  removePassenger(state, p.id);
  return fare;
}

/** Прибытие на остановку: счётчики билетов −1, у кого дошёл до нуля — выходят и платят. */
export function tickTicketsAndExit(state: RunState, content: Content): Passenger[] {
  for (const p of state.passengers) p.ticket.stopsLeft -= 1;
  const leaving = state.passengers.filter((p) => p.ticket.stopsLeft <= 0);
  let total = 0;
  for (const p of leaving) total += deliver(state, content, p);
  if (leaving.length > 0) log(state, `exited ${leaving.length}, paid ${total} tokens`);
  return leaving;
}

export function dropEarly(state: RunState, passengerId: string): boolean {
  const p = state.passengers.find((x) => x.id === passengerId);
  if (!p) return false;
  removePassenger(state, p.id);
  state.stats.droppedEarly += 1;
  log(state, `dropped ${p.id} early, no fare`);
  return true;
}

function removePassenger(state: RunState, passengerId: string): void {
  state.passengers = state.passengers.filter((p) => p.id !== passengerId);
}

// ---------- Ранения ----------

/** Ранение отнимает 1 здоровья; на нуле пассажир погибает. Раненый продолжает работать. */
export function harm(state: RunState, p: Passenger, cause: string): void {
  p.hp -= 1;
  if (p.hp > 0) {
    p.status = "wounded";
    log(state, `${p.id} wounded (${cause}), hp ${p.hp}/${p.maxHp}`);
  } else {
    removePassenger(state, p.id);
    state.stats.died += 1;
    log(state, `${p.id} died (${cause})`);
  }
}

/** Вылечить полностью. */
export function healFull(p: Passenger): void {
  p.hp = p.maxHp;
  p.status = "healthy";
}

/** Вылечить на 1 (медик в бою). */
export function healOne(p: Passenger): void {
  p.hp = Math.min(p.maxHp, p.hp + 1);
  p.status = p.hp >= p.maxHp ? "healthy" : "wounded";
}

/**
 * Попадания по салону (GDD 8.3). Каждое попадание:
 * 1) ранит пассажира у борта, не закрытого бронёй;
 * 2) если таких нет — снимает 1 прочности с целого бронелиста;
 * 3) если брони нет — ранит любого пассажира.
 */
export function harmRandom(state: RunState, content: Content, rng: RngState, hits: number, cause: string): void {
  for (let k = 0; k < hits && state.passengers.length > 0; k++) {
    const covered = coveredSeats(state, content);
    const exposed = state.passengers.filter((p) => isExposedSeat(state, p.seat) && !covered.has(p.seat));
    if (exposed.length > 0) {
      harm(state, pick(rng, exposed), cause);
      continue;
    }
    const plates = working(state, content).filter((x) => x.def.kind === "armor");
    if (plates.length > 0) {
      damageItem(state, content, pick(rng, plates).inst, 1, cause);
      continue;
    }
    harm(state, pick(rng, state.passengers), cause);
  }
}

// ---------- Еда ----------

/**
 * Раз в foodEveryLegs перегонов каждый (включая водителя) съедает 1 еду.
 * Не хватило — человек голодает: в первый раз только отметка «голоден»,
 * при втором пропуске подряд — ранение, при третьем — гибель. Любая еда снимает голод.
 */
export function feedIfDue(state: RunState, content: Content): void {
  if (state.legs % content.balance.foodEveryLegs !== 0) return;
  let food = state.resources.food;
  // Водитель ест первым.
  if (food > 0) {
    food -= 1;
    state.driver.hungry = false;
  } else if (!state.driver.hungry) {
    state.driver.hungry = true;
    log(state, "driver hungry");
  } else {
    hurtDriver(state, "hunger");
  }
  // Кормим в порядке списка, остальные голодают.
  const unfed: string[] = [];
  for (const p of [...state.passengers]) {
    if (food > 0) {
      food -= 1;
      p.hungry = false;
      continue;
    }
    unfed.push(p.id);
    if (!p.hungry) p.hungry = true;
    else harm(state, p, "hunger");
  }
  state.resources.food = food;
  if (unfed.length > 0) log(state, `not enough food: ${unfed.length} hungry`);
}

/** Прогноз еды: через сколько перегонов следующая еда, сколько нужно и хватит ли. */
export function foodForecast(state: RunState, content: Content): { legs: number; need: number; short: number; hungry: number } {
  const every = content.balance.foodEveryLegs;
  const legs = every - (state.legs % every);
  const need = state.passengers.length + 1;
  const hungry = state.passengers.filter((p) => p.hungry).length + (state.driver.hungry ? 1 : 0);
  return { legs, need, short: Math.max(0, need - state.resources.food), hungry };
}

export function hurtDriver(state: RunState, cause: string): void {
  if (state.driver.status === "healthy") {
    state.driver.status = "wounded";
    log(state, `driver wounded (${cause})`);
  } else {
    state.phase = { type: "over", result: "lost", reason: "driver_died" };
    log(state, `driver died (${cause})`);
  }
}

// ---------- Прочее ----------

/** Кто может работать: все живые (раненые тоже). */
export function healthyPassengers(state: RunState): Passenger[] {
  return state.passengers;
}

export function navigatorManned(state: RunState): boolean {
  const seat = state.bus.seats.find((s) => s.role === "navigator");
  return seat !== undefined && state.passengers.some((p) => p.seat === seat.id);
}

import { log } from "./log";
import { int, pick, type RngState } from "./rng";
import type { Passenger, RunState, Seat } from "./state";
import { FARE_PER_STOP, FOOD_EVERY_LEGS, LOOK_VARIANTS, TICKET_MAX, TICKET_MIN } from "./stubs";

// ---------- Места ----------

export function seatById(state: RunState, seatId: string): Seat | undefined {
  return state.bus.seats.find((s) => s.id === seatId);
}

export function occupant(state: RunState, seatId: string): Passenger | undefined {
  return state.passengers.find((p) => p.seat === seatId);
}

/** Свободные места для пассажиров (место водителя не в счёт). */
export function freeSeats(state: RunState): Seat[] {
  const taken = new Set(state.passengers.map((p) => p.seat));
  return state.bus.seats.filter((s) => s.role !== "driver" && !taken.has(s.id));
}

/**
 * Порядок, в котором новые пассажиры сами занимают места:
 * сначала защищённые обычные, потом у бортов, посты — в последнюю очередь.
 * Расстановку по постам делает игрок.
 */
function boardingPriority(seat: Seat): number {
  if (seat.role === "plain") return seat.exposed ? 1 : 0;
  if (seat.role === "navigator") return 2;
  return 3;
}

export function capacity(state: RunState): number {
  return state.bus.seats.filter((s) => s.role !== "driver").length;
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

export function boardPassengers(state: RunState, count: number): Passenger[] {
  const seats = freeSeats(state).sort((a, b) => boardingPriority(a) - boardingPriority(b));
  const boarded: Passenger[] = [];
  for (let k = 0; k < count && k < seats.length; k++) {
    const stops = int(state.rng, TICKET_MIN, TICKET_MAX);
    const p: Passenger = {
      id: `p${state.nextPassengerId++}`,
      look: int(state.rng, 0, LOOK_VARIANTS - 1),
      status: "healthy",
      seat: (seats[k] as Seat).id,
      ticket: { stopsTotal: stops, stopsLeft: stops },
    };
    state.passengers.push(p);
    boarded.push(p);
  }
  state.stats.boarded += boarded.length;
  if (boarded.length > 0) log(state, `boarded ${boarded.length}: ${boarded.map((p) => `${p.id}(${p.ticket.stopsTotal})`).join(", ")}`);
  return boarded;
}

/** Оплата при выходе: 1 жетон за проеханную остановку, раненый платит половину. */
export function fareFor(p: Passenger): number {
  const ridden = p.ticket.stopsTotal - p.ticket.stopsLeft;
  const fare = ridden * FARE_PER_STOP;
  return p.status === "wounded" ? Math.floor(fare / 2) : fare;
}

/** Выход с оплатой (доставлен). */
export function deliver(state: RunState, p: Passenger): number {
  const fare = fareFor(p);
  state.resources.tokens += fare;
  state.stats.tokensFromFares += fare;
  state.stats.delivered += 1;
  removePassenger(state, p.id);
  return fare;
}

/** Прибытие на остановку: счётчики билетов −1, у кого дошёл до нуля — выходят и платят. */
export function tickTicketsAndExit(state: RunState): Passenger[] {
  for (const p of state.passengers) p.ticket.stopsLeft -= 1;
  const leaving = state.passengers.filter((p) => p.ticket.stopsLeft <= 0);
  let total = 0;
  for (const p of leaving) total += deliver(state, p);
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

/** Здоровый получает ранение, раненый погибает. */
export function harm(state: RunState, p: Passenger, cause: string): void {
  if (p.status === "healthy") {
    p.status = "wounded";
    log(state, `${p.id} wounded (${cause})`);
  } else {
    removePassenger(state, p.id);
    state.stats.died += 1;
    log(state, `${p.id} died (${cause})`);
  }
}

/** Ранить случайных пассажиров, предпочитая места у бортов. */
export function harmRandom(state: RunState, rng: RngState, count: number, cause: string): void {
  for (let k = 0; k < count && state.passengers.length > 0; k++) {
    const exposed = state.passengers.filter((p) => seatById(state, p.seat)?.exposed);
    const pool = exposed.length > 0 ? exposed : state.passengers;
    harm(state, pick(rng, pool), cause);
  }
}

// ---------- Еда ----------

/** Раз в FOOD_EVERY_LEGS перегонов каждый (включая водителя) съедает 1 еду. */
export function feedIfDue(state: RunState): void {
  if (state.legs % FOOD_EVERY_LEGS !== 0) return;
  const need = state.passengers.length + 1;
  if (state.resources.food >= need) {
    state.resources.food -= need;
    return;
  }
  let food = state.resources.food;
  state.resources.food = 0;
  // Водитель ест первым.
  if (food > 0) food -= 1;
  else hurtDriver(state, "hunger");
  const hungry = [...state.passengers];
  // Кормим в порядке списка, остальные голодают.
  const unfed = hungry.slice(Math.max(0, food));
  log(state, `not enough food: ${unfed.length} hungry`);
  for (const p of unfed) harm(state, p, "hunger");
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

// ---------- Посты ----------

export function mannedWeaponPosts(state: RunState): number {
  return state.passengers.filter((p) => p.status === "healthy" && seatById(state, p.seat)?.role === "weapon").length;
}

export function healthyPassengers(state: RunState): Passenger[] {
  return state.passengers.filter((p) => p.status === "healthy");
}
